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

test("category commission is inherited, synchronized, and snapshotted; payout data stays private", async () => {
  const admin = await actor("ADMIN"),
    customer = await actor("CUSTOMER");
  const suffix = randomUUID();
  const a = await ok(
    call("post", "/admin/categories", admin, {
      name: "Default category",
      slug: "a-" + suffix,
    }),
  );
  const b = await ok(
    call("post", "/admin/categories", admin, {
      name: "Other category",
      slug: "b-" + suffix,
      commissionBps: 2500,
    }),
  );
  assert.equal(a.commissionBps, 1000);
  const input = {
    email: `vendor-${suffix}@category.test`,
    password: "SecurePassword123!",
    phone: "+923001234567",
    firstName: "Vendor",
    name: "Commission store",
    slug: "store-" + suffix,
    businessType: "Retail",
    city: "Lahore",
    zone: "Central",
    address: "Market road",
    categoryId: a.id,
    bankDetails: {
      method: "EASYPAISA",
      accountTitle: "Vendor",
      accountNumber: "03001234567",
    },
  };
  assert.equal(
    (await call("post", "/admin/vendors", customer, input)).status,
    403,
  );
  assert.equal(
    (
      await call("post", "/admin/vendors", admin, {
        ...input,
        categoryId: randomUUID(),
      })
    ).status,
    422,
  );
  const v = await ok(call("post", "/admin/vendors", admin, input));
  assert.equal(v.commissionBps, 1000);
  assert.equal(v.categoryId, a.id);
  assert.equal(v.bankDetails.bankName, "Easypaisa");
  const publicVendor = await ok(call("get", "/catalog/vendors/" + v.id));
  assert.equal(publicVendor.bankDetails, undefined);
  const product = await db.product.create({
    data: {
      reviewStatus: "APPROVED",
      vendorId: v.id,
      categoryId: b.id,
      name: "Test product",
      slug: "product-" + suffix,
      priceMinor: 100000,
      stock: 10,
    },
  });
  const address = await db.address.create({
    data: {
      userId: customer.id,
      kind: "Home",
      firstName: "Buyer",
      phone: "+923001234567",
      city: "Lahore",
      zone: "Central",
      street: "Main road",
    },
  });
  async function checkout() {
    await db.cartItem.create({
      data: { userId: customer.id, productId: product.id, quantity: 1 },
    });
    return ok(
      call("post", "/orders/checkout", customer, {
        addressId: address.id,
        paymentMethod: "COD",
      }).set("Idempotency-Key", randomUUID()),
    );
  }
  const first = await checkout();
  assert.equal(
    (
      await db.vendorOrder.findUnique({
        where: { id: first.vendorOrders[0].id },
      })
    ).commissionMinor,
    10000,
  );
  await ok(
    call("patch", "/admin/categories/" + a.id, admin, { commissionBps: 1250 }),
  );
  assert.equal(
    (await db.vendor.findUnique({ where: { id: v.id } })).commissionBps,
    1250,
  );
  assert.equal(
    (await db.category.findUnique({ where: { id: b.id } })).commissionBps,
    2500,
  );
  const second = await checkout();
  assert.equal(
    (
      await db.vendorOrder.findUnique({
        where: { id: second.vendorOrders[0].id },
      })
    ).commissionMinor,
    12500,
  );
  assert.equal(
    (
      await db.vendorOrder.findUnique({
        where: { id: first.vendorOrders[0].id },
      })
    ).commissionMinor,
    10000,
  );
  assert.equal(
    (await call("patch", "/admin/vendors/" + v.id, admin, { commissionBps: 0 }))
      .status,
    422,
  );
  const moved = await ok(
    call("patch", "/admin/vendors/" + v.id, admin, {
      categoryId: b.id,
      bankDetails: {
        method: "BANK_TRANSFER",
        accountTitle: "Vendor bank",
        accountNumber: "00123456789",
        bankName: "Example Bank",
      },
    }),
  );
  assert.equal(moved.commissionBps, 2500);
  assert.equal(moved.bankDetails.accountNumber, "00123456789");
  assert.equal(
    (await call("delete", "/admin/categories/" + b.id, admin)).status,
    409,
  );
  const audit = await db.auditLog.findFirst({
    where: { entityId: v.id, action: "VENDOR_UPDATED" },
    orderBy: { createdAt: "desc" },
  });
  assert.equal(JSON.stringify(audit.metadata).includes("00123456789"), false);
  const c = await ok(
    call("post", "/admin/categories", admin, {
      name: "Assigned empty category",
      slug: "c-" + suffix,
    }),
  );
  await ok(
    call("patch", "/admin/vendors/" + v.id, admin, { categoryId: c.id }),
  );
  assert.equal(
    (await call("delete", "/admin/categories/" + c.id, admin)).status,
    409,
  );
});
