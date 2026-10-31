import { categoryDiscount } from "../utils/coupon-discount.js";
import { descendantCategoryIds } from "../utils/category-tree.js";
import { createPayment, syncPayment } from "./payment.service.js";
import { reserveSlot, releaseCancelledSlot } from "./delivery.service.js";
import { db, transaction } from "../config/database.js";
import { deliveryFeeMinor } from "./settings.service.js";
import { assert, ApiError } from "../utils/error.js";
import { hashToken } from "../utils/security.js";
import { allocate, percentage } from "../utils/money.js";
import { orderInclude, sanitizeOrder } from "../models/order.model.js";
import { allocateOrderNumber } from "../utils/order-number.js";
import { pagination } from "../validators/common.validator.js";
const ended = ["DELIVERED", "CANCELLED", "RETURNED"];
async function notify(tx, userId, title, body) {
  await tx.notification.create({ data: { userId, title, body } });
}
async function prepareCheckout(tx, user, input, reserve = false) {
  const address = await tx.address.findFirst({
    where: { id: input.addressId, userId: user.id },
  });
  assert(address, 404, "Address not found");
  const cart = await tx.cartItem.findMany({
    where: {
      userId: user.id,
      ...(input.productIds ? { productId: { in: input.productIds } } : {}),
    },
    include: {
      product: {
        include: { vendor: true, catalogCategories: { select: { id: true } } },
      },
    },
  });
  assert(cart.length, 422, "Cart is empty");
  if (input.productIds)
    assert(
      cart.length === new Set(input.productIds).size,
      409,
      "A selected product is no longer in your cart",
    );
  assert(cart.length <= 100, 422, "Cart cannot exceed 100 distinct products");
  const deliverySlot = await reserveSlot(
    tx,
    input.deliverySlotId,
    address,
    reserve,
  );
  const grouped = new Map();
  for (const item of cart) {
    const p = item.product;
    assert(
      p.active &&
        p.reviewStatus === "APPROVED" &&
        p.vendor.status === "APPROVED",
      409,
      `${p.name} is unavailable`,
    );
    assert(
      p.vendor.city.toLowerCase() === address.city.toLowerCase() &&
        p.vendor.zone.toLowerCase() === address.zone.toLowerCase(),
      422,
      `${p.vendor.name} delivers to ${p.vendor.zone}, ${p.vendor.city}. Your selected address is ${address.zone}, ${address.city}. Edit the address if its city or area is incorrect, or choose a vendor serving your location.`,
    );
    assert(p.stock >= item.quantity, 409, `${p.name} has insufficient stock`);
    if (reserve) {
      const stock = await tx.product.updateMany({
        where: {
          id: p.id,
          stock: { gte: item.quantity },
          active: true,
          reviewStatus: "APPROVED",
        },
        data: { stock: { decrement: item.quantity } },
      });
      assert(stock.count, 409, `${p.name} has insufficient stock`);
    }
    const list = grouped.get(p.vendorId) || [];
    list.push(item);
    grouped.set(p.vendorId, list);
  }
  const groups = [...grouped.values()];
  const subtotals = groups.map((items) =>
    items.reduce((s, i) => s + i.product.priceMinor * i.quantity, 0),
  );
  const subtotal = subtotals.reduce((a, b) => a + b, 0);
  assert(subtotal <= 1000000000, 422, "Order exceeds the maximum value");
  let discounts = subtotals.map(() => 0);
  let discount = 0,
    coupon;
  if (input.couponCode) {
    coupon = await tx.coupon.findUnique({
      where: { code: input.couponCode.toUpperCase() },
    });
    assert(
      coupon &&
        coupon.active &&
        coupon.expiresAt > new Date() &&
        coupon.used < coupon.maxUses,
      422,
      "Coupon is invalid, expired or exhausted",
    );
    ({ discount, discounts } = categoryDiscount(groups, {
      ...coupon,
      categoryIds: [
        ...descendantCategoryIds(
          await tx.category.findMany({
            select: { id: true, slug: true, parentSlug: true },
          }),
          coupon.categoryIds,
        ),
      ],
    }));
    if (reserve)
      await tx.coupon.update({
        where: { id: coupon.id },
        data: { used: { increment: 1 } },
      });
  }
  const deliveryFee = await deliveryFeeMinor(tx);
  const fees = allocate(deliveryFee, subtotals);
  return {
    deliverySlot,
    address,
    groups,
    subtotals,
    subtotal,
    discount,
    coupon,
    discounts,
    deliveryFee,
    fees,
  };
}
export async function quote(user, input) {
  return transaction(async (tx) => {
    const p = await prepareCheckout(tx, user, input);
    return {
      currency: "PKR",
      paymentMethods: [
        "COD",
        ...(
          await tx.paymentAccount.findMany({
            where: { active: true },
            select: { method: true },
          })
        ).map((a) => a.method),
      ],
      addressId: p.address.id,
      deliverySlot: p.deliverySlot,
      subtotalMinor: p.subtotal,
      discountMinor: p.discount,
      deliveryMinor: p.deliveryFee,
      totalMinor: p.subtotal - p.discount + p.deliveryFee,
      vendorOrders: p.groups.map((items, i) => ({
        vendorId: items[0].product.vendorId,
        vendorName: items[0].product.vendor.name,
        subtotalMinor: p.subtotals[i],
        discountMinor: p.discounts[i],
        deliveryMinor: p.fees[i],
        totalMinor: p.subtotals[i] - p.discounts[i] + p.fees[i],
        items: items.map((item) => ({
          productId: item.productId,
          name: item.product.name,
          quantity: item.quantity,
          unitPriceMinor: item.product.priceMinor,
          images: item.product.images,
        })),
      })),
    };
  });
}

export async function checkout(user, input, key) {
  assert(
    key && /^[a-zA-Z0-9_-]{8,100}$/.test(key),
    422,
    "Provide an Idempotency-Key header (8–100 letters, digits, - or _)",
  );
  assert(
    input.paymentMethod !== "CARD",
    503,
    "Card processing is not configured",
  );
  const requestHash = hashToken(JSON.stringify(input));
  // A six-digit ID can collide under load; the unique constraint rolls the
  // transaction back, so retry with fresh numbers.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await transaction(async (tx) => {
        const previous = await tx.order.findUnique({
          where: {
            customerId_idempotencyKey: {
              customerId: user.id,
              idempotencyKey: key,
            },
          },
          include: orderInclude,
        });
        if (previous) {
          assert(
            previous.requestHash === requestHash,
            409,
            "Idempotency key was used with a different request",
          );
          return sanitizeOrder(previous);
        }
        const {
          deliverySlot,
          address,
          groups,
          subtotals,
          subtotal,
          discount,
          coupon,
          discounts,
          deliveryFee,
          fees,
        } = await prepareCheckout(tx, user, input, true);
        const { userId, ...snapshot } = address;
        const reserved = new Set();
        const parent = await tx.order.create({
          data: {
            id: await allocateOrderNumber(tx, reserved),
            customerId: user.id,
            paymentMethod: input.paymentMethod,
            idempotencyKey: key,
            requestHash,
            address: snapshot,
            deliverySlotId: deliverySlot?.id,
            deliveryWindow: deliverySlot
              ? {
                  startsAt: deliverySlot.startsAt.toISOString(),
                  endsAt: deliverySlot.endsAt.toISOString(),
                  city: deliverySlot.city,
                  zone: deliverySlot.zone,
                }
              : undefined,
            subtotalMinor: subtotal,
            discountMinor: discount,
            deliveryMinor: deliveryFee,
            totalMinor: subtotal - discount + deliveryFee,
            couponId: coupon?.id,
          },
        });
        await createPayment(tx, parent, input.paymentMethod);
        for (let i = 0; i < groups.length; i++) {
          const items = groups[i];
          const vendor = items[0].product.vendor;
          const net = subtotals[i] - discounts[i];
          const commission = percentage(net, vendor.commissionBps);
          const child = await tx.vendorOrder.create({
            data: {
              id: await allocateOrderNumber(tx, reserved),
              orderId: parent.id,
              vendorId: vendor.id,
              subtotalMinor: subtotals[i],
              discountMinor: discounts[i],
              deliveryMinor: fees[i],
              totalMinor: net + fees[i],
              commissionMinor: commission,
              payableMinor: net - commission,
              items: {
                create: items.map((item) => ({
                  productId: item.productId,
                  name: item.product.name,
                  unitPriceMinor: item.product.priceMinor,
                  quantity: item.quantity,
                  image: item.product.images[0],
                })),
              },
              events: { create: { actorId: user.id, status: "NEW" } },
            },
          });
          await notify(
            tx,
            vendor.ownerId,
            "New order",
            input.paymentMethod === "COD"
              ? `Order ${child.id} is waiting for acceptance.`
              : `Order ${child.id} is awaiting platform payment verification.`,
          );
        }
        await tx.cartItem.deleteMany({
          where: {
            userId: user.id,
            ...(input.productIds
              ? { productId: { in: input.productIds } }
              : {}),
          },
        });
        return sanitizeOrder(
          await tx.order.findUnique({
            where: { id: parent.id },
            include: orderInclude,
          }),
        );
      });
    } catch (error) {
      if (error.code !== "P2002") throw error;
    }
  }
  throw new ApiError(
    503,
    "Could not allocate a unique order number. Please retry.",
  );
}
export async function list(user, q) {
  if (user.role === "CUSTOMER")
    return (
      await db.order.findMany({
        where: {
          customerId: user.id,
          ...(q.status ? { vendorOrders: { some: { status: q.status } } } : {}),
        },
        ...pagination(q),
        include: orderInclude,
        orderBy: { createdAt: "desc" },
      })
    ).map(sanitizeOrder);
  const where = {
    ...(user.role === "VENDOR"
      ? { vendorId: user.vendor.id }
      : user.role === "RIDER"
        ? { riderId: user.id }
        : {}),
    ...(q.status ? { status: q.status } : {}),
  };
  return (
    await db.vendorOrder.findMany({
      where,
      ...pagination(q),
      include: {
        items: true,
        vendor: {
          select: { name: true, address: true, city: true, zone: true },
        },
        rider: { select: { firstName: true, lastName: true, phone: true } },
        order: {
          select: {
            id: true,
            address: true,
            customer: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
            payment: { select: { status: true } },
            currency: true,
            paymentMethod: true,
            deliveryWindow: true,
          },
        },
        events: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    })
  ).map(sanitizeOrder);
}
export async function get(user, id) {
  if (user.role === "CUSTOMER") {
    const order = await db.order.findFirst({
      where: { id, customerId: user.id },
      include: orderInclude,
    });
    assert(order, 404, "Order not found");
    return sanitizeOrder(order);
  }
  const order = await db.vendorOrder.findFirst({
    where: {
      id,
      ...(user.role === "VENDOR"
        ? { vendorId: user.vendor.id }
        : user.role === "RIDER"
          ? { riderId: user.id }
          : {}),
    },
    include: {
      items: true,
      vendor: { select: { name: true, address: true, city: true, zone: true } },
      rider: { select: { firstName: true, lastName: true, phone: true } },
      events: true,
      order: {
        select: {
          id: true,
          address: true,
          customer: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          payment: { select: { status: true } },
          currency: true,
          paymentMethod: true,
          deliveryWindow: true,
        },
      },
    },
  });
  assert(order, 404, "Order not found");
  return sanitizeOrder(order);
}
async function releaseRider(tx, riderId) {
  if (!riderId) return;
  const active = await tx.vendorOrder.count({
    where: { riderId, status: { in: ["ASSIGNED", "PICKED_UP", "FAILED"] } },
  });
  if (!active)
    await tx.shift.updateMany({
      where: { riderId, endedAt: null, status: "BUSY" },
      data: { status: "AVAILABLE" },
    });
}
export async function assign(actor, id, riderId) {
  return transaction(async (tx) => {
    const order = await tx.vendorOrder.findUnique({
      where: { id },
      include: { vendor: { select: { ownerId: true } } },
    });
    assert(order?.status === "READY", 409, "Only ready orders can be assigned");
    const rider = await tx.user.findFirst({
      where: { id: riderId, role: "RIDER", active: true },
    });
    assert(rider, 404, "Rider not found");
    const shift = await tx.shift.findFirst({
      where: { riderId, endedAt: null, status: "AVAILABLE" },
    });
    assert(shift, 409, "Rider must be on an available shift");
    await tx.shift.update({
      where: { id: shift.id },
      data: { status: "BUSY" },
    });
    const result = await tx.vendorOrder.update({
      where: { id },
      data: {
        riderId,
        status: "ASSIGNED",
        events: { create: { actorId: actor.id, status: "ASSIGNED" } },
      },
    });
    await notify(
      tx,
      riderId,
      "Delivery assigned",
      `Collect vendor order ${id}.`,
    );
    await notify(
      tx,
      order.vendor.ownerId,
      "Rider assigned",
      `Order ${id}: a rider has been assigned for pickup.`,
    );
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "RIDER_ASSIGNED",
        entityId: id,
        metadata: { riderId },
      },
    });
    return sanitizeOrder(result);
  });
}
export async function transition(actor, id, input) {
  const result = await transaction(async (tx) => {
    const order = await tx.vendorOrder.findUnique({
      where: { id },
      include: { items: true, order: true, vendor: true },
    });
    assert(order, 404, "Order not found");
    const ownVendor =
      actor.role === "VENDOR" && actor.vendor?.id === order.vendorId;
    const ownCustomer =
      actor.role === "CUSTOMER" && order.order.customerId === actor.id;
    const ownRider = actor.role === "RIDER" && order.riderId === actor.id;
    const dispatch = ["ADMIN", "DISPATCHER"].includes(actor.role);
    let status;
    switch (input.action) {
      case "accept":
        assert(ownVendor, 403, "Vendor ownership required");
        assert(order.status === "NEW", 409, "Order is not new");
        assert(
          order.order.paymentMethod === "COD" || order.cashReceived,
          409,
          "Payment must be verified by the platform before acceptance",
        );
        status = "PREPARING";
        break;
      case "reject":
        assert(ownVendor, 403, "Vendor ownership required");
        assert(order.status === "NEW", 409, "Only new orders may be rejected");
        assert(input.reason, 422, "Reason required");
        status = "CANCELLED";
        break;
      case "ready":
        assert(ownVendor, 403, "Vendor ownership required");
        assert(order.status === "PREPARING", 409, "Order is not preparing");
        status = "READY";
        break;
      case "cancel":
        assert(
          ownCustomer || actor.role === "ADMIN",
          403,
          "Order ownership required",
        );
        assert(order.status === "NEW", 409, "Only new orders may be cancelled");
        status = "CANCELLED";
        break;
      case "pickup":
        assert(ownRider, 403, "Assigned rider required");
        assert(order.status === "ASSIGNED", 409, "Order is not assigned");
        status = "PICKED_UP";
        break;
      case "deliver":
        assert(ownRider, 403, "Assigned rider required");
        assert(
          order.status === "PICKED_UP",
          409,
          "Pickup is required before delivery",
        );
        assert(
          input.proofImage &&
            /^\/api\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
              input.proofImage,
            ),
          422,
          "Attach a photo of the delivery location",
        );
        assert(
          await tx.upload.findFirst({
            where: {
              id: input.proofImage.slice("/api/media/".length),
              ownerId: actor.id,
              kind: "IMAGE",
            },
            select: { id: true },
          }),
          422,
          "Delivery photo not found",
        );
        assert(
          order.order.paymentMethod === "COD"
            ? input.cashCollectedMinor === order.totalMinor
            : order.cashReceived && (input.cashCollectedMinor ?? 0) === 0,
          422,
          "Correct cash amount required (zero for prepaid orders)",
        );
        status = "DELIVERED";
        break;
      case "fail":
        assert(ownRider, 403, "Assigned rider required");
        assert(
          ["ASSIGNED", "PICKED_UP"].includes(order.status),
          409,
          "Order cannot fail at this stage",
        );
        assert(input.reason, 422, "Failure reason required");
        status = "FAILED";
        break;
      case "retry":
        assert(dispatch, 403, "Dispatcher required");
        assert(
          order.status === "FAILED",
          409,
          "Only failed orders can be retried",
        );
        status = "ASSIGNED";
        break;
      case "return":
        assert(dispatch, 403, "Dispatcher required");
        assert(
          order.status === "FAILED",
          409,
          "Only failed orders can be returned",
        );
        assert(input.reason, 422, "Return reason required");
        status = "RETURNED";
        break;
      default:
        throw new ApiError(422, "Unsupported action");
    }
    if (ownVendor)
      assert(actor.vendor.status === "APPROVED", 403, "Vendor suspended");
    if (["CANCELLED", "RETURNED"].includes(status))
      for (const item of order.items)
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
    const updated = await tx.vendorOrder.update({
      where: { id },
      data: {
        status,
        ...(status === "DELIVERED"
          ? {
              codCollectedMinor:
                order.order.paymentMethod === "COD" ? order.totalMinor : 0,
              deliveredAt: new Date(),
              proofImage: input.proofImage,
            }
          : {}),
        ...(status === "FAILED" ? { failureReason: input.reason } : {}),
        events: { create: { actorId: actor.id, status, note: input.reason } },
      },
    });
    if (status === "CANCELLED") await releaseCancelledSlot(tx, order.orderId);
    if (["CANCELLED", "RETURNED"].includes(status))
      await syncPayment(tx, order.orderId);
    if (ended.includes(status)) await releaseRider(tx, order.riderId);
    await notify(
      tx,
      order.order.customerId,
      "Order updated",
      `Order ${id}: ${status}.`,
    );
    if (actor.id !== order.vendor.ownerId) {
      await notify(
        tx,
        order.vendor.ownerId,
        "Order updated",
        `Order ${id}: ${status}.`,
      );
    }
    if (["DELIVERED", "FAILED", "RETURNED"].includes(status)) {
      const admins = await tx.user.findMany({
        where: { role: "ADMIN", active: true },
        select: { id: true },
      });
      if (admins.length)
        await tx.notification.createMany({
          data: admins.map((admin) => ({
            userId: admin.id,
            title: "Order updated",
            body: `Order ${id}: ${status}.${status === "DELIVERED" && order.order.paymentMethod === "COD" ? " COD collected by rider; record cash receipt in Finance before settlement." : ""}`,
          })),
        });
    }
    await tx.auditLog.create({
      data: { actorId: actor.id, action: `ORDER_${status}`, entityId: id },
    });
    return sanitizeOrder(updated);
  });
  return result;
}
export async function location(actor, id, input) {
  const result = await db.vendorOrder.updateMany({
    where: { id, riderId: actor.id, status: { in: ["ASSIGNED", "PICKED_UP"] } },
    data: { ...input, locationAt: new Date() },
  });
  assert(result.count, 404, "Active assignment not found");
  return { updated: true };
}
