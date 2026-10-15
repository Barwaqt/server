import { db, transaction } from "../config/database.js";
import { env } from "../config/env.js";
import { assert } from "../utils/error.js";
import { pagination } from "../validators/common.validator.js";
export async function list(user, q) {
  const where =
    user.role === "CUSTOMER"
      ? { customerId: user.id }
      : user.role === "VENDOR"
        ? { vendorOrder: { vendorId: user.vendor.id } }
        : {};
  const [items, total] = await Promise.all([
    db.returnRequest.findMany({
      where,
      ...pagination(q),
      orderBy: { createdAt: "desc" },
      include: {
        vendorOrder: {
          select: {
            id: true,
            vendorId: true,
            items: true,
            subtotalMinor: true,
            discountMinor: true,
            refunds: true,
            order: { select: { address: true, paymentMethod: true } },
          },
        },
      },
    }),
    db.returnRequest.count({ where }),
  ]);
  return { items, total, page: q.page, limit: q.limit };
}
export async function create(user, input) {
  return transaction(async (tx) => {
    const order = await tx.vendorOrder.findFirst({
      where: { id: input.vendorOrderId, order: { customerId: user.id } },
      include: { refunds: true },
    });
    assert(order, 404, "Order not found");
    assert(
      order.status === "DELIVERED" && order.deliveredAt,
      409,
      "Only delivered shipments can be returned",
    );
    assert(
      Date.now() - order.deliveredAt.getTime() <=
        env.RETURN_WINDOW_DAYS * 86400000,
      422,
      `Returns must be requested within ${env.RETURN_WINDOW_DAYS} days of delivery`,
    );
    assert(
      !(await tx.returnRequest.findUnique({
        where: { vendorOrderId: order.id },
      })),
      409,
      "A return request already exists for this shipment",
    );
    assert(
      order.refunds.reduce((n, r) => n + r.amountMinor, 0) <
        order.subtotalMinor - order.discountMinor,
      409,
      "Shipment is already fully refunded",
    );
    const row = await tx.returnRequest.create({
      data: { ...input, customerId: user.id },
    });
    const vendor = await tx.vendor.findUnique({
      where: { id: order.vendorId },
    });
    await tx.notification.create({
      data: {
        userId: vendor.ownerId,
        title: "Return requested",
        body: `Return ${row.id} requested for order ${order.id}.`,
      },
    });
    return row;
  });
}
export async function action(user, id, input) {
  return transaction(async (tx) => {
    const row = await tx.returnRequest.findUnique({
      where: { id },
      include: { vendorOrder: { include: { items: true } } },
    });
    assert(row, 404, "Return not found");
    const next = {
      approve: ["REQUESTED", "APPROVED"],
      reject: ["REQUESTED", "REJECTED"],
      receive: ["APPROVED", "RECEIVED"],
    }[input.action];
    assert(row.status === next[0], 409, "Invalid return transition");
    if (input.action === "receive" && input.restock)
      for (const item of row.vendorOrder.items)
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
    const result = await tx.returnRequest.update({
      where: { id },
      data: {
        status: next[1],
        note: input.note,
        ...(input.action === "receive" ? { restocked: input.restock } : {}),
      },
    });
    await tx.auditLog.create({
      data: { actorId: user.id, action: "RETURN_" + next[1], entityId: id },
    });
    await tx.notification.create({
      data: {
        userId: row.customerId,
        title: "Return update",
        body: `Return ${id}: ${next[1]}. ${input.note}`,
      },
    });
    return result;
  });
}
