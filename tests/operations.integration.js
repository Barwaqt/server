import { test, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
if (
  process.env.NODE_ENV !== "test" ||
  !process.env.DATABASE_URL?.includes("barwaqt_test")
)
  throw Error("Use an isolated barwaqt_test database");
process.env.UPLOAD_DIR = "/tmp/barwaqt-operation-test-uploads";
const { app } = await import("../src/app.js");
const { db } = await import("../src/config/database.js");
const { env } = await import("../src/config/env.js");
after(() => db.$disconnect());
const suffix = randomUUID().slice(0, 8);
async function actor(role) {
  const user = await db.user.create({
    data: {
      email: `${role}-${randomUUID()}@operations.test`,
      role,
      passwordHash: "disabled-test-login",
      firstName: role,
    },
  });
  const session = await db.session.create({
    data: {
      userId: user.id,
      tokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  return {
    ...user,
    token: jwt.sign({ sid: session.id }, env.JWT_SECRET, {
      subject: user.id,
      issuer: "barwaqt",
      audience: "barwaqt-api",
      expiresIn: "1h",
    }),
  };
}
function call(method, path, user, body) {
  let r = request(app)[method]("/api/v1" + path);
  if (user) r = r.set("Authorization", "Bearer " + user.token);
  return body ? r.send(body) : r;
}
async function ok(p) {
  const r = await p;
  assert.ok(r.status < 300, `${r.status}: ${JSON.stringify(r.body)}`);
  return r.body.data;
}
test("management, uploads, scheduled checkout and returns after paid settlement", async () => {
  const admin = await actor("ADMIN"),
    customer = await actor("CUSTOMER"),
    other = await actor("CUSTOMER"),
    owner = await actor("VENDOR");
  const vendor = await db.vendor.create({
    data: {
      ownerId: owner.id,
      name: "Operations vendor",
      slug: "ops-" + suffix,
      city: "Lahore",
      zone: "Central",
      address: "Main Road",
      businessType: "Retail",
      status: "APPROVED",
      commissionBps: 1000,
    },
  });
  const category = await ok(
    call("post", "/admin/categories", admin, {
      name: "Test category",
      slug: "ops-category-" + suffix,
    }),
  );
  assert.equal(
    (
      await call("post", "/admin/categories", customer, {
        name: "Bad",
        slug: "bad",
      })
    ).status,
    403,
  );
  const child = await ok(
    call("post", "/admin/categories", admin, {
      name: "Child",
      slug: "ops-child-" + suffix,
      parentSlug: category.slug,
    }),
  );
  assert.equal(
    (
      await call("patch", "/admin/categories/" + category.id, admin, {
        parentSlug: child.slug,
      })
    ).status,
    422,
  );
  await ok(
    call("patch", "/admin/categories/" + category.id, admin, {
      slug: "ops-renamed-" + suffix,
    }),
  );
  assert.equal(
    (await db.category.findUnique({ where: { id: child.id } })).parentSlug,
    "ops-renamed-" + suffix,
  );
  assert.equal(
    (await call("delete", "/admin/categories/" + category.id, admin)).status,
    409,
  );
  await ok(call("delete", "/admin/categories/" + child.id, admin));
  const coupon = await ok(
    call("post", "/admin/coupons", admin, {
      code: "OPS_" + suffix.toUpperCase(),
      percentBps: 1000,
      maxDiscountMinor: 10000,
      maxUses: 2,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }),
  );
  await ok(
    call("patch", "/admin/coupons/" + coupon.id, admin, { active: false }),
  );
  await ok(call("delete", "/admin/coupons/" + coupon.id, admin));
  const upload = await ok(
    call("post", "/uploads", owner, {
      filename: "pixel.png",
      kind: "IMAGE",
      data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=",
    }),
  );
  assert.equal(
    (await call("get", `/uploads/${upload.id}/content`)).status,
    200,
  );
  assert.equal(
    (
      await call("post", "/uploads", owner, {
        filename: "unsafe.svg",
        kind: "IMAGE",
        data: Buffer.from("<svg/>").toString("base64"),
      })
    ).status,
    422,
  );
  const pdf = await ok(
    call("post", "/uploads", owner, {
      filename: "business.pdf",
      kind: "DOCUMENT",
      data: Buffer.from("%PDF-1.4\nfixture").toString("base64"),
    }),
  );
  assert.equal((await call("get", `/uploads/${pdf.id}/content`)).status, 401);
  assert.equal(
    (await call("get", `/uploads/${pdf.id}/content`, customer)).status,
    403,
  );
  assert.equal(
    (await call("get", `/uploads/${pdf.id}/content`, admin)).status,
    200,
  );
  await ok(call("delete", "/uploads/" + pdf.id, owner));
  const product = await ok(
    call("post", "/vendor/products", owner, {
      name: "Fixture product",
      slug: "ops-product-" + suffix,
      categoryId: category.id,
      priceMinor: 10000,
      stock: 10,
      images: [upload.url],
    }),
  );
  assert.equal(
    (await call("delete", "/uploads/" + upload.id, owner)).status,
    409,
  );
  await ok(
    call("post", `/admin/products/${product.id}/review`, admin, {
      decision: "APPROVED",
      reviewVersion: product.reviewVersion,
    }),
  );
  const slot = await ok(
    call("post", "/delivery/slots", admin, {
      city: "Lahore",
      zone: "Central",
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      endsAt: new Date(Date.now() + 90000000).toISOString(),
      capacity: 1,
    }),
  );
  const address = await ok(
    call("post", "/customer/addresses", customer, {
      kind: "Home",
      city: "Lahore",
      zone: "Central",
      street: "Main Road",
      firstName: "Test",
      phone: "+923001234567",
    }),
  );
  await ok(
    call("put", "/customer/cart/" + product.id, customer, { quantity: 1 }),
  );
  const payload = {
    addressId: address.id,
    deliverySlotId: slot.id,
    paymentMethod: "COD",
  };
  const quote = await ok(call("post", "/orders/quote", customer, payload));
  assert.equal(quote.deliverySlot.id, slot.id);
  assert.equal(
    (await db.deliverySlot.findUnique({ where: { id: slot.id } })).reserved,
    0,
  );
  const checkout = () =>
    call("post", "/orders/checkout", customer, payload).set(
      "Idempotency-Key",
      randomUUID(),
    );
  const order = await ok(checkout());
  assert.equal(order.deliverySlotId, slot.id);
  assert.ok(order.deliveryWindow.startsAt);
  await ok(
    call("put", "/customer/cart/" + product.id, customer, { quantity: 1 }),
  );
  assert.equal((await checkout()).status, 409);
  assert.equal(
    (
      await call("patch", "/delivery/slots/" + slot.id, admin, {
        zone: "Other",
      })
    ).status,
    409,
  );
  await ok(
    call("post", "/orders/" + order.vendorOrders[0].id + "/actions", customer, {
      action: "cancel",
    }),
  );
  assert.equal(
    (await db.deliverySlot.findUnique({ where: { id: slot.id } })).reserved,
    0,
  );
  const next = await ok(checkout()),
    shipment = next.vendorOrders[0];
  await db.vendorOrder.update({
    where: { id: shipment.id },
    data: {
      status: "DELIVERED",
      deliveredAt: new Date(),
      cashReceived: true,
      codCollectedMinor: shipment.totalMinor,
    },
  });
  const settlement = await ok(
    call("post", "/finance/settlements", admin, { vendorId: vendor.id }),
  );
  await ok(
    call("patch", "/finance/settlements/" + settlement.id, admin, {
      status: "PROCESSED",
    }),
  );
  await ok(
    call("patch", "/finance/settlements/" + settlement.id, admin, {
      status: "PAID",
      reference: "payout-" + suffix,
    }),
  );
  assert.equal(
    (
      await call("post", "/returns", other, {
        vendorOrderId: shipment.id,
        reason: "Wrong items delivered",
      })
    ).status,
    404,
  );
  const returned = await ok(
    call("post", "/returns", customer, {
      vendorOrderId: shipment.id,
      reason: "Wrong items delivered",
    }),
  );
  assert.equal((await ok(call("get", "/returns", other))).total, 0);
  assert.equal((await ok(call("get", "/returns", owner))).total, 1);
  assert.equal(
    (
      await call("post", "/returns/" + returned.id + "/actions", customer, {
        action: "approve",
      })
    ).status,
    403,
  );
  const refund = {
    amountMinor: 10000,
    reason: "Full return",
    reference: "refund-" + suffix,
  };
  assert.equal(
    (
      await call(
        "post",
        `/finance/orders/${shipment.id}/refunds`,
        admin,
        refund,
      )
    ).status,
    409,
  );
  await ok(
    call("post", "/returns/" + returned.id + "/actions", admin, {
      action: "approve",
    }),
  );
  const stock = (await db.product.findUnique({ where: { id: product.id } }))
    .stock;
  await ok(
    call("post", "/returns/" + returned.id + "/actions", admin, {
      action: "receive",
      restock: true,
    }),
  );
  assert.equal(
    (await db.product.findUnique({ where: { id: product.id } })).stock,
    stock + 1,
  );
  assert.equal(
    (
      await call("post", "/returns/" + returned.id + "/actions", admin, {
        action: "receive",
        restock: true,
      })
    ).status,
    409,
  );
  const recorded = await ok(
    call("post", `/finance/orders/${shipment.id}/refunds`, admin, refund),
  );
  assert.equal(
    (
      await ok(
        call("post", `/finance/orders/${shipment.id}/refunds`, admin, refund),
      )
    ).id,
    recorded.id,
  );
  assert.equal(
    (await db.returnRequest.findUnique({ where: { id: returned.id } })).status,
    "REFUNDED",
  );
  const adjustment = await db.vendorAdjustment.findUnique({
    where: { refundId: recorded.id },
  });
  assert.equal(adjustment.amountMinor, -9000);
  assert.equal(
    (await db.settlement.findUnique({ where: { id: settlement.id } }))
      .amountMinor,
    9000,
  );
  assert.equal(
    (await ok(call("get", "/vendor/dashboard", owner))).pendingPayableMinor,
    -9000,
  );
  assert.ok(
    (await ok(call("get", "/finance/refunds", admin))).items.some(
      (r) => r.id === recorded.id,
    ),
  );
});
