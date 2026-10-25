import { reviewReset } from "../utils/product-review.js";
import { db, transaction } from "../config/database.js";
import { pagination } from "../validators/common.validator.js";
import { assert } from "../utils/error.js";
export async function categoryList() {
  const rows = await db.category.findMany({
    orderBy: { name: "asc" },
    include: {
      catalogProducts: {
        where: {
          active: true,
          reviewStatus: "APPROVED",
          vendor: { status: "APPROVED" },
        },
        select: { id: true },
      },
    },
  });
  return rows.map(({ catalogProducts, ...category }) => ({
    ...category,
    productIds: catalogProducts.map((p) => p.id),
  }));
}
export async function products(q) {
  assert(
    q.minPriceMinor === undefined ||
      q.maxPriceMinor === undefined ||
      q.minPriceMinor <= q.maxPriceMinor,
    422,
    "Minimum price must not exceed maximum price",
  );
  let categoryIds = q.categoryId ? [q.categoryId] : [];
  if (q.categoryId) {
    const rows = await db.category.findMany({
      select: { id: true, slug: true, parentSlug: true },
    });
    const slugs = new Set(
      rows.filter((c) => c.id === q.categoryId).map((c) => c.slug),
    );
    let changed = true;
    while (changed) {
      changed = false;
      for (const c of rows)
        if (c.parentSlug && slugs.has(c.parentSlug) && !slugs.has(c.slug)) {
          slugs.add(c.slug);
          categoryIds.push(c.id);
          changed = true;
        }
    }
  }
  const where = {
    active: true,
    reviewStatus: "APPROVED",
    ...(q.minPriceMinor !== undefined || q.maxPriceMinor !== undefined
      ? {
          priceMinor: {
            ...(q.minPriceMinor !== undefined ? { gte: q.minPriceMinor } : {}),
            ...(q.maxPriceMinor !== undefined ? { lte: q.maxPriceMinor } : {}),
          },
        }
      : {}),
    ...(q.inStock === "true" ? { stock: { gt: 0 } } : {}),
    vendor: {
      status: "APPROVED",
      ...(q.city ? { city: { equals: q.city, mode: "insensitive" } } : {}),
      ...(q.zone ? { zone: { equals: q.zone, mode: "insensitive" } } : {}),
    },
    ...(q.search ? { name: { contains: q.search, mode: "insensitive" } } : {}),
    ...(q.categoryId
      ? {
          OR: [
            { categoryId: { in: categoryIds } },
            { catalogCategories: { some: { id: q.categoryId } } },
          ],
        }
      : {}),
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
      orderBy:
        q.sort === "price-asc"
          ? { priceMinor: "asc" }
          : q.sort === "price-desc"
            ? { priceMinor: "desc" }
            : q.sort === "name"
              ? { name: "asc" }
              : { createdAt: "desc" },
    }),
    db.product.count({ where }),
  ]);
  return { items, total, page: q.page, limit: q.limit };
}
export async function product(id) {
  const result = await db.product.findFirst({
    where: {
      id,
      active: true,
      reviewStatus: "APPROVED",
      vendor: { status: "APPROVED" },
    },
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
    where: {
      vendorId: user.vendor.id,
      ...(q.reviewStatus ? { reviewStatus: q.reviewStatus } : {}),
      ...(q.search
        ? { name: { contains: q.search, mode: "insensitive" } }
        : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    },
    ...pagination(q),
    orderBy: { createdAt: "desc" },
  });
}
export async function saveProduct(user, id, input) {
  if (!id)
    return db.product.create({
      data: { ...input, vendorId: user.vendor.id, reviewStatus: "PENDING" },
    });
  return transaction(async (tx) => {
    const owned = await tx.product.findFirst({
      where: { id, vendorId: user.vendor.id },
    });
    assert(owned, 404, "Product not found");
    return tx.product.update({
      where: { id },
      data: {
        ...input,
        ...reviewReset(owned, input),
        reviewVersion: { increment: 1 },
        ...(input.categoryId && input.categoryId !== owned.categoryId
          ? { catalogCategories: { set: [] } }
          : {}),
      },
    });
  });
}

const publicVendor = {
  id: true,
  name: true,
  slug: true,
  description: true,
  businessType: true,
  city: true,
  zone: true,
};
export async function vendors(q) {
  const where = {
    status: "APPROVED",
    ...(q.search ? { name: { contains: q.search, mode: "insensitive" } } : {}),
    ...(q.city ? { city: { equals: q.city, mode: "insensitive" } } : {}),
    ...(q.zone ? { zone: { equals: q.zone, mode: "insensitive" } } : {}),
  };
  const [items, total] = await Promise.all([
    db.vendor.findMany({
      where,
      select: publicVendor,
      ...pagination(q),
      orderBy: { name: "asc" },
    }),
    db.vendor.count({ where }),
  ]);
  return { items, total, page: q.page, limit: q.limit };
}
export async function vendor(identifier) {
  const result = await db.vendor.findFirst({
    where: {
      status: "APPROVED",
      OR: [{ id: identifier }, { slug: identifier }],
    },
    select: publicVendor,
  });
  assert(result, 404, "Vendor not found");
  return result;
}
