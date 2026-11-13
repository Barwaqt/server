import { reviewReset } from "../utils/product-review.js";
import { descendantCategoryIds } from "../utils/category-tree.js";
import { db, transaction } from "../config/database.js";
import { pagination } from "../validators/common.validator.js";
import { assert } from "../utils/error.js";
import { publicApiUrl } from "../config/paths.js";

export function normalizeImages(images) {
  if (!Array.isArray(images)) return [];
  return images.map((img) =>
    typeof img === "string" && img.startsWith("/uploads/")
      ? `${publicApiUrl}${img}`
      : img,
  );
}

export function normalizeProduct(p) {
  if (!p) return p;
  return {
    ...p,
    images: normalizeImages(p.images),
  };
}
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
export async function categoriesFiltered(input) {
  const ids = input.ids ? input.ids.split(',').filter(Boolean) : null;
  const rows = await db.category.findMany({
    where: ids ? { id: { in: ids } } : undefined,
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
  const categoryIds = q.categoryId
    ? [
        ...descendantCategoryIds(
          await db.category.findMany({
            select: { id: true, slug: true, parentSlug: true },
          }),
          [q.categoryId],
        ),
      ]
    : [];
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
        vendor: {
          select: {
            id: true,
            name: true,
            logo: true,
            city: true,
            zone: true,
            expressDelivery: true,
            expressEtaMinutes: true,
            standardDeliveryDays: true,
          },
        },
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
  return { items: items.map(normalizeProduct), total, page: q.page, limit: q.limit };
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
      vendor: {
        select: {
          id: true,
          name: true,
          logo: true,
          city: true,
          zone: true,
          expressDelivery: true,
          expressEtaMinutes: true,
          standardDeliveryDays: true,
        },
      },
      reviews: {
        take: 50,
        orderBy: { createdAt: "desc" },
        select: { rating: true, comment: true, createdAt: true },
      },
    },
  });
  assert(result, 404, "Product not found");
  return normalizeProduct(result);
}
export async function vendorProducts(user, q) {
  const items = await db.product.findMany({
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
  return items.map(normalizeProduct);
}
export async function saveProduct(user, id, input) {
  const data = {
    ...input,
    ...(input.images ? { images: normalizeImages(input.images) } : {}),
  };
  if (!id) {
    const created = await db.product.create({
      data: { ...data, vendorId: user.vendor.id, reviewStatus: "PENDING" },
    });
    return normalizeProduct(created);
  }
  return transaction(async (tx) => {
    const owned = await tx.product.findFirst({
      where: { id, vendorId: user.vendor.id },
    });
    assert(owned, 404, "Product not found");
    const updated = await tx.product.update({
      where: { id },
      data: {
        ...data,
        ...reviewReset(owned, data),
        reviewVersion: { increment: 1 },
        ...(data.categoryId && data.categoryId !== owned.categoryId
          ? { catalogCategories: { set: [] } }
          : {}),
      },
    });
    return normalizeProduct(updated);
  });
}

const publicVendor = {
  id: true,
  name: true,
  slug: true,
  logo: true,
  description: true,
  businessType: true,
  city: true,
  zone: true,
  expressDelivery: true,
  expressEtaMinutes: true,
  standardDeliveryDays: true,
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
