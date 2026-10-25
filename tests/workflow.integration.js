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
test("multi-vendor lifecycle, isolation, accounting, idempotency and stock concurrency", async () => {
  const admin = await db.user.create({
      data: {
        email: `admin-${suffix}@test.local`,
        passwordHash: await bcrypt.hash(password, 12),
        role: "ADMIN",
        firstName: "Admin",
        emailVerifiedAt: new Date(),
      },
    }),
    at = (await login(admin.email)).accessToken;
  const customerEmail = `customer-${suffix}@test.local`,
    signup = await ok(
      call("post", "/auth/register", null, {
        email: customerEmail,
        password,
        firstName: "Customer",
      }),
    ),
    // Without a configured mail server signup activates the account immediately, so the
    // customer signs in with the credentials they registered instead of getting a session.
    customer = await login(customerEmail),
    ct = customer.accessToken;
  assert.equal(signup.verificationSent, false);
  assert.equal((await call("post", "/admin/staff", ct, {})).status, 403);
  assert.equal(
    (
      await call("post", "/auth/register", null, {
        email: `bad-${suffix}@test.local`,
        password,
        firstName: "Bad",
        role: "ADMIN",
      })
    ).status,
    422,
  );
  const category = await ok(
    call("post", "/admin/categories", at, {
      name: "Kitchen",
      slug: `kitchen-${suffix}`,
    }),
  );
  const vendors = [],
    products = [];
  for (let i = 0; i < 2; i++) {
    const email = `vendor-${i}-${suffix}@test.local`;
    const v = await ok(
      call("post", "/admin/vendors", at, {
        email,
        password,
        phone: `+923${i}${Date.now().toString().slice(-8)}`,
        firstName: "Vendor",
        name: `Vendor ${i}`,
        slug: `vendor-${i}-${suffix}`,
        businessType: "Retail",
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
    v.token = (await login(email)).accessToken;
    vendors.push(v);
    products.push(
      await ok(
        call("post", "/vendor/products", v.token, {
          name: `Pan ${i}`,
          slug: `pan-${i}-${suffix}`,
          categoryId: category.id,
          priceMinor: 100000,
          stock: 5,
          images: ["/shop/pan.png"],
        }),
      ),
    );
  }
  for (const product of products)
    await ok(
      call("post", `/admin/products/${product.id}/review`, at, {
        decision: "APPROVED",
        reviewVersion: product.reviewVersion,
      }),
    );
  assert.equal(
    (
      await call(
        "patch",
        `/vendor/products/${products[0].id}`,
        vendors[1].token,
        { stock: 99 },
      )
    ).status,
    404,
  );
  const updatedVendor = await ok(
    call("patch", "/vendor/profile", vendors[0].token, {
      description: "Updated business description",
    }),
  );
  assert.equal(updatedVendor.description, "Updated business description");
  assert.equal(
    (
      await call("patch", "/vendor/profile", vendors[0].token, {
        commissionBps: 0,
      })
    ).status,
    422,
  );
  const lowPrice = await ok(call("get", "/catalog/products?maxPriceMinor=1"));
  assert.equal(lowPrice.total, 0);
  assert.equal(
    (await call("get", "/catalog/products?minPriceMinor=20&maxPriceMinor=10"))
      .status,
    422,
  );
  const addressBody = {
    firstName: "Customer",
    phone: "+923001234567",
    city: "Mardan",
    zone: "Central",
    street: "Main Street",
  };
  const address = await ok(
    call("post", "/customer/addresses", ct, addressBody),
  );
  for (const p of products)
    await ok(call("put", `/customer/cart/${p.id}`, ct, { quantity: 1 }));
  const coupon = await ok(
    call("post", "/admin/coupons", at, {
      code: `SAVE_${suffix.toUpperCase()}`,
      percentBps: 1000,
      maxDiscountMinor: 50000,
      maxUses: 1,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }),
  );
  const body = {
      addressId: address.id,
      couponCode: coupon.code,
      paymentMethod: "COD",
    },
    place = () =>
      call("post", "/orders/checkout", ct, body).set(
        "Idempotency-Key",
        `checkout-${suffix}`,
      );
  const beforeQuote = await db.product.findUnique({
    where: { id: products[0].id },
  });
  const preview = await ok(call("post", "/orders/quote", ct, body));
  assert.equal(preview.vendorOrders.length, 2);
  assert.equal(preview.totalMinor, 195000);
  assert.equal(
    (await db.product.findUnique({ where: { id: products[0].id } })).stock,
    beforeQuote.stock,
  );
  assert.equal(
    (await db.coupon.findUnique({ where: { id: coupon.id } })).used,
    0,
  );
  assert.equal((await ok(call("get", "/customer/cart", ct))).length, 2);
  assert.equal(
    (await call("post", "/orders/quote", vendors[0].token, body)).status,
    403,
  );
  assert.equal(
    (
      await call("post", "/orders/quote", ct, {
        ...body,
        couponCode: "NOT_REAL",
      })
    ).status,
    422,
  );
  const directory = await ok(
    call("get", "/catalog/vendors?city=Mardan&zone=Central"),
  );
  assert.ok(directory.items.some((v) => v.id === vendors[0].id));
  const publicVendor = await ok(
    call("get", `/catalog/vendors/${vendors[0].id}`),
  );
  assert.equal(publicVendor.name, vendors[0].name);
  assert.equal(publicVendor.bankDetails, undefined);
  assert.equal(publicVendor.ownerId, undefined);
  const results = await Promise.all([place(), place()]);
  for (const r of results) assert.equal(r.status, 201, JSON.stringify(r.body));
  const order = results[0].body.data;
  assert.equal(order.id, results[1].body.data.id);
  assert.equal(order.vendorOrders.length, 2);
  assert.equal(order.discountMinor, 20000);
  assert.equal(order.totalMinor, 195000);
  assert.equal(order.totalMinor, preview.totalMinor);
  assert.ok(order.vendorOrders.every((o) => !o.pinHash));
  assert.equal(
    (await db.product.findUnique({ where: { id: products[0].id } })).stock,
    4,
  );
  assert.equal(
    (await call("get", `/orders/${order.id}`, vendors[0].token)).status,
    404,
  );
  const one = order.vendorOrders.find((o) => o.vendorId === vendors[0].id),
    two = order.vendorOrders.find((o) => o.vendorId === vendors[1].id);
  assert.equal(
    (
      await call("post", `/orders/${one.id}/actions`, vendors[1].token, {
        action: "accept",
      })
    ).status,
    403,
  );
  await ok(
    call("post", `/orders/${two.id}/actions`, vendors[1].token, {
      action: "reject",
      reason: "Unavailable",
    }),
  );
  assert.equal(
    (await db.product.findUnique({ where: { id: products[1].id } })).stock,
    5,
  );
  await ok(
    call("post", `/orders/${one.id}/actions`, vendors[0].token, {
      action: "accept",
    }),
  );
  await ok(
    call("post", `/orders/${one.id}/actions`, vendors[0].token, {
      action: "ready",
    }),
  );
  const rider = await ok(
      call("post", "/admin/staff", at, {
        email: `rider-${suffix}@test.local`,
        password,
        firstName: "Rider",
        role: "RIDER",
      }),
    ),
    rt = (await login(rider.email)).accessToken;
  await ok(call("post", "/rider/shifts", rt, { action: "start" }));
  await ok(call("post", `/orders/${one.id}/assign`, at, { riderId: rider.id }));
  assert.equal(
    (await call("post", "/rider/shifts", rt, { action: "break" })).status,
    409,
  );
  await ok(call("post", `/orders/${one.id}/actions`, rt, { action: "pickup" }));
  const notifications = await ok(call("get", "/notifications", ct)),
    pin = notifications
      .find((n) => n.title === "Delivery PIN" && n.body.includes(one.id))
      .body.match(/PIN is (\d{6})/)[1];
  assert.equal(
    (
      await call("post", `/orders/${one.id}/actions`, rt, {
        action: "deliver",
        pin: pin === "111111" ? "222222" : "111111",
        cashCollectedMinor: one.totalMinor,
      })
    ).status,
    422,
  );
  assert.equal(
    (await db.vendorOrder.findUnique({ where: { id: one.id } })).pinAttempts,
    1,
  );
  await ok(
    call("post", `/orders/${one.id}/actions`, rt, {
      action: "deliver",
      pin,
      cashCollectedMinor: one.totalMinor,
    }),
  );
  assert.equal(
    (
      await call("post", `/orders/${one.id}/actions`, rt, {
        action: "deliver",
        pin,
        cashCollectedMinor: one.totalMinor,
      })
    ).status,
    409,
  );
  assert.equal(
    (await call("post", "/rider/shifts", rt, { action: "end" })).status,
    409,
  );
  assert.equal(
    (
      await call("post", "/finance/settlements", at, {
        vendorId: vendors[0].id,
      })
    ).status,
    409,
  );
  await ok(
    call("post", "/finance/remittances", at, {
      riderId: rider.id,
      amountMinor: 1000,
      reference: `partial-cash-${suffix}`,
    }),
  );
  assert.equal(
    (
      await call("post", "/finance/settlements", at, {
        vendorId: vendors[0].id,
      })
    ).status,
    409,
  );
  await ok(
    call("post", "/finance/remittances", at, {
      riderId: rider.id,
      amountMinor: one.totalMinor - 1000,
      reference: `cash-${suffix}`,
    }),
  );
  await ok(
    call("post", `/finance/orders/${one.id}/refunds`, at, {
      amountMinor: 1000,
      reason: "Partial refund",
      reference: `refund-${suffix}`,
    }),
  );
  const settlement = await ok(
    call("post", "/finance/settlements", at, { vendorId: vendors[0].id }),
  );
  assert.equal(settlement.amountMinor, 80100);
  await ok(
    call("patch", `/finance/settlements/${settlement.id}`, at, {
      status: "PROCESSED",
    }),
  );
  await ok(
    call("patch", `/finance/settlements/${settlement.id}`, at, {
      status: "PAID",
      reference: `bank-${suffix}`,
    }),
  );
  assert.equal(
    (
      await call("post", "/finance/settlements", at, {
        vendorId: vendors[0].id,
      })
    ).status,
    409,
  );
  await ok(call("post", "/rider/shifts", rt, { action: "end" }));
  await ok(call("get", "/admin/reports", at));
  const p = await ok(
      call("post", "/vendor/products", vendors[0].token, {
        name: "Last item",
        slug: `last-${suffix}`,
        categoryId: category.id,
        priceMinor: 10000,
        stock: 1,
      }),
    ),
    racers = [];
  await ok(
    call("post", `/admin/products/${p.id}/review`, at, {
      decision: "APPROVED",
      reviewVersion: p.reviewVersion,
    }),
  );
  for (let i = 0; i < 2; i++) {
    const raceEmail = `race-${i}-${suffix}@test.local`;
    await ok(
      call("post", "/auth/register", null, {
        email: raceEmail,
        password,
        firstName: "Customer",
      }),
    );
    const c = await login(raceEmail);
    const a = await ok(
      call("post", "/customer/addresses", c.accessToken, addressBody),
    );
    await ok(
      call("put", `/customer/cart/${p.id}`, c.accessToken, { quantity: 1 }),
    );
    racers.push({ token: c.accessToken, addressId: a.id });
  }
  assert.equal(
    (
      await call(
        "put",
        `/customer/addresses/${racers[0].addressId}`,
        racers[1].token,
        addressBody,
      )
    ).status,
    404,
  );
  const races = await Promise.all(
    racers.map((c, i) =>
      call("post", "/orders/checkout", c.token, { addressId: c.addressId }).set(
        "Idempotency-Key",
        `race-${i}-${suffix}`,
      ),
    ),
  );
  assert.deepEqual(races.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await db.product.findUnique({ where: { id: p.id } })).stock, 0);
  const winning = races.find((r) => r.status === 201).body.data.vendorOrders[0];
  await ok(call("post", "/rider/shifts", rt, { action: "start" }));
  await ok(call("post", "/rider/shifts", rt, { action: "break" }));
  await ok(call("post", "/rider/shifts", rt, { action: "resume" }));
  await ok(
    call("post", `/orders/${winning.id}/actions`, vendors[0].token, {
      action: "accept",
    }),
  );
  await ok(
    call("post", `/orders/${winning.id}/actions`, vendors[0].token, {
      action: "ready",
    }),
  );
  await ok(
    call("post", `/orders/${winning.id}/assign`, at, { riderId: rider.id }),
  );
  await ok(
    call("post", `/orders/${winning.id}/actions`, rt, { action: "pickup" }),
  );
  await ok(
    call("post", `/orders/${winning.id}/actions`, rt, {
      action: "fail",
      reason: "Customer unavailable",
    }),
  );
  await ok(
    call("post", `/orders/${winning.id}/actions`, at, { action: "retry" }),
  );
  await ok(
    call("post", `/orders/${winning.id}/actions`, rt, {
      action: "fail",
      reason: "Customer refused",
    }),
  );
  await ok(
    call("post", `/orders/${winning.id}/actions`, at, {
      action: "return",
      reason: "Vendor received returned stock",
    }),
  );
  assert.equal((await db.product.findUnique({ where: { id: p.id } })).stock, 1);
  assert.equal(
    (
      await call("post", `/orders/${winning.id}/actions`, at, {
        action: "return",
        reason: "Duplicate return",
      })
    ).status,
    409,
  );
  // Checked cart items are purchased independently; unselected items remain.
  for (const product of products)
    await ok(call("put", `/customer/cart/${product.id}`, ct, { quantity: 1 }));
  const selectedBody = { addressId: address.id, productIds: [products[0].id] };
  const selectedQuote = await ok(
    call("post", "/orders/quote", ct, selectedBody),
  );
  assert.equal(selectedQuote.vendorOrders.length, 1);
  assert.equal(selectedQuote.subtotalMinor, products[0].priceMinor);
  assert.equal(
    (
      await call("post", "/orders/quote", ct, {
        ...selectedBody,
        productIds: [randomUUID()],
      })
    ).status,
    422,
  );
  const selectedOrder = await ok(
    call("post", "/orders/checkout", ct, selectedBody).set(
      "Idempotency-Key",
      `selected-${suffix}`,
    ),
  );
  assert.equal(selectedOrder.vendorOrders.length, 1);
  const remaining = await ok(call("get", "/customer/cart", ct));
  assert.deepEqual(
    remaining.map((item) => item.productId),
    [products[1].id],
  );
  const dashboard = await ok(
    call("get", "/vendor/dashboard", vendors[0].token),
  );
  assert.equal(dashboard.sales.length, 30);
  assert.equal(
    dashboard.productStatus.active + dashboard.productStatus.inactive,
    dashboard.products,
  );
  assert.ok(dashboard.pendingPayableMinor >= 0);
  await ok(
    call("post", `/orders/${selectedOrder.vendorOrders[0].id}/actions`, ct, {
      action: "cancel",
    }),
  );
  await ok(call("post", "/rider/shifts", rt, { action: "end" }));
  await ok(
    call("patch", `/admin/vendors/${vendors[0].id}`, at, {
      status: "SUSPENDED",
    }),
  );
  assert.equal(
    (await call("get", "/vendor/products", vendors[0].token)).status,
    403,
  );
  const rotated = await ok(
    call("post", "/auth/refresh", null, {
      refreshToken: customer.refreshToken,
    }),
  );
  assert.equal(
    (
      await call("post", "/auth/refresh", null, {
        refreshToken: customer.refreshToken,
      })
    ).status,
    401,
  );
  await ok(call("post", "/auth/logout", rotated.accessToken));
  assert.equal(
    (await call("get", "/auth/me", rotated.accessToken)).status,
    401,
  );
});
