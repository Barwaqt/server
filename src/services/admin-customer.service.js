import { randomUUID } from "node:crypto";
import { db, transaction } from "../config/database.js";
import { assert } from "../utils/error.js";
import { pagination } from "../validators/common.validator.js";
const visible = { role: "CUSTOMER", deletedAt: null };
const profile = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  active: true,
  createdAt: true,
};
async function summary(customer) {
  const where = { order: { customerId: customer.id }, status: "DELIVERED" };
  const [totalOrders, sales, refunds] = await Promise.all([
    db.order.count({ where: { customerId: customer.id } }),
    db.vendorOrder.aggregate({ where, _sum: { totalMinor: true } }),
    db.refund.aggregate({
      where: { vendorOrder: where },
      _sum: { amountMinor: true },
    }),
  ]);
  return {
    ...customer,
    totalOrders,
    totalSpentMinor:
      (sales._sum.totalMinor || 0) - (refunds._sum.amountMinor || 0),
  };
}
export async function customers(query) {
  const terms = query.search?.trim().split(/\s+/).filter(Boolean) || [];
  const where = {
    ...visible,
    AND: terms.map((term) => ({
      OR: ["firstName", "lastName", "email", "phone"].map((field) => ({
        [field]: { contains: term, mode: "insensitive" },
      })),
    })),
  };
  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      select: profile,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...pagination(query),
    }),
    db.user.count({ where }),
  ]);
  return {
    items: await Promise.all(rows.map(summary)),
    total,
    page: query.page,
    limit: query.limit,
  };
}
export async function customer(id, query) {
  const person = await db.user.findFirst({
    where: { id, ...visible },
    select: profile,
  });
  assert(person, 404, "Customer not found");
  const [info, items] = await Promise.all([
    summary(person),
    db.order.findMany({
      where: { customerId: id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...pagination(query),
      select: {
        id: true,
        createdAt: true,
        totalMinor: true,
        paymentMethod: true,
        currency: true,
        vendorOrders: {
          select: {
            id: true,
            status: true,
            totalMinor: true,
            vendor: { select: { name: true } },
            items: {
              select: {
                id: true,
                productId: true,
                name: true,
                image: true,
                quantity: true,
                unitPriceMinor: true,
              },
            },
          },
        },
      },
    }),
  ]);
  return {
    ...info,
    orders: {
      items,
      total: info.totalOrders,
      page: query.page,
      limit: query.limit,
    },
  };
}
// Orders, payments and refunds are financial records, so a customer is never
// hard-deleted. Their account is anonymised and closed instead: personal data
// is removed, every session is revoked and the row disappears from the admin
// customer list while past orders keep working for vendors and finance.
export async function deleteCustomer(actor, id) {
  return transaction(async (tx) => {
    const person = await tx.user.findFirst({
      where: { id, ...visible },
      select: { id: true },
    });
    assert(person, 404, "Customer not found");
    await Promise.all([
      tx.session.deleteMany({ where: { userId: id } }),
      tx.passwordReset.deleteMany({ where: { userId: id } }),
      tx.emailVerification.deleteMany({ where: { userId: id } }),
      tx.cartItem.deleteMany({ where: { userId: id } }),
      tx.wishlistItem.deleteMany({ where: { userId: id } }),
      tx.address.deleteMany({ where: { userId: id } }),
      tx.notification.deleteMany({ where: { userId: id } }),
    ]);
    await tx.user.update({
      where: { id },
      data: {
        firstName: "Deleted",
        lastName: "Customer",
        email: null,
        phone: null,
        googleSubject: null,
        appleSubject: null,
        passwordHash: randomUUID(),
        profile: {},
        active: false,
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
        deletedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: { actorId: actor.id, action: "CUSTOMER_DELETED", entityId: id },
    });
    return { id, deleted: true };
  });
}
