import { db, transaction } from "../config/database.js";
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
      },
    });
    assert(orders.length, 409, "No reconciled orders available for settlement");
    const amountMinor = orders.reduce((s, o) => s + o.payableMinor, 0);
    assert(amountMinor > 0, 409, "No positive payable balance");
    const settlement = await tx.settlement.create({
      data: { vendorId, amountMinor, createdBy: actor.id },
    });
    await tx.vendorOrder.updateMany({
      where: { id: { in: orders.map((o) => o.id) }, settlementId: null },
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
      include: { refunds: true },
    });
    assert(
      order?.status === "DELIVERED" && order.cashReceived,
      409,
      "Only delivered, reconciled orders can be refunded",
    );
    assert(
      !order.settlementId,
      409,
      "Refund must be recorded before settlement",
    );
    const refunded = order.refunds.reduce((sum, r) => sum + r.amountMinor, 0);
    assert(
      input.amountMinor + refunded <= order.subtotalMinor - order.discountMinor,
      422,
      "Refund exceeds product amount",
    );
    const currentNet = order.subtotalMinor - order.discountMinor - refunded;
    const remainingNet = currentNet - input.amountMinor;
    const nextCommission = Math.floor(
      (order.commissionMinor * remainingNet) / currentNet,
    );
    const nextPayable = remainingNet - nextCommission;
    const row = await tx.refund.create({
      data: { ...input, vendorOrderId: id, createdBy: actor.id },
    });
    await tx.vendorOrder.update({
      where: { id },
      data: { payableMinor: nextPayable, commissionMinor: nextCommission },
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
  return { currency: "PKR", products, orders, delivered, recent };
}
