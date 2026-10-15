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
    if (current && current.slug !== row.slug)
      await tx.category.updateMany({
        where: { parentSlug: current.slug },
        data: { parentSlug: row.slug },
      });
    await audit(tx, user, id ? "CATEGORY_UPDATED" : "CATEGORY_CREATED", row.id);
    return row;
  });
}
export async function deleteCategory(user, id) {
  return transaction(async (tx) => {
    const c = await tx.category.findUnique({
      where: { id },
      include: {
        _count: { select: { products: true, catalogProducts: true } },
      },
    });
    assert(c, 404, "Category not found");
    assert(
      !c._count.products &&
        !c._count.catalogProducts &&
        !(await tx.category.count({ where: { parentSlug: c.slug } })),
      409,
      "Reassign products, remove collection memberships and move child categories before deleting",
    );
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
