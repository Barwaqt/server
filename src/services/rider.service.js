import { db, transaction } from "../config/database.js";
import { assert } from "../utils/error.js";
export async function shift(user, action) {
  return transaction(async (tx) => {
    const current = await tx.shift.findFirst({
      where: { riderId: user.id, endedAt: null },
    });
    if (action === "start") {
      assert(!current, 409, "Shift already active");
      return tx.shift.create({ data: { riderId: user.id } });
    }
    assert(current, 409, "No active shift");
    assert(
      current.status !== "BUSY",
      409,
      "Complete assigned deliveries first",
    );
    if (action === "break") {
      assert(current.status === "AVAILABLE", 409, "Not available");
      return tx.shift.update({
        where: { id: current.id },
        data: { status: "BREAK", breakStartedAt: new Date() },
      });
    }
    if (action === "resume") {
      assert(current.status === "BREAK", 409, "Not on break");
      return tx.shift.update({
        where: { id: current.id },
        data: {
          status: "AVAILABLE",
          breakStartedAt: null,
          breakSeconds: {
            increment: Math.floor(
              (Date.now() - current.breakStartedAt.getTime()) / 1000,
            ),
          },
        },
      });
    }
    const collected = await tx.vendorOrder.aggregate({
      where: { riderId: user.id },
      _sum: { codCollectedMinor: true },
    });
    const remitted = await tx.remittance.aggregate({
      where: { riderId: user.id },
      _sum: { amountMinor: true },
    });
    assert(
      (collected._sum.codCollectedMinor || 0) ===
        (remitted._sum.amountMinor || 0),
      409,
      "Outstanding COD must be remitted before ending shift",
    );
    return tx.shift.update({
      where: { id: current.id },
      data: {
        status: "ENDED",
        endedAt: new Date(),
        breakStartedAt: null,
        breakSeconds: {
          increment: current.breakStartedAt
            ? Math.floor((Date.now() - current.breakStartedAt.getTime()) / 1000)
            : 0,
        },
      },
    });
  });
}
export async function shifts(user) {
  const rows = await db.shift.findMany({
    where: user.role === "RIDER" ? { riderId: user.id } : {},
    orderBy: { startedAt: "desc" },
    take: 100,
    include: {
      rider: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  return rows.map((s) => ({
    ...s,
    workedSeconds: Math.max(
      0,
      Math.floor(((s.endedAt || new Date()) - s.startedAt) / 1000) -
        s.breakSeconds -
        (s.breakStartedAt
          ? Math.floor((Date.now() - s.breakStartedAt) / 1000)
          : 0),
    ),
  }));
}
