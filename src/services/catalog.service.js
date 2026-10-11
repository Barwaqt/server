import { db } from "../config/database.js";
import { pagination } from "../validators/common.validator.js";
import { assert } from "../utils/error.js";
export const categoryList = () =>
  db.category.findMany({ orderBy: { name: "asc" } });
export async function products(q) {
  const where = {
    active: true,
    vendor: {
      status: "APPROVED",
      ...(q.city ? { city: { equals: q.city, mode: "insensitive" } } : {}),
      ...(q.zone ? { zone: { equals: q.zone, mode: "insensitive" } } : {}),
    },
    ...(q.search ? { name: { contains: q.search, mode: "insensitive" } } : {}),
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.vendorId ? { vendorId: q.vendorId } : {}),
  };
  const [items, total] = await Promise.all([
    db.product.findMany({
      where,
      ...pagination(q),
      include: {
        category: true,
        vendor: { select: { id: true, name: true, city: true, zone: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.product.count({ where }),
  ]);
  return { items, total, page: q.page, limit: q.limit };
}
export async function product(id) {
  const result = await db.product.findFirst({
    where: { id, active: true, vendor: { status: "APPROVED" } },
    include: {
      category: true,
      vendor: { select: { id: true, name: true, city: true, zone: true } },
      reviews: {
        take: 50,
        orderBy: { createdAt: "desc" },
        select: { rating: true, comment: true, createdAt: true },
      },
    },
  });
  assert(result, 404, "Product not found");
  return result;
}
export async function vendorProducts(user, q) {
  return db.product.findMany({
    where: { vendorId: user.vendor.id },
    ...pagination(q),
    orderBy: { createdAt: "desc" },
  });
}
export async function saveProduct(user, id, input) {
  if (id) {
    const owned = await db.product.findFirst({
      where: { id, vendorId: user.vendor.id },
    });
    assert(owned, 404, "Product not found");
    return db.product.update({ where: { id }, data: input });
  }
  return db.product.create({ data: { ...input, vendorId: user.vendor.id } });
}
