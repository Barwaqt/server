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
      data: { email, passwordHash, phone, firstName, lastName, role: "VENDOR" },
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
      data: { ...rest, passwordHash },
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
    include: { owner: { select: publicUser } },
    ...pagination(q),
    orderBy: { createdAt: "desc" },
  });
export async function updateVendor(actor, id, input) {
  return transaction(async (tx) => {
    const vendor = await tx.vendor.update({ where: { id }, data: input });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "VENDOR_UPDATED",
        entityId: id,
        metadata: input,
      },
    });
    return vendor;
  });
}
export async function report() {
  const [orders, delivered, cash, payouts, refunds] = await Promise.all([
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
  };
}
