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
const { app } = await import("../src/app.js");
const { db } = await import("../src/config/database.js");
const { env } = await import("../src/config/env.js");
after(async () => {
  await db.storefrontPage.deleteMany({ where: { key: "settings" } });
  await db.$disconnect();
});
async function actor(role) {
  const user = await db.user.create({
    data: {
      email: `${randomUUID()}@settings.test`,
      role,
      passwordHash: "test-only-disabled",
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

test("admins set the delivery fee and quote prices the order with it", async () => {
  await db.storefrontPage.deleteMany({ where: { key: "settings" } });
  const admin = await actor("ADMIN"),
    owner = await actor("VENDOR"),
    buyer = await actor("CUSTOMER");
  assert.equal(
    (await call("put", "/admin/settings", buyer, { deliveryFeeMinor: 25000 }))
      .status,
    403,
  );
  assert.deepEqual(await ok(call("get", "/admin/settings", admin)), {
    deliveryFeeMinor: env.DELIVERY_FEE_MINOR,
  });
  assert.equal(
    (await call("put", "/admin/settings", admin, { deliveryFeeMinor: -1 }))
      .status,
    422,
  );
  await ok(call("put", "/admin/settings", admin, { deliveryFeeMinor: 25000 }));
  assert.deepEqual(await ok(call("get", "/admin/settings", admin)), {
    deliveryFeeMinor: 25000,
  });

  const vendor = await db.vendor.create({
    data: {
      ownerId: owner.id,
      name: "Settings store",
      slug: randomUUID(),
      businessType: "Retail",
      city: "Lahore",
      zone: "Central",
      address: "Test",
    },
  });
  const category = await db.category.create({
    data: { name: "Settings category", slug: randomUUID() },
  });
  const product = await db.product.create({
    data: {
      name: "Settings product",
      slug: randomUUID(),
      vendorId: vendor.id,
      categoryId: category.id,
      priceMinor: 10000,
      stock: 10,
      images: [],
      reviewStatus: "APPROVED",
    },
  });
  const address = await db.address.create({
    data: {
      userId: buyer.id,
      firstName: "Buyer",
      phone: "+923001234567",
      city: "Lahore",
      zone: "Central",
      street: "Test",
    },
  });
  await db.cartItem.create({
    data: { userId: buyer.id, productId: product.id, quantity: 1 },
  });
  const quote = await ok(
    call("post", "/orders/quote", buyer, { addressId: address.id }),
  );
  assert.equal(quote.deliveryMinor, 25000);
  assert.equal(quote.totalMinor, 10000 + 25000);
  assert.equal(
    (await db.auditLog.count({ where: { action: "SETTINGS_UPDATED" } })) > 0,
    true,
  );
});
