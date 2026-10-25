import { test, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
if (
  process.env.NODE_ENV !== "test" ||
  !process.env.DATABASE_URL?.includes("barwaqt_test")
)
  throw Error("Use isolated test database");
const { app } = await import("../src/app.js");
const { db } = await import("../src/config/database.js");
const { env } = await import("../src/config/env.js");
const suffix = randomUUID().slice(0, 8);
after(() => db.$disconnect());
async function actor(role) {
  const u = await db.user.create({
    data: {
      email: `${randomUUID()}@central.test`,
      passwordHash: "disabled-test-login",
      role,
      firstName: role,
    },
  });
  const s = await db.session.create({
    data: {
      userId: u.id,
      tokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  return {
    ...u,
    token: jwt.sign({ sid: s.id }, env.JWT_SECRET, {
      subject: u.id,
      issuer: "barwaqt",
      audience: "barwaqt-api",
      expiresIn: "1h",
    }),
  };
}
function call(method, path, u, body) {
  let r = request(app)[method]("/api/v1" + path);
  if (u) r = r.set("Authorization", "Bearer " + u.token);
  return body ? r.send(body) : r;
}
async function ok(p) {
  const r = await p;
  assert.ok(r.status < 300, `${r.status}: ${JSON.stringify(r.body)}`);
  return r.body.data;
}
test("central collection, payment verification, prepaid delivery and cancellation refunds", async () => {
  const admin = await actor("ADMIN"),
    customer = await actor("CUSTOMER"),
    owner = await actor("VENDOR"),
    other = await actor("CUSTOMER"),
    rider = await actor("RIDER");
  const vendor = await db.vendor.create({
    data: {
      ownerId: owner.id,
      name: "Central test vendor",
      slug: "central-" + suffix,
      city: "Lahore",
      zone: "Central",
      address: "Market",
      businessType: "Retail",
      status: "APPROVED",
      commissionBps: 1000,
    },
  });
  const category = await db.category.create({
    data: { name: "Central test", slug: "central-" + suffix },
  });
  const product = await db.product.create({
    data: {
      reviewStatus: "APPROVED",
      vendorId: vendor.id,
      categoryId: category.id,
      name: "Central item",
      slug: "central-item-" + suffix,
      priceMinor: 10000,
      stock: 10,
    },
  });
  const address = await ok(
    call("post", "/customer/addresses", customer, {
      city: "Lahore",
      zone: "Central",
      street: "Street",
      firstName: "Customer",
      phone: "+923001234567",
    }),
  );
  await ok(call("post", "/rider/shifts", rider, { action: "start" }));
  try {
    for (const method of ["BANK_TRANSFER", "JAZZCASH", "EASYPAISA"]) {
      const account = {
        method,
        accountTitle: "Barwaqt test account",
        accountNumber: "TEST-ACCOUNT-123",
        bankName: "Test bank",
        instructions: "Test only",
        active: true,
      };
      assert.equal(
        (await call("put", "/payments/accounts", owner, account)).status,
        403,
      );
      await ok(call("put", "/payments/accounts", admin, account));
      await ok(
        call("put", "/customer/cart/" + product.id, customer, { quantity: 1 }),
      );
      const payload = { addressId: address.id, paymentMethod: method };
      const key = randomUUID();
      const order = await ok(
        call("post", "/orders/checkout", customer, payload).set(
          "Idempotency-Key",
          key,
        ),
      );
      assert.equal(order.payment.method, method);
      assert.equal(order.payment.status, "AWAITING_TRANSFER");
      const shipment = order.vendorOrders[0];
      assert.equal(
        (
          await call("post", `/orders/${shipment.id}/actions`, owner, {
            action: "accept",
          })
        ).status,
        409,
      );
      assert.equal((await call("get", "/payments", owner)).status, 403);
      assert.equal((await ok(call("get", "/payments", other))).total, 0);
      const claim = await ok(
        call("post", `/payments/orders/${order.id}/submissions`, customer, {
          reference: "TEST-" + method + "-" + suffix,
        }),
      );
      assert.equal(
        (
          await call(
            "post",
            `/payments/submissions/${claim.id}/review`,
            customer,
            { action: "verify", note: "not allowed" },
          )
        ).status,
        403,
      );
      await ok(
        call("post", `/payments/submissions/${claim.id}/review`, admin, {
          action: "verify",
          note: "Exact amount confirmed in platform statement",
        }),
      );
      await ok(
        call("post", `/payments/submissions/${claim.id}/review`, admin, {
          action: "verify",
          note: "Idempotent retry",
        }),
      );
      assert.equal(
        (await db.vendorOrder.findUnique({ where: { id: shipment.id } }))
          .cashReceived,
        true,
      );
      if (method === "BANK_TRANSFER") {
        await ok(
          call("post", `/orders/${shipment.id}/actions`, customer, {
            action: "cancel",
          }),
        );
        assert.equal(
          (await db.payment.findUnique({ where: { orderId: order.id } }))
            .status,
          "REFUND_DUE",
        );
        await ok(
          call("post", `/finance/orders/${shipment.id}/refunds`, admin, {
            amountMinor: shipment.totalMinor,
            reason: "Prepaid cancellation",
            reference: "cancel-refund-" + suffix,
          }),
        );
        assert.equal(
          (await db.payment.findUnique({ where: { orderId: order.id } }))
            .status,
          "REFUNDED",
        );
      } else {
        await ok(
          call("post", `/orders/${shipment.id}/actions`, owner, {
            action: "accept",
          }),
        );
        await ok(
          call("post", `/orders/${shipment.id}/actions`, owner, {
            action: "ready",
          }),
        );
        await ok(
          call("post", `/orders/${shipment.id}/assign`, admin, {
            riderId: rider.id,
          }),
        );
        await ok(
          call("post", `/orders/${shipment.id}/actions`, rider, {
            action: "pickup",
          }),
        );
        const notice = await db.notification.findFirst({
          where: {
            userId: customer.id,
            title: "Delivery PIN",
            body: { contains: shipment.id },
          },
        });
        const pin = notice.body.match(/PIN is (\d{6})/)[1];
        assert.equal(
          (
            await call("post", `/orders/${shipment.id}/actions`, rider, {
              action: "deliver",
              pin,
              cashCollectedMinor: shipment.totalMinor,
            })
          ).status,
          422,
        );
        await ok(
          call("post", `/orders/${shipment.id}/actions`, rider, {
            action: "deliver",
            pin,
            cashCollectedMinor: 0,
          }),
        );
        const delivered = await db.vendorOrder.findUnique({
          where: { id: shipment.id },
        });
        assert.equal(delivered.codCollectedMinor, 0);
        assert.equal(delivered.cashReceived, true);
      }
      const replay = await ok(
        call("post", "/orders/checkout", customer, payload).set(
          "Idempotency-Key",
          key,
        ),
      );
      assert.equal(replay.id, order.id);
    }
    await ok(
      call("put", "/customer/cart/" + product.id, customer, { quantity: 1 }),
    );
    const late = await ok(
      call("post", "/orders/checkout", customer, {
        addressId: address.id,
        paymentMethod: "BANK_TRANSFER",
      }).set("Idempotency-Key", randomUUID()),
    );
    await ok(
      call("post", `/orders/${late.vendorOrders[0].id}/actions`, customer, {
        action: "cancel",
      }),
    );
    const lateClaim = await ok(
      call("post", `/payments/orders/${late.id}/submissions`, customer, {
        reference: "late-" + suffix,
      }),
    );
    await ok(
      call("post", `/payments/submissions/${lateClaim.id}/review`, admin, {
        action: "verify",
        note: "Transfer arrived after cancellation",
      }),
    );
    assert.equal(
      (await db.payment.findUnique({ where: { orderId: late.id } })).status,
      "REFUND_DUE",
    );
    const settlement = await ok(
      call("post", "/finance/settlements", admin, { vendorId: vendor.id }),
    );
    assert.equal(settlement.amountMinor, 18000);
    assert.equal(
      (
        await db.vendorOrder.aggregate({
          where: { riderId: rider.id },
          _sum: { codCollectedMinor: true },
        })
      )._sum.codCollectedMinor,
      0,
    );
    await ok(call("post", "/rider/shifts", rider, { action: "end" }));
  } finally {
    await db.paymentAccount.updateMany({ data: { active: false } });
  }
});
