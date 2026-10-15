import { syncPayment } from "./payment.service.js";
import { db, transaction } from "../config/database.js";
import { pagination } from "../validators/common.validator.js";
import { assert } from "../utils/error.js";
export async function remittance(actor, input) {
  return transaction(async (tx) => {
    const rider = await tx.user.findFirst({
      where: { id: input.riderId, role: "RIDER" },
    });
    assert(rider, 404, "Rider not found");
    const collected = await tx.vendorOrder.aggregate({
      where: { riderId: input.riderId },
      _sum: { codCollectedMinor: true },
    });
    const received = await tx.remittance.aggregate({
      where: { riderId: input.riderId },
      _sum: { amountMinor: true },
    });
    const outstanding =
      (collected._sum.codCollectedMinor || 0) -
      (received._sum.amountMinor || 0);
    assert(
      input.amountMinor <= outstanding,
      422,
      "Amount exceeds outstanding COD",
    );
    const row = await tx.remittance.create({
      data: { ...input, receivedBy: actor.id },
    });
    if (input.amountMinor === outstanding)
      await tx.vendorOrder.updateMany({
        where: {
          riderId: input.riderId,
          status: "DELIVERED",
          cashReceived: false,
        },
        data: { cashReceived: true },
      });
    await tx.auditLog.create({
      data: { actorId: actor.id, action: "COD_RECEIVED", entityId: row.id },
    });
    return row;
  });
}
export async function createSettlement(actor, vendorId) {
  return transaction(async (tx) => {
    const orders = await tx.vendorOrder.findMany({
      where: {
        vendorId,
        status: "DELIVERED",
        cashReceived: true,
        settlementId: null,
        OR: [
          { returnRequest: null },
          { returnRequest: { status: { in: ["REJECTED", "REFUNDED"] } } },
        ],
      },
    });
    const adjustments = await tx.vendorAdjustment.findMany({
      where: { vendorId, settlementId: null },
    });
    assert(
      orders.length || adjustments.length,
      409,
      "No reconciled orders or adjustments available for settlement",
    );
    const amountMinor =
      orders.reduce((s, o) => s + o.payableMinor, 0) +
      adjustments.reduce((n, a) => n + a.amountMinor, 0);
    assert(amountMinor > 0, 409, "No positive payable balance");
    const settlement = await tx.settlement.create({
      data: { vendorId, amountMinor, createdBy: actor.id },
    });
    await tx.vendorOrder.updateMany({
      where: { id: { in: orders.map((o) => o.id) }, settlementId: null },
      data: { settlementId: settlement.id },
    });
    await tx.vendorAdjustment.updateMany({
      where: { id: { in: adjustments.map((a) => a.id) }, settlementId: null },
      data: { settlementId: settlement.id },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "SETTLEMENT_CREATED",
        entityId: settlement.id,
      },
    });
    return settlement;
  });
}
export async function updateSettlement(actor, id, input) {
  return transaction(async (tx) => {
    const existing = await tx.settlement.findUnique({ where: { id } });
    assert(existing, 404, "Settlement not found");
    assert(
      (existing.status === "PENDING" && input.status === "PROCESSED") ||
        (existing.status === "PROCESSED" && input.status === "PAID"),
      409,
      "Invalid settlement transition",
    );
    if (input.status === "PAID")
      assert(input.reference, 422, "Payment reference required");
    const row = await tx.settlement.update({
      where: { id },
      data: {
        status: input.status,
        ...(input.status === "PAID"
          ? { reference: input.reference, paidAt: new Date() }
          : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: `SETTLEMENT_${input.status}`,
        entityId: id,
      },
    });
    return row;
  });
}
export async function refund(actor, id, input) {
  return transaction(async (tx) => {
    const order = await tx.vendorOrder.findUnique({
      where: { id },
      include: { refunds: true, returnRequest: true, order: true },
    });
    assert(
      order &&
        order.cashReceived &&
        (order.status === "DELIVERED" ||
          (order.order.paymentMethod !== "COD" &&
            ["CANCELLED", "RETURNED"].includes(order.status))),
      409,
      "Refund requires reconciled payment and a delivered or cancelled prepaid shipment",
    );
    const existing = await tx.refund.findUnique({
      where: { reference: input.reference },
    });
    if (existing) {
      assert(
        existing.vendorOrderId === id &&
          existing.amountMinor === input.amountMinor &&
          existing.reason === input.reason,
        409,
        "Refund reference already used",
      );
      return existing;
    }
    if (order.returnRequest && order.returnRequest.status !== "REJECTED")
      assert(
        order.returnRequest.status === "RECEIVED",
        409,
        "Receive the returned shipment before refunding",
      );
    const cancelledPrepaid =
      ["CANCELLED", "RETURNED"].includes(order.status) &&
      order.order.paymentMethod !== "COD";
    const refunded = order.refunds.reduce((sum, r) => sum + r.amountMinor, 0);
    assert(
      input.amountMinor + refunded <=
        (cancelledPrepaid
          ? order.totalMinor
          : order.subtotalMinor - order.discountMinor),
      422,
      "Refund exceeds product amount",
    );
    if (cancelledPrepaid)
      assert(
        input.amountMinor === order.totalMinor - refunded,
        422,
        "Cancelled prepaid shipments require a full remaining refund including delivery",
      );
    const currentNet =
      (cancelledPrepaid
        ? order.totalMinor
        : order.subtotalMinor - order.discountMinor) - refunded;
    const remainingNet = currentNet - input.amountMinor;
    const nextCommission = cancelledPrepaid
      ? 0
      : Math.floor((order.commissionMinor * remainingNet) / currentNet);
    const nextPayable = cancelledPrepaid ? 0 : remainingNet - nextCommission;
    if (order.returnRequest && order.returnRequest.status !== "REJECTED")
      assert(
        input.amountMinor === currentNet,
        422,
        "A full-shipment return must refund the remaining product amount",
      );
    const row = await tx.refund.create({
      data: { ...input, vendorOrderId: id, createdBy: actor.id },
    });
    await tx.vendorOrder.update({
      where: { id },
      data: { payableMinor: nextPayable, commissionMinor: nextCommission },
    });
    if (order.settlementId)
      await tx.vendorAdjustment.create({
        data: {
          vendorId: order.vendorId,
          refundId: row.id,
          amountMinor: nextPayable - order.payableMinor,
        },
      });
    if (order.returnRequest && order.returnRequest.status !== "REJECTED")
      await tx.returnRequest.update({
        where: { id: order.returnRequest.id },
        data: { status: "REFUNDED", refundId: row.id },
      });
    await syncPayment(tx, order.orderId);
    const parent = await tx.order.findUnique({ where: { id: order.orderId } });
    await tx.notification.create({
      data: {
        userId: parent.customerId,
        title: "Refund recorded",
        body: `Refund ${row.id}: PKR ${(input.amountMinor / 100).toFixed(2)} for shipment ${id}. Reference: ${input.reference}`,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "REFUND_RECORDED",
        entityId: row.id,
        metadata: {
          commissionReversedMinor: order.commissionMinor - nextCommission,
        },
      },
    });
    return row;
  });
}
export async function settlements(user) {
  return db.settlement.findMany({
    where: user.role === "VENDOR" ? { vendorId: user.vendor.id } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      adjustments: true,
      orders: {
        select: {
          id: true,
          subtotalMinor: true,
          discountMinor: true,
          commissionMinor: true,
          payableMinor: true,
        },
      },
    },
  });
}
export async function vendorSummary(user) {
  const vendorId = user.vendor.id;
  const [products, orders, delivered, recent] = await Promise.all([
    db.product.count({ where: { vendorId } }),
    db.vendorOrder.groupBy({
      by: ["status"],
      where: { vendorId },
      _count: true,
    }),
    db.vendorOrder.aggregate({
      where: { vendorId, status: "DELIVERED" },
      _sum: { subtotalMinor: true, commissionMinor: true, payableMinor: true },
    }),
    db.vendorOrder.findMany({
      where: { vendorId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, status: true, totalMinor: true, createdAt: true },
    }),
  ]);
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - 29);
  const [
    active,
    outOfStock,
    dailyOrders,
    soldItems,
    pending,
    unpaid,
    adjustments,
  ] = await Promise.all([
    db.product.count({ where: { vendorId, active: true } }),
    db.product.count({ where: { vendorId, stock: 0 } }),
    db.vendorOrder.findMany({
      where: { vendorId, status: "DELIVERED", deliveredAt: { gte: start } },
      select: { deliveredAt: true, subtotalMinor: true },
    }),
    db.orderItem.groupBy({
      by: ["productId", "name", "image", "unitPriceMinor"],
      where: { vendorOrder: { vendorId, status: "DELIVERED" } },
      _sum: { quantity: true },
    }),
    db.vendorOrder.aggregate({
      where: {
        vendorId,
        status: "DELIVERED",
        settlementId: null,
      },
      _sum: { payableMinor: true },
    }),
    db.settlement.aggregate({
      where: { vendorId, status: { in: ["PENDING", "PROCESSED"] } },
      _sum: { amountMinor: true },
    }),
    db.vendorAdjustment.aggregate({
      where: { vendorId, settlementId: null },
      _sum: { amountMinor: true },
    }),
  ]);
  const days = new Map(
    Array.from({ length: 30 }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      return [d.toISOString().slice(0, 10), 0];
    }),
  );
  for (const o of dailyOrders) {
    const day = o.deliveredAt.toISOString().slice(0, 10);
    if (days.has(day)) days.set(day, days.get(day) + o.subtotalMinor);
  }
  const ranked = new Map();
  for (const item of soldItems) {
    const product = ranked.get(item.productId) || {
      id: item.productId,
      name: item.name,
      image: item.image || "",
      sold: 0,
      totalMinor: 0,
    };
    product.sold += item._sum.quantity || 0;
    product.totalMinor += (item._sum.quantity || 0) * item.unitPriceMinor;
    ranked.set(item.productId, product);
  }
  return {
    currency: "PKR",
    products,
    orders,
    delivered,
    recent,
    productStatus: { active, inactive: products - active, outOfStock },
    sales: [...days].map(([date, totalMinor]) => ({ date, totalMinor })),
    topProducts: [...ranked.values()]
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 5),
    pendingPayableMinor:
      (pending._sum.payableMinor || 0) +
      (unpaid._sum.amountMinor || 0) +
      (adjustments._sum.amountMinor || 0),
  };
}

export async function records(kind, q) {
  const model = kind === "remittances" ? db.remittance : db.refund;
  const [items, total] = await Promise.all([
    model.findMany({ ...pagination(q), orderBy: { createdAt: "desc" } }),
    model.count(),
  ]);
  return { items, total, page: q.page, limit: q.limit };
}
