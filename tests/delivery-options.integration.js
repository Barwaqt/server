import { test, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
if (
  process.env.NODE_ENV !== "test" ||
  !process.env.DATABASE_URL?.includes("barwaqt_test")
)
  throw Error("Use NODE_ENV=test and a dedicated barwaqt_test database");
const { app } = await import("../src/app.js");
const { db } = await import("../src/config/database.js");
after(() => db.$disconnect());
const suffix = randomUUID().slice(0, 8),
  password = "Test-only-password-123!";
function call(method, path, token, body) {
  let q = request(app)[method]("/api/v1" + path);
  if (token) q = q.set("Authorization", `Bearer ${token}`);
  return body ? q.send(body) : q;
}
async function ok(p) {
  const r = await p;
  assert.ok(r.status < 300, `${r.status}: ${JSON.stringify(r.body)}`);
  return r.body.data;
}
const login = (email) =>
  ok(call("post", "/auth/login", null, { identity: email, password }));

test("stores advertise delivery options and customers choose one at checkout", async () => {
  const admin = await db.user.create({
    data: {
      email: `delivery-admin-${suffix}@test.local`,
      passwordHash: await bcrypt.hash(password, 12),
      role: "ADMIN",
      firstName: "Admin",
      emailVerifiedAt: new Date(),
    },
  });
  const at = (await login(admin.email)).accessToken;
  await ok(
    call("put", "/admin/settings", at, {
      deliveryFeeMinor: 20000,
      expressDeliveryFeeMinor: 30000,
    }),
  );
  const category = await ok(
    call("post", "/admin/categories", at, {
      name: `Delivery ${suffix}`,
      slug: `delivery-${suffix}`,
    }),
  );
  async function vendor(index, delivery) {
    const email = `delivery-vendor-${index}-${suffix}@test.local`;
    const row = await ok(
      call("post", "/admin/vendors", at, {
        email,
        password,
        phone: `+923${index}${Date.now().toString().slice(-8)}`,
        firstName: "Vendor",
        name: `Delivery Vendor ${index}`,
        slug: `delivery-vendor-${index}-${suffix}`,
        city: "Mardan",
        zone: "Central",
        address: "Market Road",
        categoryId: category.id,
        bankDetails: {
          method: "EASYPAISA",
          accountTitle: "Test vendor",
          accountNumber: "03001234567",
        },
      }),
    );
    row.token = (await login(email)).accessToken;
    row.product = await ok(
      call("post", "/vendor/products", row.token, {
        name: `Delivery item ${index}`,
        slug: `delivery-item-${index}-${suffix}`,
        categoryId: category.id,
        priceMinor: 50000,
        stock: 5,
        images: ["/shop/item.png"],
        ...delivery,
      }),
    );
    await ok(
      call("post", `/admin/products/${row.product.id}/review`, at, {
        decision: "APPROVED",
        reviewVersion: row.product.reviewVersion,
      }),
    );
    return row;
  }
  const fast = await vendor(1, {
    expressDelivery: true,
    expressEtaMinutes: 120,
    standardDeliveryDays: 3,
  });
  const slow = await vendor(2, { standardDeliveryDays: 7 });
  assert.equal(fast.product.expressDelivery, true);
  assert.equal(fast.product.expressEtaMinutes, 120);
  assert.equal(fast.product.standardDeliveryDays, 3);
  assert.equal(slow.product.expressDelivery, false);

  const published = await ok(
    call("get", `/catalog/products/${fast.product.id}`),
  );
  assert.equal(published.expressDelivery, true);
  assert.equal(published.expressEtaMinutes, 120);
  assert.equal(published.standardDeliveryDays, 3);

  const customerEmail = `delivery-customer-${suffix}@test.local`;
  await ok(
    call("post", "/auth/register", null, {
      email: customerEmail,
      password,
      firstName: "Customer",
    }),
  );
  const ct = (await login(customerEmail)).accessToken;
  const address = await ok(
    call("post", "/customer/addresses", ct, {
      firstName: "Customer",
      phone: "+923001234567",
      city: "Mardan",
      zone: "Central",
      street: "Main Street",
    }),
  );
  for (const row of [fast, slow])
    await ok(
      call("put", `/customer/cart/${row.product.id}`, ct, { quantity: 1 }),
    );

  // A basket mixing express and non-express products cannot ask for express.
  assert.equal(
    (
      await call("post", "/orders/quote", ct, {
        addressId: address.id,
        deliveryOption: "EXPRESS",
      })
    ).status,
    422,
  );
  const mixed = await ok(
    call("post", "/orders/quote", ct, {
      addressId: address.id,
      deliveryOption: "STANDARD",
    }),
  );
  assert.deepEqual(
    mixed.deliveryOptions.map((entry) => entry.option),
    ["STANDARD"],
  );
  assert.equal(mixed.deliveryEtaMinutes, 7 * 1440);
  assert.equal(mixed.deliveryMinor, 20000);
  assert.equal(mixed.deliveryOptions[0].feeMinor, 20000);
  assert.equal(
    mixed.deliveryLabel,
    "Standard delivery within 7 days",
    "the slowest store sets the promise for the whole order",
  );

  // With only the express product in the basket, both options are offered.
  await ok(
    call("put", `/customer/cart/${slow.product.id}`, ct, { quantity: 0 }),
  );
  const quote = await ok(
    call("post", "/orders/quote", ct, {
      addressId: address.id,
      deliveryOption: "EXPRESS",
    }),
  );
  assert.deepEqual(
    quote.deliveryOptions.map((entry) => entry.etaMinutes),
    [120, 3 * 1440],
  );
  assert.equal(quote.deliveryOption, "EXPRESS");
  assert.equal(quote.deliveryMinor, 30000);
  assert.deepEqual(
    quote.deliveryOptions.map((entry) => entry.feeMinor),
    [30000, 20000],
  );
  assert.equal(quote.vendorOrders[0].deliveryEtaMinutes, 120);

  const order = await ok(
    call("post", "/orders/checkout", ct, {
      addressId: address.id,
      paymentMethod: "COD",
      deliveryOption: "EXPRESS",
    }).set("Idempotency-Key", `delivery-${suffix}`),
  );
  assert.equal(order.deliveryOption, "EXPRESS");
  assert.equal(order.deliveryEtaMinutes, 120);
  assert.equal(order.vendorOrders[0].deliveryOption, "EXPRESS");
  assert.equal(order.vendorOrders[0].deliveryEtaMinutes, 120);
  assert.equal(order.deliveryMinor, 30000);
  assert.equal(
    order.vendorOrders[0].deliveryMinor,
    order.deliveryMinor,
    "the express fee is split across the order's vendors",
  );

  // Express needs a promise, and the standard window stays within a week.
  assert.equal(
    (
      await call("patch", `/vendor/products/${fast.product.id}`, fast.token, {
        expressDelivery: true,
        expressEtaMinutes: null,
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await call("patch", `/vendor/products/${fast.product.id}`, fast.token, {
        standardDeliveryDays: 9,
      })
    ).status,
    422,
  );
  const standardOnly = await ok(
    call("patch", `/vendor/products/${fast.product.id}`, fast.token, {
      expressDelivery: false,
    }),
  );
  assert.equal(standardOnly.expressDelivery, false);
  assert.equal(standardOnly.expressEtaMinutes, null);
});
