import { db, transaction } from "../config/database.js";
import { assert } from "../utils/error.js";
import { pagination } from "../validators/common.validator.js";
export async function list(user, q) {
  const publicList = !user || user.role === "CUSTOMER";
  let area = {};
  if (q.city) area.city = { equals: q.city, mode: "insensitive" };
  if (q.zone) area.zone = { equals: q.zone, mode: "insensitive" };
  const where = {
    ...area,
    ...(publicList ? { active: true, startsAt: { gt: new Date() } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.deliverySlot.findMany({
      where,
      ...pagination(q),
      orderBy: { startsAt: "asc" },
    }),
    db.deliverySlot.count({ where }),
  ]);
  return {
    items: rows.map((s) => ({
      ...s,
      available: Math.max(0, s.capacity - s.reserved),
    })),
    total,
    page: q.page,
    limit: q.limit,
  };
}
export async function save(user, id, input) {
  return transaction(async (tx) => {
    const current = id
      ? await tx.deliverySlot.findUnique({ where: { id } })
      : null;
    if (id) assert(current, 404, "Delivery slot not found");
    const value = { ...current, ...input };
    assert(
      value.endsAt > value.startsAt &&
        (value.startsAt > new Date() ||
          (id && input.startsAt === undefined && input.endsAt === undefined)),
      422,
      "Delivery slots must start in the future and end after the start",
    );
    assert(
      value.capacity >= (current?.reserved || 0),
      409,
      "Capacity cannot be lower than existing reservations",
    );
    if (current?.reserved)
      assert(
        ["city", "zone", "startsAt", "endsAt"].every(
          (k) =>
            input[k] === undefined || String(input[k]) === String(current[k]),
        ),
        409,
        "Reserved slot location and time cannot be changed",
      );
    const row = id
      ? await tx.deliverySlot.update({ where: { id }, data: input })
      : await tx.deliverySlot.create({ data: input });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: id ? "DELIVERY_SLOT_UPDATED" : "DELIVERY_SLOT_CREATED",
        entityId: row.id,
      },
    });
    return row;
  });
}
export async function reserveSlot(tx, id, address, reserve) {
  if (!id) return null;
  const slot = await tx.deliverySlot.findUnique({ where: { id } });
  assert(
    slot?.active && slot.startsAt > new Date(),
    422,
    "Delivery slot is unavailable",
  );
  assert(
    slot.city.toLowerCase() === address.city.toLowerCase() &&
      slot.zone.toLowerCase() === address.zone.toLowerCase(),
    422,
    "Delivery slot does not serve this address",
  );
  assert(slot.reserved < slot.capacity, 409, "Delivery slot is full");
  if (reserve) {
    const result = await tx.deliverySlot.updateMany({
      where: { id, active: true, reserved: { lt: slot.capacity } },
      data: { reserved: { increment: 1 } },
    });
    assert(result.count, 409, "Delivery slot is full");
  }
  return slot;
}
export async function releaseCancelledSlot(tx, parentId) {
  const order = await tx.order.findUnique({
    where: { id: parentId },
    include: { vendorOrders: { select: { status: true } } },
  });
  if (
    order?.deliverySlotId &&
    order.vendorOrders.every((o) => o.status === "CANCELLED")
  ) {
    await tx.deliverySlot.update({
      where: { id: order.deliverySlotId },
      data: { reserved: { decrement: 1 } },
    });
    await tx.order.update({
      where: { id: parentId },
      data: { deliverySlotId: null },
    });
  }
}
