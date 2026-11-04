import { reviewReset } from "../utils/product-review.js";
import bcrypt from "bcryptjs";
import { db, transaction } from "../config/database.js";
import { publicUser } from "../models/user.model.js";
import { assert } from "../utils/error.js";
import { pagination } from "../validators/common.validator.js";
export async function createVendor(actor, input) {
  const { email, password, phone, firstName, lastName, ...vendor } = input;
  const passwordHash = await bcrypt.hash(password, 12);
  const categoryIds = [
    ...new Set(
      vendor.categoryIds?.length ? vendor.categoryIds : [vendor.categoryId],
    ),
  ].filter(Boolean);
  return transaction(async (tx) => {
    assert(categoryIds.length, 422, "Select at least one vendor category");
    const categories = await tx.category.findMany({
      where: { id: { in: categoryIds } },
    });
    assert(
      categories.length === categoryIds.length,
      422,
      "Select existing vendor categories",
    );
    const category = categories.find((item) => item.id === categoryIds[0]);
    const owner = await tx.user.create({
      data: {
        email,
        passwordHash,
        phone,
        firstName,
        lastName,
        role: "VENDOR",
        // Provisioned by an administrator, so the account can sign in immediately.
        emailVerifiedAt: new Date(),
      },
    });
    const categoryCommissions = { ...(vendor.categoryCommissions || {}) };
    for (const c of categories) {
      if (categoryCommissions[c.id] === undefined) {
        categoryCommissions[c.id] = c.commissionBps;
      }
    }
    const result = await tx.vendor.create({
      data: {
        ...vendor,
        businessType: vendor.businessType || category.name || "Retail",
        categoryId: category.id,
        categoryIds,
        commissionBps:
          vendor.commissionBps ??
          categoryCommissions[category.id] ??
          category.commissionBps,
        categoryCommissions,
        ownerId: owner.id,
      },
      include: { category: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "VENDOR_CREATED",
        entityId: result.id,
      },
    });
    return {
      ...result,
      categories: categoryIds.map((id) => {
        const cat = categories.find((item) => item.id === id);
        return {
          ...cat,
          commissionBps: categoryCommissions[id] ?? cat.commissionBps,
        };
      }),
    };
  });
}
export async function createStaff(actor, input) {
  const { password, ...rest } = input;
  const passwordHash = await bcrypt.hash(password, 12);
  return transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        ...rest,
        passwordHash,
        // Provisioned by an administrator, so the account can sign in immediately.
        emailVerifiedAt: new Date(),
      },
      select: publicUser,
    });
    await tx.auditLog.create({
      data: { actorId: actor.id, action: "STAFF_CREATED", entityId: user.id },
    });
    return user;
  });
}
const categoryIdsOf = (row) =>
  row.categoryIds?.length
    ? row.categoryIds
    : row.categoryId
      ? [row.categoryId]
      : [];
// Adds the selected categories to vendor rows, which store them as an id list.
async function withCategories(rows) {
  const ids = [...new Set(rows.flatMap(categoryIdsOf))];
  if (!ids.length) return rows.map((row) => ({ ...row, categories: [] }));
  const categories = await db.category.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, slug: true, commissionBps: true },
  });
  const byId = new Map(categories.map((category) => [category.id, category]));
  return rows.map((row) => {
    const rowCommissions =
      row.categoryCommissions && typeof row.categoryCommissions === "object"
        ? row.categoryCommissions
        : {};
    return {
      ...row,
      categories: categoryIdsOf(row)
        .map((id) => {
          const cat = byId.get(id);
          if (!cat) return null;
          return {
            ...cat,
            commissionBps: rowCommissions[id] ?? cat.commissionBps,
          };
        })
        .filter(Boolean),
    };
  });
}
export async function vendors(q) {
  const rows = await db.vendor.findMany({
    where: {
      ...(q.search
        ? { name: { contains: q.search, mode: "insensitive" } }
        : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.city ? { city: { equals: q.city, mode: "insensitive" } } : {}),
      ...(q.zone ? { zone: { equals: q.zone, mode: "insensitive" } } : {}),
    },
    include: { owner: { select: publicUser }, category: true },
    ...pagination(q),
    orderBy: { createdAt: "desc" },
  });
  return withCategories(rows);
}
export async function vendor(id) {
  const result = await db.vendor.findUnique({
    where: { id },
    include: { owner: { select: publicUser }, category: true },
  });
  assert(result, 404, "Vendor not found");
  return (await withCategories([result]))[0];
}
export async function products(q) {
  const where = {
    ...(q.vendorId ? { vendorId: q.vendorId } : {}),
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.reviewStatus ? { reviewStatus: q.reviewStatus } : {}),
    ...(q.active ? { active: q.active === "true" } : {}),
    ...(q.search ? { name: { contains: q.search, mode: "insensitive" } } : {}),
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
            city: true,
            zone: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.product.count({ where }),
  ]);
  return { items, total, page: q.page, limit: q.limit };
}
export async function updateProduct(actor, id, input) {
  return transaction(async (tx) => {
    const owned = await tx.product.findUnique({ where: { id } });
    assert(owned, 404, "Product not found");
    const result = await tx.product.update({
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
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "PRODUCT_UPDATED",
        entityId: id,
        metadata: input,
      },
    });
    return result;
  });
}
export async function staff(q) {
  const where = {
    role: q.role ? q.role : { in: ["RIDER", "DISPATCHER", "FINANCE"] },
    ...(q.search
      ? {
          OR: [
            { firstName: { contains: q.search, mode: "insensitive" } },
            { lastName: { contains: q.search, mode: "insensitive" } },
            { email: { contains: q.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.user.findMany({
      where,
      select: publicUser,
      ...pagination(q),
      orderBy: { createdAt: "desc" },
    }),
    db.user.count({ where }),
  ]);
  return { items, total, page: q.page, limit: q.limit };
}
export async function updateStaff(actor, id, input) {
  const user = await db.user.findUnique({ where: { id } });
  assert(
    user && ["RIDER", "DISPATCHER", "FINANCE"].includes(user.role),
    404,
    "Staff account not found",
  );
  return transaction(async (tx) => {
    const result = await tx.user.update({
      where: { id },
      data: input,
      select: publicUser,
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "STAFF_UPDATED",
        entityId: id,
        metadata: input,
      },
    });
    return result;
  });
}
export async function updateVendor(actor, id, input) {
  const { owner, ...fields } = input;
  const { password, ...ownerFields } = owner || {};
  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;
  const result = await transaction(async (tx) => {
    const current = await tx.vendor.findUnique({
      where: { id },
      include: { owner: true },
    });
    assert(current, 404, "Vendor not found");
    const currentCategoryIds = categoryIdsOf(current);
    const categoryIds = fields.categoryIds
      ? [...new Set(fields.categoryIds)]
      : fields.categoryId
        ? [
            fields.categoryId,
            ...currentCategoryIds.filter((id) => id !== fields.categoryId),
          ]
        : null;
    if (categoryIds) {
      const categories = await tx.category.findMany({
        where: { id: { in: categoryIds } },
      });
      assert(
        categories.length === categoryIds.length,
        422,
        "Select existing vendor categories",
      );
      const primary = categories.find(
        (category) => category.id === categoryIds[0],
      );
      fields.categoryId = primary.id;
      fields.categoryIds = categoryIds;
      // An explicit commission wins; otherwise a new primary category sets the rate.
      if (
        fields.commissionBps === undefined &&
        primary.id !== current.categoryId
      )
        fields.commissionBps = primary.commissionBps;
    }
    if (fields.categoryCommissions !== undefined || categoryIds) {
      const currentCommissions =
        current.categoryCommissions &&
        typeof current.categoryCommissions === "object"
          ? current.categoryCommissions
          : {};
      const mergedCommissions = {
        ...currentCommissions,
        ...(fields.categoryCommissions || {}),
      };
      const effectiveIds = categoryIds || currentCategoryIds;
      if (effectiveIds.length) {
        const filtered = {};
        for (const catId of effectiveIds) {
          if (mergedCommissions[catId] !== undefined) {
            filtered[catId] = mergedCommissions[catId];
          }
        }
        fields.categoryCommissions = filtered;
      } else {
        fields.categoryCommissions = mergedCommissions;
      }
    }
    if (owner) {
      await tx.user.update({
        where: { id: current.ownerId },
        data: {
          ...ownerFields,
          ...(passwordHash ? { passwordHash } : {}),
        },
      });
      if (
        passwordHash ||
        (ownerFields.email && ownerFields.email !== current.owner.email)
      ) {
        await tx.session.deleteMany({ where: { userId: current.ownerId } });
        await tx.passwordReset.deleteMany({
          where: { userId: current.ownerId },
        });
        await tx.emailVerification.deleteMany({
          where: { userId: current.ownerId },
        });
      }
    }
    const result = await tx.vendor.update({
      where: { id },
      data: fields,
      include: { owner: { select: publicUser }, category: true },
    });
    const { bankDetails, ...auditFields } = fields;
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "VENDOR_UPDATED",
        entityId: id,
        metadata: {
          ...auditFields,
          ...(bankDetails ? { bankDetailsChanged: true } : {}),
          ...(owner
            ? { owner: ownerFields, passwordChanged: !!passwordHash }
            : {}),
        },
      },
    });
    return result;
  });
  return (await withCategories([result]))[0];
}
export async function report() {
  const [orders, delivered, cash, payouts, refunds, transfers] =
    await Promise.all([
      db.order.aggregate({ _sum: { totalMinor: true }, _count: true }),
      db.vendorOrder.aggregate({
        where: { status: "DELIVERED" },
        _sum: {
          subtotalMinor: true,
          discountMinor: true,
          commissionMinor: true,
          deliveryMinor: true,
          payableMinor: true,
          codCollectedMinor: true,
        },
        _count: true,
      }),
      db.remittance.aggregate({ _sum: { amountMinor: true } }),
      db.settlement.aggregate({
        where: { status: "PAID" },
        _sum: { amountMinor: true },
      }),
      db.refund.aggregate({ _sum: { amountMinor: true } }),
      db.payment.aggregate({
        where: { verifiedAt: { not: null } },
        _sum: { amountMinor: true },
      }),
    ]);
  return {
    currency: "PKR",
    orders,
    delivered,
    codRemittedMinor: cash._sum.amountMinor || 0,
    codOutstandingMinor:
      (delivered._sum.codCollectedMinor || 0) - (cash._sum.amountMinor || 0),
    settlementsPaidMinor: payouts._sum.amountMinor || 0,
    refundsMinor: refunds._sum.amountMinor || 0,
    transfersReceivedMinor: transfers._sum.amountMinor || 0,
    platformCollectedMinor:
      (cash._sum.amountMinor || 0) + (transfers._sum.amountMinor || 0),
  };
}

export async function reviewProduct(actor, id, input) {
  return transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id },
      include: { vendor: true },
    });
    assert(product, 404, "Product not found");
    assert(
      product.reviewStatus === "PENDING",
      409,
      "Only pending products can be reviewed",
    );
    const result = await tx.product.updateMany({
      where: {
        id,
        reviewStatus: "PENDING",
        reviewVersion: input.reviewVersion,
      },
      data: {
        reviewStatus: input.decision,
        rejectionReason: input.decision === "REJECTED" ? input.reason : null,
        reviewedAt: new Date(),
        reviewedById: actor.id,
        reviewVersion: { increment: 1 },
      },
    });
    assert(
      result.count,
      409,
      "This product changed while you were reviewing it. Reload and review the latest details.",
    );
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "PRODUCT_" + input.decision,
        entityId: id,
        metadata: {
          reviewVersion: input.reviewVersion,
          ...(input.reason ? { reason: input.reason } : {}),
        },
      },
    });
    await tx.notification.create({
      data: {
        userId: product.vendor.ownerId,
        title:
          input.decision === "APPROVED"
            ? "Product approved"
            : "Product rejected",
        body:
          input.decision === "APPROVED"
            ? `${product.name} was approved. It is visible to customers when enabled and your store is approved.`
            : `${product.name}: ${input.reason}`,
      },
    });
    return tx.product.findUnique({ where: { id } });
  });
}
