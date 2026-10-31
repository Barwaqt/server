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

test("admin customer search, totals, purchase snapshots and access restrictions", async () => {
  const admin = await actor("ADMIN"),
    buyer = await actor("CUSTOMER"),
    other = await actor("CUSTOMER"),
    owner = await actor("VENDOR");
  await db.user.update({
    where: { id: buyer.id },
    data: {
      firstName: "Purchase",
      lastName: "History",
      phone: "+923009998877",
    },
  });
  const vendor = await db.vendor.create({
    data: {
      ownerId: owner.id,
      name: "History store",
      slug: randomUUID(),
      businessType: "Retail",
      city: "Lahore",
      zone: "Central",
      address: "Market",
    },
  });
  const category = await db.category.create({
    data: { name: "History category", slug: randomUUID() },
  });
  const product = await db.product.create({
    data: {
      reviewStatus: "APPROVED",
      vendorId: vendor.id,
      categoryId: category.id,
      name: "Current name",
      slug: randomUUID(),
      priceMinor: 9999,
      images: [],
    },
  });
  for (const [index, status] of ["DELIVERED", "CANCELLED", "NEW"].entries()) {
    await db.order.create({
      data: {
        id: "barwaqt-99000" + index,
        customerId: buyer.id,
        idempotencyKey: randomUUID(),
        requestHash: "test",
        address: {},
        subtotalMinor: 1000,
        discountMinor: 0,
        deliveryMinor: 100,
        totalMinor: 1100,
        vendorOrders: {
          create: {
            id: "barwaqt-99100" + index,
            vendorId: vendor.id,
            status,
            subtotalMinor: 1000,
            discountMinor: 0,
            deliveryMinor: 100,
            totalMinor: 1100,
            commissionMinor: 100,
            payableMinor: 900,
            items: {
              create: {
                productId: product.id,
                name: "Original purchased name",
                image: "/shop/product-0-0.webp",
                quantity: 2,
                unitPriceMinor: 500,
              },
            },
          },
        },
      },
    });
  }
  await db.refund.create({
    data: {
      vendorOrderId: "barwaqt-991000",
      amountMinor: 200,
      reason: "Partial refund",
      reference: randomUUID(),
      createdBy: admin.id,
    },
  });
  assert.equal((await call("get", "/admin/customers", buyer)).status, 403);
  assert.equal(
    (await call("get", "/admin/customers/" + buyer.id, owner)).status,
    403,
  );
  assert.equal((await call("get", "/admin/customers")).status, 401);
  const list = await ok(
    call("get", "/admin/customers?search=Purchase%20History&limit=1", admin),
  );
  assert.equal(list.total, 1);
  assert.equal(list.items[0].id, buyer.id);
  assert.equal(list.items[0].totalOrders, 3);
  assert.equal(list.items[0].totalSpentMinor, 900);
  assert.equal(list.items[0].passwordHash, undefined);
  const byPhone = await ok(
    call("get", "/admin/customers?search=9998877", admin),
  );
  assert.equal(byPhone.total, 1);
  const detail = await ok(
    call("get", "/admin/customers/" + buyer.id + "?limit=1&page=2", admin),
  );
  assert.equal(detail.orders.total, 3);
  assert.equal(detail.orders.items.length, 1);
  const shipment = detail.orders.items[0].vendorOrders[0];
  assert.equal(shipment.items[0].name, "Original purchased name");
  assert.equal(shipment.items[0].unitPriceMinor, 500);
  assert.equal(
    (await call("get", "/orders/" + shipment.id, admin)).status,
    200,
  );
  const empty = await ok(call("get", "/admin/customers/" + other.id, admin));
  assert.equal(empty.totalSpentMinor, 0);
  assert.equal(empty.totalOrders, 0);
  assert.deepEqual(empty.orders.items, []);
  assert.equal(
    (await call("get", "/admin/customers/" + owner.id, admin)).status,
    404,
  );
  assert.equal(
    (await call("get", "/admin/customers?page=0", admin)).status,
    422,
  );
});
