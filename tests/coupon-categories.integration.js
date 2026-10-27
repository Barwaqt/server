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
after(() => db.$disconnect());
async function actor(role) {
  const user = await db.user.create({
    data: {
      email: `${randomUUID()}@category.test`,
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

test("coupon categories are validated and enforced in quote and checkout", async () => {
  const admin = await actor("ADMIN"),
    owner = await actor("VENDOR"),
    buyer = await actor("CUSTOMER");
  const vendor = await db.vendor.create({
    data: {
      ownerId: owner.id,
      name: "Coupon store",
      slug: randomUUID(),
      businessType: "Retail",
      city: "Lahore",
      zone: "Central",
      address: "Test",
    },
  });
  const a = await db.category.create({
      data: { name: "Eligible", slug: randomUUID() },
    }),
    b = await db.category.create({
      data: { name: "Other", slug: randomUUID() },
    });
  const create = (categoryId) =>
    db.product.create({
      data: {
        name: "Coupon product",
        slug: randomUUID(),
        categoryId,
        vendorId: vendor.id,
        priceMinor: 10000,
        stock: 10,
        reviewStatus: "APPROVED",
      },
    });
  const p = await create(a.id),
    other = await create(b.id);
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
  await db.cartItem.createMany({
    data: [p, other].map((product) => ({
      userId: buyer.id,
      productId: product.id,
      quantity: 1,
    })),
  });
  const body = {
    code: "CAT_" + randomUUID().slice(0, 8),
    categoryIds: [a.id],
    percentBps: 1000,
    maxDiscountMinor: 50000,
    minSubtotalMinor: 0,
    maxUses: 10,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
  assert.equal(
    (
      await call("post", "/admin/coupons", admin, {
        ...body,
        categoryIds: [randomUUID()],
      })
    ).status,
    422,
  );
  const coupon = await ok(call("post", "/admin/coupons", admin, body));
  let quote = await ok(
    call("post", "/orders/quote", buyer, {
      addressId: address.id,
      couponCode: coupon.code,
    }),
  );
  assert.equal(quote.discountMinor, 1000);
  assert.equal(
    (
      await call("post", "/orders/quote", buyer, {
        addressId: address.id,
        couponCode: coupon.code,
        productIds: [other.id],
      })
    ).status,
    422,
  );
  await ok(
    call("patch", "/admin/coupons/" + coupon.id, admin, {
      categoryIds: [a.id, b.id],
    }),
  );
  quote = await ok(
    call("post", "/orders/quote", buyer, {
      addressId: address.id,
      couponCode: coupon.code,
    }),
  );
  assert.equal(quote.discountMinor, 2000);
  await ok(
    call("patch", "/admin/coupons/" + coupon.id, admin, {
      categoryIds: [a.id],
    }),
  );
  const response = await request(app)
    .post("/api/v1/orders/checkout")
    .set("Authorization", "Bearer " + buyer.token)
    .set("Idempotency-Key", randomUUID())
    .send({
      addressId: address.id,
      couponCode: coupon.code,
      paymentMethod: "COD",
    });
  assert.ok(response.status < 300, JSON.stringify(response.body));
  assert.equal(response.body.data.discountMinor, 1000);
  assert.equal(
    (await db.coupon.findUnique({ where: { id: coupon.id } })).used,
    1,
  );
});

test("coupon categories cover subcategories and catalog collections", async () => {
  const admin = await actor("ADMIN"),
    owner = await actor("VENDOR"),
    buyer = await actor("CUSTOMER");
  const vendor = await db.vendor.create({
    data: {
      ownerId: owner.id,
      name: "Coupon tree store",
      slug: randomUUID(),
      businessType: "Retail",
      city: "Lahore",
      zone: "Central",
      address: "Test",
    },
  });
  const parent = await db.category.create({
      data: { name: "Parent", slug: randomUUID() },
    }),
    child = await db.category.create({
      data: { name: "Child", slug: randomUUID(), parentSlug: parent.slug },
    }),
    other = await db.category.create({
      data: { name: "Unrelated", slug: randomUUID() },
    });
  const create = (data) =>
    db.product.create({
      data: {
        name: "Coupon tree product",
        slug: randomUUID(),
        vendorId: vendor.id,
        priceMinor: 10000,
        stock: 10,
        reviewStatus: "APPROVED",
        ...data,
      },
    });
  const inChild = await create({
      categoryId: child.id,
      catalogCategories: { connect: [{ id: parent.id }, { id: child.id }] },
    }),
    inParent = await create({ categoryId: parent.id });
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
  await db.cartItem.createMany({
    data: [inChild, inParent].map((product) => ({
      userId: buyer.id,
      productId: product.id,
      quantity: 1,
    })),
  });
  const base = {
    code: "TREE_" + randomUUID().slice(0, 8),
    percentBps: 1000,
    maxDiscountMinor: 100000,
    minSubtotalMinor: 0,
    maxUses: 10,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
  const coupon = await ok(
    call("post", "/admin/coupons", admin, {
      ...base,
      categoryIds: [parent.id],
    }),
  );
  const quote = await ok(
    call("post", "/orders/quote", buyer, {
      addressId: address.id,
      couponCode: coupon.code,
    }),
  );
  assert.equal(quote.discountMinor, 2000);
  const unrelated = await ok(
    call("post", "/admin/coupons", admin, {
      ...base,
      code: "UNRELATED_" + randomUUID().slice(0, 8).toUpperCase(),
      categoryIds: [other.id],
    }),
  );
  assert.equal(
    (
      await call("post", "/orders/quote", buyer, {
        addressId: address.id,
        couponCode: unrelated.code,
      })
    ).status,
    422,
  );
});
