import { db, transaction } from "../config/database.js";
import { assert } from "../utils/error.js";
import { pagination } from "../validators/common.validator.js";
const audit = (tx, user, action, entityId) =>
  tx.auditLog.create({ data: { actorId: user.id, action, entityId } });
export async function categories(q) {
  const where = q.search
    ? { name: { contains: q.search, mode: "insensitive" } }
    : {};
  const [items, total] = await Promise.all([
    db.category.findMany({
      where,
      ...pagination(q),
      orderBy: { name: "asc" },
      include: {
        _count: { select: { products: true, catalogProducts: true } },
        catalogProducts: { select: { id: true } },
      },
    }),
    db.category.count({ where }),
  ]);
  return {
    items: items.map(({ catalogProducts, ...c }) => ({
      ...c,
      productIds: catalogProducts.map((p) => p.id),
    })),
    total,
    page: q.page,
    limit: q.limit,
  };
}
export async function saveCategory(user, id, input) {
  return transaction(async (tx) => {
    const current = id ? await tx.category.findUnique({ where: { id } }) : null;
    if (id) assert(current, 404, "Category not found");
    const next = { ...current, ...input };
    if (next.parentSlug) {
      let parent = await tx.category.findUnique({
        where: { slug: next.parentSlug },
      });
      assert(parent, 422, "Parent category not found");
      const seen = new Set([next.slug, current?.slug].filter(Boolean));
      while (parent) {
        assert(
          !seen.has(parent.slug),
          422,
          "Category hierarchy cannot contain a cycle",
        );
        seen.add(parent.slug);
        parent = parent.parentSlug
          ? await tx.category.findUnique({ where: { slug: parent.parentSlug } })
          : null;
      }
    }
    const { productIds, ...fields } = input;
    const data = {
      ...fields,
      ...(productIds
        ? { catalogProducts: { set: productIds.map((id) => ({ id })) } }
        : {}),
    };
    if (productIds)
      assert(
        (await tx.product.count({ where: { id: { in: productIds } } })) ===
          new Set(productIds).size,
        422,
        "A collection product does not exist",
      );
    const row = id
      ? await tx.category.update({ where: { id }, data })
      : await tx.category.create({
          data: {
            ...fields,
            ...(productIds
              ? {
                  catalogProducts: {
                    connect: productIds.map((id) => ({ id })),
                  },
                }
              : {}),
          },
        });
    if (current && current.commissionBps !== row.commissionBps)
      // Vendors with their own rate keep it; only category-rate vendors follow.
      await tx.vendor.updateMany({
        where: { categoryId: row.id, commissionBps: current.commissionBps },
        data: { commissionBps: row.commissionBps },
      });
    if (current && current.slug !== row.slug)
      await tx.category.updateMany({
        where: { parentSlug: current.slug },
        data: { parentSlug: row.slug },
      });
    await audit(tx, user, id ? "CATEGORY_UPDATED" : "CATEGORY_CREATED", row.id);
    return row;
  });
}
export async function deleteCategory(user, id, reassignTo) {
  return transaction(async (tx) => {
    const c = await tx.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    assert(c, 404, "Category not found");
    if (reassignTo) {
      assert(reassignTo !== id, 422, "Target category must be different");
      const target = await tx.category.findUnique({
        where: { id: reassignTo },
      });
      assert(target, 404, "Target category not found");
      await tx.product.updateMany({
        where: { categoryId: id },
        data: { categoryId: reassignTo },
      });
    } else {
      assert(
        !c._count.products,
        409,
        `Move the ${c._count.products} product${c._count.products === 1 ? "" : "s"} in this category to another category before deleting`,
      );
    }
    // Children move up one level so the hierarchy survives the delete.
    await tx.category.updateMany({
      where: { parentSlug: c.slug },
      data: { parentSlug: c.parentSlug },
    });
    // Vendors keep working under their remaining categories.
    const vendors = await tx.vendor.findMany({
      where: { OR: [{ categoryId: id }, { categoryIds: { has: id } }] },
      select: {
        id: true,
        categoryId: true,
        categoryIds: true,
        categoryCommissions: true,
      },
    });
    for (const vendor of vendors) {
      const remaining = vendor.categoryIds.filter(
        (categoryId) => categoryId !== id,
      );
      if (reassignTo && !remaining.includes(reassignTo)) {
        remaining.push(reassignTo);
      }
      const commissions =
        vendor.categoryCommissions &&
        typeof vendor.categoryCommissions === "object"
          ? { ...vendor.categoryCommissions }
          : {};
      delete commissions[id];
      await tx.vendor.update({
        where: { id: vendor.id },
        data: {
          categoryIds: remaining,
          categoryId:
            vendor.categoryId === id
              ? (reassignTo || remaining[0] || null)
              : vendor.categoryId,
          categoryCommissions: commissions,
        },
      });
    }
    // Collection memberships are only a shortcut to products, not ownership.
    await tx.category.update({
      where: { id },
      data: { catalogProducts: { set: [] } },
    });
    await tx.category.delete({ where: { id } });
    await audit(tx, user, "CATEGORY_DELETED", id);
  });
}
export async function coupons(q) {
  const where = q.search
    ? { code: { contains: q.search, mode: "insensitive" } }
    : {};
  const [items, total] = await Promise.all([
    db.coupon.findMany({ where, ...pagination(q), orderBy: { code: "asc" } }),
    db.coupon.count({ where }),
  ]);
  return { items, total, page: q.page, limit: q.limit };
}
export async function saveCoupon(user, id, input) {
  return transaction(async (tx) => {
    if (input.categoryIds)
      assert(
        (await tx.category.count({
          where: { id: { in: input.categoryIds } },
        })) === input.categoryIds.length,
        422,
        "One or more coupon categories do not exist",
      );
    const current = id ? await tx.coupon.findUnique({ where: { id } }) : null;
    if (id) assert(current, 404, "Coupon not found");
    assert(
      input.maxUses === undefined || input.maxUses >= (current?.used || 0),
      422,
      "Maximum uses cannot be below recorded uses",
    );
    const row = id
      ? await tx.coupon.update({ where: { id }, data: input })
      : await tx.coupon.create({ data: input });
    await audit(tx, user, id ? "COUPON_UPDATED" : "COUPON_CREATED", row.id);
    return row;
  });
}
export async function deleteCoupon(user, id) {
  return transaction(async (tx) => {
    const row = await tx.coupon.findUnique({
      where: { id },
      include: { _count: { select: { orders: true } } },
    });
    assert(row, 404, "Coupon not found");
    assert(
      !row.used && !row._count.orders,
      409,
      "Used coupons must be deactivated instead of deleted",
    );
    await tx.coupon.delete({ where: { id } });
    await audit(tx, user, "COUPON_DELETED", id);
  });
}
