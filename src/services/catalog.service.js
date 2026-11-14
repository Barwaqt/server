import { reviewReset } from "../utils/product-review.js";
import { descendantCategoryIds } from "../utils/category-tree.js";
import { db, transaction } from "../config/database.js";
import { pagination } from "../validators/common.validator.js";
import { assert } from "../utils/error.js";
import { publicApiUrl } from "../config/paths.js";
import { applyProductDeliveryFields } from "../utils/delivery-options.js";

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
const variantInclude = { variants: { orderBy: { createdAt: "asc" } } };
function assertVariantNames(variants) {
  const names = variants.map((variant) => variant.name.trim().toLowerCase());
  assert(
    new Set(names).size === names.length,
    422,
    "Variant names must be unique",
  );
}
// Keep the listing price and stock in step with its variants so cards and
// filters stay accurate. Variants without stock still count towards the price.
function variantTotals(variants) {
  if (!variants.length) return {};
  return {
    priceMinor: Math.min(...variants.map((variant) => variant.priceMinor)),
    stock: variants.reduce((sum, variant) => sum + variant.stock, 0),
  };
}
async function syncVariants(tx, productId, variants) {
  assertVariantNames(variants);
  const kept = variants
    .filter((variant) => variant.id)
    .map((variant) => variant.id);
  await tx.productVariant.deleteMany({
    where: { productId, ...(kept.length ? { id: { notIn: kept } } : {}) },
  });
  for (const variant of variants) {
    const data = {
      name: variant.name.trim(),
      priceMinor: variant.priceMinor,
      stock: variant.stock,
    };
    if (variant.id) {
      const updated = await tx.productVariant.updateMany({
        where: { id: variant.id, productId },
        data,
      });
      assert(updated.count, 404, "Variant not found");
    } else {
      await tx.productVariant.create({ data: { ...data, productId } });
    }
  }
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
  const ids = input.ids ? input.ids.split(",").filter(Boolean) : null;
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
          },
        },
        ...variantInclude,
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
  return {
    items: items.map(normalizeProduct),
    total,
    page: q.page,
    limit: q.limit,
  };
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
        },
      },
      reviews: {
        take: 50,
        orderBy: { createdAt: "desc" },
        select: { rating: true, comment: true, createdAt: true },
      },
      ...variantInclude,
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
    include: variantInclude,
    orderBy: { createdAt: "desc" },
  });
  return items.map(normalizeProduct);
}
export async function saveProduct(user, id, input) {
  const { variants, ...fields } = input;
  const data = {
    ...fields,
    ...(fields.images ? { images: normalizeImages(fields.images) } : {}),
  };
  if (!id) {
    applyProductDeliveryFields(data);
    return transaction(async (tx) => {
      const created = await tx.product.create({
        data: { ...data, vendorId: user.vendor.id, reviewStatus: "PENDING" },
      });
      if (variants?.length) {
        await syncVariants(tx, created.id, variants);
        await tx.product.update({
          where: { id: created.id },
          data: variantTotals(variants),
        });
      }
      return normalizeProduct(
        await tx.product.findUnique({
          where: { id: created.id },
          include: variantInclude,
        }),
      );
    });
  }
  return transaction(async (tx) => {
    const owned = await tx.product.findFirst({
      where: { id, vendorId: user.vendor.id },
      include: variantInclude,
    });
    assert(owned, 404, "Product not found");
    applyProductDeliveryFields(data, owned);
    if (variants) await syncVariants(tx, id, variants);
    const updated = await tx.product.update({
      where: { id },
      data: {
        ...data,
        ...(variants ? variantTotals(variants) : {}),
        ...reviewReset(owned, { ...data, ...(variants ? { variants } : {}) }),
        reviewVersion: { increment: 1 },
        ...(data.categoryId && data.categoryId !== owned.categoryId
          ? { catalogCategories: { set: [] } }
          : {}),
      },
      include: variantInclude,
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
