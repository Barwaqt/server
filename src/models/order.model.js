export const orderInclude = {
  vendorOrders: {
    include: { items: true, events: { orderBy: { createdAt: "asc" } } },
  },
};
export function sanitizeOrder(order) {
  if (!order) return order;
  const safe = { ...order };
  delete safe.pinHash;
  delete safe.pinAttempts;
  if (safe.vendorOrders)
    safe.vendorOrders = safe.vendorOrders.map(sanitizeOrder);
  return safe;
}
