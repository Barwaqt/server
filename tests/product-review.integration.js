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

test("product approval, rejection, resubmission and checkout cannot be bypassed", async () => {
  const admin = await actor("ADMIN"),
    owner = await actor("VENDOR"),
    other = await actor("VENDOR"),
    buyer = await actor("CUSTOMER");
  for (const user of [owner, other])
    await db.vendor.create({
      data: {
        ownerId: user.id,
        name: "Review store",
        slug: randomUUID(),
        businessType: "Retail",
        city: "Lahore",
        zone: "Central",
        address: "Market",
      },
    });
  const category = await db.category.create({
    data: { name: "Review category", slug: randomUUID() },
  });
  const input = {
    name: "Review " + randomUUID(),
    slug: randomUUID(),
    categoryId: category.id,
    description: "Complete listing description",
    priceMinor: 10000,
    stock: 5,
    images: ["https://example.test/item.png"],
    attributes: { Size: "Large" },
    active: true,
  };
  assert.equal(
    (
      await call("post", "/vendor/products", owner, {
        ...input,
        reviewStatus: "APPROVED",
      })
    ).status,
    422,
  );
  let product = await ok(call("post", "/vendor/products", owner, input));
  assert.equal(product.reviewStatus, "PENDING");
  const path = `/admin/products/${product.id}/review`;
  assert.equal(
    (await call("get", `/catalog/products/${product.id}`)).status,
    404,
  );
  assert.equal(
    (
      await ok(
        call(
          "get",
          "/catalog/products?search=" + encodeURIComponent(input.name),
        ),
      )
    ).total,
    0,
  );
  assert.equal(
    (
      await call("post", path, owner, {
        decision: "APPROVED",
        reviewVersion: product.reviewVersion,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("post", path, buyer, {
        decision: "APPROVED",
        reviewVersion: product.reviewVersion,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("patch", `/vendor/products/${product.id}`, other, {
        description: "Tampered",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call("post", path, admin, {
        decision: "REJECTED",
        reviewVersion: product.reviewVersion,
        reason: "  ",
      })
    ).status,
    422,
  );
  product = await ok(
    call("post", path, admin, {
      decision: "REJECTED",
      reviewVersion: product.reviewVersion,
      reason: "Please provide clear images",
    }),
  );
  assert.equal(product.rejectionReason, "Please provide clear images");
  assert.equal(
    (
      await ok(call("get", "/vendor/products?reviewStatus=REJECTED", owner))
    ).find((p) => p.id === product.id).rejectionReason,
    product.rejectionReason,
  );
  await ok(
    call("patch", `/vendor/products/${product.id}`, owner, { active: true }),
  );
  assert.equal(
    (await call("get", `/catalog/products/${product.id}`)).status,
    404,
  );
  product = await ok(
    call("patch", `/vendor/products/${product.id}`, owner, {
      description: "Updated detailed description",
    }),
  );
  assert.equal(product.reviewStatus, "PENDING");
  assert.equal(product.rejectionReason, null);
  const stale = product.reviewVersion;
  product = await ok(
    call("patch", `/vendor/products/${product.id}`, owner, {
      name: input.name + " corrected",
    }),
  );
  assert.equal(
    (
      await call("post", path, admin, {
        decision: "APPROVED",
        reviewVersion: stale,
      })
    ).status,
    409,
  );
  product = await ok(
    call("post", path, admin, {
      decision: "APPROVED",
      reviewVersion: product.reviewVersion,
    }),
  );
  assert.equal(
    (await call("get", `/catalog/products/${product.id}`)).status,
    200,
  );
  assert.equal(
    (
      await call("post", path, admin, {
        decision: "APPROVED",
        reviewVersion: product.reviewVersion,
      })
    ).status,
    409,
  );
  product = await ok(
    call("patch", `/vendor/products/${product.id}`, owner, { stock: 8 }),
  );
  assert.equal(product.reviewStatus, "APPROVED");
  const address = await db.address.create({
    data: {
      userId: buyer.id,
      firstName: "Buyer",
      phone: "+923001234567",
      city: "Lahore",
      zone: "Central",
      street: "Market",
    },
  });
  await db.cartItem.create({
    data: { userId: buyer.id, productId: product.id, quantity: 1 },
  });
  await db.wishlistItem.create({
    data: { userId: buyer.id, productId: product.id },
  });
  product = await ok(
    call("patch", `/vendor/products/${product.id}`, owner, {
      images: ["https://example.test/changed.png"],
    }),
  );
  assert.equal(product.reviewStatus, "PENDING");
  assert.equal((await ok(call("get", "/customer/cart", buyer))).length, 0);
  assert.equal((await ok(call("get", "/customer/wishlist", buyer))).length, 0);
  assert.equal(
    (
      await call("post", "/orders/checkout", buyer, {
        addressId: address.id,
        paymentMethod: "COD",
      }).set("Idempotency-Key", randomUUID())
    ).status,
    409,
  );
  const outcomes = await Promise.all([
    call("post", path, admin, {
      decision: "APPROVED",
      reviewVersion: product.reviewVersion,
    }),
    call("post", path, admin, {
      decision: "REJECTED",
      reviewVersion: product.reviewVersion,
      reason: "Incorrect image",
    }),
  ]);
  assert.deepEqual(outcomes.map((r) => r.status).sort(), [200, 409]);
  assert.ok(
    await db.auditLog.count({
      where: { entityId: product.id, action: "PRODUCT_REJECTED" },
    }),
  );
  assert.ok(
    await db.notification.count({
      where: { userId: owner.id, title: "Product rejected" },
    }),
  );
});
