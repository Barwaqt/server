import { db } from "../config/database.js";
export const list = (user) =>
  db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
export const markRead = (user, id) =>
  db.notification.updateMany({
    where: { id, userId: user.id },
    data: { readAt: new Date() },
  });
// Actionable counts for sidebar badges, scoped to the caller's role.
// Keys map to dashboard menus; menus without pending activity report 0.
export async function badgeCounts(user) {
  const counts = {
    notifications: await db.notification.count({
      where: { userId: user.id, readAt: null },
    }),
  };
  if (user.role === "ADMIN") {
    const [orders, products, payments, returns, finance] = await Promise.all([
      db.vendorOrder.count({ where: { status: "NEW" } }),
      db.product.count({ where: { reviewStatus: "PENDING" } }),
      db.paymentSubmission.count({ where: { status: "SUBMITTED" } }),
      db.returnRequest.count({ where: { status: "REQUESTED" } }),
      db.settlement.count({ where: { status: "PENDING" } }),
    ]);
    Object.assign(counts, { orders, products, payments, returns, finance });
  } else if (user.role === "VENDOR" && user.vendor) {
    const vendorId = user.vendor.id;
    const [orders, products, returns, finance] = await Promise.all([
      db.vendorOrder.count({ where: { vendorId, status: "NEW" } }),
      db.product.count({ where: { vendorId, reviewStatus: "REJECTED" } }),
      db.returnRequest.count({
        where: { status: "REQUESTED", vendorOrder: { vendorId } },
      }),
      db.settlement.count({ where: { vendorId, status: "PENDING" } }),
    ]);
    Object.assign(counts, { orders, products, returns, finance });
  }
  return counts;
}
