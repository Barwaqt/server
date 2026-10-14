import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { db, transaction } from "../config/database.js";
import { env } from "../config/env.js";
import { assert, ApiError } from "../utils/error.js";
import { hashToken } from "../utils/security.js";
import { allocate, percentage } from "../utils/money.js";
import { orderInclude, sanitizeOrder } from "../models/order.model.js";
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
    include: { product: { include: { vendor: true } } },
  });
  assert(cart.length, 422, "Cart is empty");
  if (input.productIds)
    assert(
      cart.length === new Set(input.productIds).size,
      409,
      "A selected product is no longer in your cart",
    );
  assert(cart.length <= 100, 422, "Cart cannot exceed 100 distinct products");
  const grouped = new Map();
  for (const item of cart) {
    const p = item.product;
    assert(
      p.active && p.vendor.status === "APPROVED",
      409,
      `${p.name} is unavailable`,
    );
    assert(
      p.vendor.city.toLowerCase() === address.city.toLowerCase() &&
        p.vendor.zone.toLowerCase() === address.zone.toLowerCase(),
      422,
      `${p.vendor.name} does not serve this address`,
    );
    assert(p.stock >= item.quantity, 409, `${p.name} has insufficient stock`);
    if (reserve) {
      const stock = await tx.product.updateMany({
        where: { id: p.id, stock: { gte: item.quantity }, active: true },
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
        coupon.used < coupon.maxUses &&
        subtotal >= coupon.minSubtotalMinor,
      422,
      "Coupon is invalid, expired or exhausted",
    );
    discount = Math.min(
      percentage(subtotal, coupon.percentBps),
      coupon.maxDiscountMinor,
    );
    if (reserve)
      await tx.coupon.update({
        where: { id: coupon.id },
        data: { used: { increment: 1 } },
      });
  }
  const discounts = allocate(discount, subtotals),
    fees = allocate(env.DELIVERY_FEE_MINOR, subtotals);
  return {
    address,
    groups,
    subtotals,
    subtotal,
    discount,
    coupon,
    discounts,
    fees,
  };
}
export async function quote(user, input) {
  return transaction(async (tx) => {
    const p = await prepareCheckout(tx, user, input);
    return {
      currency: "PKR",
      paymentMethods: ["COD"],
      addressId: p.address.id,
      subtotalMinor: p.subtotal,
      discountMinor: p.discount,
      deliveryMinor: env.DELIVERY_FEE_MINOR,
      totalMinor: p.subtotal - p.discount + env.DELIVERY_FEE_MINOR,
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
    input.paymentMethod === "COD",
    503,
    "Online payments are not configured; use COD",
  );
  const requestHash = hashToken(JSON.stringify(input));
  return transaction(async (tx) => {
    const previous = await tx.order.findUnique({
      where: {
        customerId_idempotencyKey: { customerId: user.id, idempotencyKey: key },
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
      address,
      groups,
      subtotals,
      subtotal,
      discount,
      coupon,
      discounts,
      fees,
    } = await prepareCheckout(tx, user, input, true);
    const { userId, ...snapshot } = address;
    const parent = await tx.order.create({
      data: {
        customerId: user.id,
        idempotencyKey: key,
        requestHash,
        address: snapshot,
        subtotalMinor: subtotal,
        discountMinor: discount,
        deliveryMinor: env.DELIVERY_FEE_MINOR,
        totalMinor: subtotal - discount + env.DELIVERY_FEE_MINOR,
        couponId: coupon?.id,
      },
    });
    for (let i = 0; i < groups.length; i++) {
      const items = groups[i];
      const vendor = items[0].product.vendor;
      const net = subtotals[i] - discounts[i];
      const commission = percentage(net, vendor.commissionBps);
      const pin = String(randomInt(100000, 1000000));
      const child = await tx.vendorOrder.create({
        data: {
          orderId: parent.id,
          vendorId: vendor.id,
          subtotalMinor: subtotals[i],
          discountMinor: discounts[i],
          deliveryMinor: fees[i],
          totalMinor: net + fees[i],
          commissionMinor: commission,
          payableMinor: net - commission,
          pinHash: await bcrypt.hash(pin, 8),
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
        user.id,
        "Delivery PIN",
        `Order ${child.id}: your delivery PIN is ${pin}. Share it only when receiving your order.`,
      );
      await notify(
        tx,
        vendor.ownerId,
        "New order",
        `Order ${child.id} is waiting for acceptance.`,
      );
    }
    await tx.cartItem.deleteMany({
      where: {
        userId: user.id,
        ...(input.productIds ? { productId: { in: input.productIds } } : {}),
      },
    });
    return sanitizeOrder(
      await tx.order.findUnique({
        where: { id: parent.id },
        include: orderInclude,
      }),
    );
  });
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
        order: {
          select: { address: true, currency: true, paymentMethod: true },
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
      events: true,
      order: { select: { address: true, currency: true, paymentMethod: true } },
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
    const order = await tx.vendorOrder.findUnique({ where: { id } });
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
          order.pinAttempts < 5,
          423,
          "PIN attempts exhausted; contact dispatch",
        );
        assert(
          input.pin && input.cashCollectedMinor === order.totalMinor,
          422,
          "Delivery PIN and exact COD amount required",
        );
        if (!(await bcrypt.compare(input.pin, order.pinHash))) {
          await tx.vendorOrder.update({
            where: { id },
            data: { pinAttempts: { increment: 1 } },
          });
          return { invalidPin: true };
        }
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
          ? { codCollectedMinor: order.totalMinor, deliveredAt: new Date() }
          : {}),
        ...(status === "FAILED" ? { failureReason: input.reason } : {}),
        events: { create: { actorId: actor.id, status, note: input.reason } },
      },
    });
    if (ended.includes(status)) await releaseRider(tx, order.riderId);
    await notify(
      tx,
      order.order.customerId,
      "Order updated",
      `Order ${id}: ${status}.`,
    );
    await tx.auditLog.create({
      data: { actorId: actor.id, action: `ORDER_${status}`, entityId: id },
    });
    return sanitizeOrder(updated);
  });
  if (result.invalidPin) throw new ApiError(422, "Incorrect delivery PIN");
  return result;
}
export async function resetPin(actor, id) {
  const pin = String(randomInt(100000, 1000000));
  return transaction(async (tx) => {
    const order = await tx.vendorOrder.findUnique({
      where: { id },
      include: { order: true },
    });
    assert(
      order && !ended.includes(order.status),
      409,
      "Order cannot receive a new PIN",
    );
    await tx.vendorOrder.update({
      where: { id },
      data: { pinHash: await bcrypt.hash(pin, 8), pinAttempts: 0 },
    });
    await notify(
      tx,
      order.order.customerId,
      "New delivery PIN",
      `Order ${id}: your new delivery PIN is ${pin}.`,
    );
    await tx.auditLog.create({
      data: { actorId: actor.id, action: "PIN_RESET", entityId: id },
    });
    return { message: "New PIN sent to customer notifications" };
  });
}
export async function location(actor, id, input) {
  const result = await db.vendorOrder.updateMany({
    where: { id, riderId: actor.id, status: { in: ["ASSIGNED", "PICKED_UP"] } },
    data: { ...input, locationAt: new Date() },
  });
  assert(result.count, 404, "Active assignment not found");
  return { updated: true };
}
