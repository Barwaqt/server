import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomInt } from "node:crypto";
import request from "supertest";
if (
  process.env.NODE_ENV !== "test" ||
  !process.env.DATABASE_URL?.includes("barwaqt_test")
)
  throw Error("Use an isolated barwaqt_test database");
process.env.VEEVO_SMS_API_KEY = "integration-sms-key";
process.env.VEEVO_WHATSAPP_API_KEY = "integration-wa-key";
process.env.AUTH_RATE_LIMIT_MAX = "100000";
const { app } = await import("../src/app.js");
const { db } = await import("../src/config/database.js");
const { processNextMessage } =
  await import("../src/services/marketing.service.js");
const { sessionFor } = await import("../src/services/session.service.js");
const { env } = await import("../src/config/env.js");
const calls = [];
const original = globalThis.fetch;
let failing = false;
globalThis.fetch = async (url, options) => {
  assert.ok(
    [
      "https://api.veevotech.com/v3/sendsms",
      "https://wa-api.veevotech.com/wa/v1/send_message",
    ].includes(String(url)),
  );
  calls.push({ url, body: JSON.parse(options.body) });
  if (failing) throw Error("Simulated timeout");
  return Response.json({ STATUS: "SUCCESSFUL", MESSAGE_ID: randomUUID() });
};
after(async () => {
  globalThis.fetch = original;
  await db.$disconnect();
});
const phone = () => "+923" + String(randomInt(100000000, 999999999));
const post = (action, body) =>
  request(app)
    .post("/api/v1/auth/" + action)
    .send(body);
function otp() {
  const sms = [...calls].reverse().find((c) => c.body.textmessage);
  return sms.body.textmessage.match(/\b\d{6}\b/)[0];
}
async function signup(number = phone()) {
  const result = await post("phone-signup", {
    phone: number,
    password: "LongTestPassword2026",
    firstName: "SMS",
    lastName: "Customer",
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return { phone: number, id: result.body.data.challengeId, code: otp() };
}
async function cooldown(number) {
  await db.phoneOtp.update({
    where: { phone: number },
    data: { sentAt: new Date(Date.now() - 61000) },
  });
}
test("phone-only signup creates no account until OTP, hashes code, consumes once and restores session", async () => {
  const c = await signup();
  assert.equal(await db.user.findUnique({ where: { phone: c.phone } }), null);
  const stored = await db.phoneOtp.findUnique({ where: { id: c.id } });
  assert.notEqual(stored.codeHash, c.code);
  assert.equal(stored.pending.password, undefined);
  assert.equal((await post("phone-resend", { challengeId: c.id })).status, 429);
  const responses = await Promise.all([
    post("phone-verify", { challengeId: c.id, code: c.code }),
    post("phone-verify", { challengeId: c.id, code: c.code }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 422]);
  const session = responses.find((r) => r.status === 200).body.data;
  assert.equal(session.user.email, null);
  assert.ok(session.user.phoneVerifiedAt);
  assert.equal(session.user.phone, c.phone);
  assert.equal(
    (
      await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer " + session.accessToken)
    ).status,
    200,
  );
  assert.equal(
    (await post("refresh", { refreshToken: session.refreshToken })).status,
    200,
  );
  assert.equal(
    (await post("phone-verify", { challengeId: c.id, code: c.code })).status,
    422,
  );
  // Phone-only account cannot silently replace its sign-in number via profile edits.
  assert.equal(
    (
      await request(app)
        .patch("/api/v1/customer/profile")
        .set("Authorization", "Bearer " + session.accessToken)
        .send({ phone: phone() })
    ).status,
    422,
  );
  await cooldown(c.phone);
  const login = await post("phone-login", { phone: c.phone });
  assert.equal(login.status, 200);
  assert.equal(
    (
      await post("phone-verify", {
        challengeId: login.body.data.challengeId,
        code: otp(),
      })
    ).status,
    200,
  );
});
test("wrong guesses commit attempt count, expire and resend invalidates older code", async () => {
  const c = await signup();
  const wrong = c.code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await post("phone-verify", { challengeId: c.id, code: wrong })).status,
      422,
    );
  assert.equal(
    (await db.phoneOtp.findUnique({ where: { id: c.id } })).attempts,
    5,
  );
  assert.equal(
    (await post("phone-verify", { challengeId: c.id, code: c.code })).status,
    422,
  );
  await cooldown(c.phone);
  const resend = await post("phone-resend", { challengeId: c.id });
  assert.equal(resend.status, 200);
  assert.notEqual(resend.body.data.challengeId, c.id);
  assert.equal(
    (await post("phone-verify", { challengeId: c.id, code: c.code })).status,
    422,
  );
  await db.phoneOtp.update({
    where: { phone: c.phone },
    data: { expiresAt: new Date(0) },
  });
  assert.equal(
    (
      await post("phone-verify", {
        challengeId: resend.body.data.challengeId,
        code: otp(),
      })
    ).status,
    422,
  );
  await db.phoneOtp.update({
    where: { phone: c.phone },
    data: { sends: 5, sentAt: new Date(Date.now() - 61000) },
  });
  assert.equal(
    (await post("phone-resend", { challengeId: resend.body.data.challengeId }))
      .status,
    429,
  );
});
test("unknown/disabled/admin accounts cannot get phone login sessions; vendor codes are role-scoped", async () => {
  const unknown = phone();
  let before = calls.length;
  assert.equal((await post("phone-login", { phone: unknown })).status, 200);
  assert.equal(calls.length, before);
  for (const [role, active] of [
    ["ADMIN", true],
    ["CUSTOMER", false],
    ["VENDOR", true],
  ]) {
    const number = phone();
    await db.user.create({
      data: {
        phone: number,
        email: randomUUID() + "@phone.test",
        firstName: role,
        role,
        active,
        passwordHash: "unused",
      },
    });
    before = calls.length;
    const result = await post("phone-login", {
      phone: number,
      portal: "customer",
    });
    assert.equal(result.status, 200);
    assert.equal(calls.length, before);
    if (role === "VENDOR") {
      await cooldown(number);
      const vendor = await post("phone-login", {
        phone: number,
        portal: "vendor",
      });
      assert.equal(vendor.status, 200);
      assert.equal(calls.length, before + 1);
      const verified = await post("phone-verify", {
        challengeId: vendor.body.data.challengeId,
        code: otp(),
      });
      assert.equal(verified.status, 200);
      assert.equal(verified.body.data.user.role, "VENDOR");
    }
  }
});
test("SMS failures do not create an account or a valid challenge", async () => {
  const number = phone();
  failing = true;
  try {
    const result = await post("phone-signup", {
      phone: number,
      password: "LongTestPassword2026",
      firstName: "Failure",
    });
    assert.equal(result.status, 502);
  } finally {
    failing = false;
  }
  assert.equal(await db.user.findUnique({ where: { phone: number } }), null);
  assert.equal(
    (await db.phoneOtp.findUnique({ where: { phone: number } })).status,
    "FAILED",
  );
});
test("marketing requires admin, validates channel content, deduplicates and queues idempotently", async () => {
  const admin = await db.user.create({
    data: {
      email: randomUUID() + "@marketing.test",
      role: "ADMIN",
      firstName: "Admin",
      passwordHash: "unused",
    },
  });
  const session = await sessionFor(admin);
  const auth = "Bearer " + session.accessToken;
  const c = await signup();
  const customer = (
    await post("phone-verify", { challengeId: c.id, code: c.code })
  ).body.data;
  assert.equal(
    (
      await request(app)
        .get("/api/v1/admin/marketing/config")
        .set("Authorization", "Bearer " + customer.accessToken)
    ).status,
    403,
  );
  const number = phone(),
    key = randomUUID();
  const body = {
    name: "Test",
    channels: ["SMS", "WHATSAPP"],
    recipients: [number, number],
    smsText: "Sale",
    whatsapp: { templateId: 42, headerVariables: [], bodyVariables: ["50%"] },
  };
  const send = (value, k = key) =>
    request(app)
      .post("/api/v1/admin/marketing/campaigns")
      .set("Authorization", auth)
      .set("Idempotency-Key", k)
      .send(value);
  assert.equal((await send({ ...body, whatsapp: undefined })).status, 422);
  const result = await send(body);
  assert.equal(result.status, 202, JSON.stringify(result.body));
  assert.equal(result.body.data.messages.length, 2);
  assert.equal((await send(body)).body.data.id, result.body.data.id);
  assert.equal((await send({ ...body, name: "Different" })).status, 409);
  let count = calls.length;
  await Promise.all([processNextMessage(), processNextMessage()]);
  await processNextMessage();
  assert.equal(calls.length, count + 2);
  const rows = await db.marketingMessage.findMany({
    where: { campaignId: result.body.data.id },
  });
  assert.ok(rows.every((r) => r.status === "ACCEPTED"));
  const failed = await send({ ...body, channels: ["SMS"] }, randomUUID());
  failing = true;
  try {
    await processNextMessage();
  } finally {
    failing = false;
  }
  assert.equal(
    (
      await db.marketingMessage.findFirst({
        where: { campaignId: failed.body.data.id },
      })
    ).status,
    "UNKNOWN",
  );
  count = calls.length;
  await processNextMessage();
  assert.equal(calls.length, count);
  env.VEEVO_SMS_API_KEY = "dummy_replace";
  assert.equal((await send(body, randomUUID())).status, 503);
  env.VEEVO_SMS_API_KEY = "integration-sms-key";
});

test("legacy local phone numbers work without creating a duplicate account", async () => {
  const number = phone(),
    legacy = "0" + number.slice(3);
  const user = await db.user.create({
    data: {
      phone: legacy,
      email: randomUUID() + "@legacy.test",
      firstName: "Legacy",
      passwordHash: "unused",
    },
  });
  const requestCode = await post("phone-login", { phone: number });
  assert.equal(requestCode.status, 200);
  const verified = await post("phone-verify", {
    challengeId: requestCode.body.data.challengeId,
    code: otp(),
  });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.data.user.id, user.id);
  assert.equal(verified.body.data.user.phone, number);
  assert.equal(
    (
      await post("phone-signup", {
        phone: legacy,
        password: "LongTestPassword2026",
        firstName: "Duplicate",
      })
    ).status,
    409,
  );
});
