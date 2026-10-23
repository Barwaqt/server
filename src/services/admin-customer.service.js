import { db } from "../config/database.js";
import { assert } from "../utils/error.js";
import { pagination } from "../validators/common.validator.js";
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
    role: "CUSTOMER",
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
    where: { id, role: "CUSTOMER" },
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
