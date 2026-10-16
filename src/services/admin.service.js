import bcrypt from "bcryptjs";
import { db, transaction } from "../config/database.js";
import { publicUser } from "../models/user.model.js";
import { assert } from "../utils/error.js";
import { pagination } from "../validators/common.validator.js";
export async function createVendor(actor, input) {
  const { email, password, phone, firstName, lastName, ...vendor } = input;
  const passwordHash = await bcrypt.hash(password, 12);
  return transaction(async (tx) => {
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
    const result = await tx.vendor.create({
      data: { ...vendor, ownerId: owner.id },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "VENDOR_CREATED",
        entityId: result.id,
      },
    });
    return result;
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
export const vendors = (q) =>
  db.vendor.findMany({
    where: {
      ...(q.search
        ? { name: { contains: q.search, mode: "insensitive" } }
        : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.city ? { city: { equals: q.city, mode: "insensitive" } } : {}),
      ...(q.zone ? { zone: { equals: q.zone, mode: "insensitive" } } : {}),
    },
    include: { owner: { select: publicUser } },
    ...pagination(q),
    orderBy: { createdAt: "desc" },
  });
export async function vendor(id) {
  const result = await db.vendor.findUnique({
    where: { id },
    include: { owner: { select: publicUser } },
  });
  assert(result, 404, "Vendor not found");
  return result;
}
export async function products(q) {
  const where = {
    ...(q.vendorId ? { vendorId: q.vendorId } : {}),
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
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
  const owned = await db.product.findUnique({ where: { id } });
  assert(owned, 404, "Product not found");
  return transaction(async (tx) => {
    const result = await tx.product.update({
      where: { id },
      data: {
        ...input,
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
  return transaction(async (tx) => {
    const current = await tx.vendor.findUnique({ where: { id }, include: { owner: true } });
    assert(current, 404, "Vendor not found");
    if (owner) {
      await tx.user.update({ where: { id: current.ownerId }, data: {
        ...ownerFields, ...(passwordHash ? { passwordHash } : {}),
      } });
      if (passwordHash || (ownerFields.email && ownerFields.email !== current.owner.email)) {
        await tx.session.deleteMany({ where: { userId: current.ownerId } });
        await tx.passwordReset.deleteMany({ where: { userId: current.ownerId } });
        await tx.emailVerification.deleteMany({ where: { userId: current.ownerId } });
      }
    }
    const result = await tx.vendor.update({ where: { id }, data: fields, include: { owner: { select: publicUser } } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "VENDOR_UPDATED", entityId: id,
      metadata: { ...fields, ...(owner ? { owner: ownerFields, passwordChanged: !!passwordHash } : {}) },
    } });
    return result;
  });
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
