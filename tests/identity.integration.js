import { test, after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { SMTPServer } from "smtp-server";
import { OAuth2Client } from "google-auth-library";
if (
  process.env.NODE_ENV !== "test" ||
  !process.env.DATABASE_URL?.includes("barwaqt_test")
)
  throw Error("Use the dedicated barwaqt_test database");
const messages = [];
const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ["STARTTLS", "AUTH"],
  onData(stream, session, callback) {
    let text = "";
    stream.on("data", (chunk) => (text += chunk));
    stream.on("end", () => {
      messages.push(text.replace(/=\r?\n/g, "").replace(/=3D/g, "="));
      callback();
    });
  },
});
await new Promise((resolve) => smtp.listen(0, "127.0.0.1", resolve));
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = String(smtp.server.address().port);
process.env.SMTP_FROM = "Barwaqt <test@example.test>";
process.env.SMTP_SECURE = "false";
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";
process.env.AUTH_RATE_LIMIT_MAX = "100000";
process.env.GOOGLE_CLIENT_ID = "integration-client.apps.googleusercontent.com";
process.env.APPLE_CLIENT_ID = "";
const { app } = await import("../src/app.js");
const { db } = await import("../src/config/database.js");
const { hashToken, token } = await import("../src/utils/security.js");
after(async () => {
  mock.restoreAll();
  await db.$disconnect();
  await new Promise((resolve) => smtp.close(resolve));
});
function post(path, body, access) {
  let req = request(app).post("/api/v1/auth/" + path);
  if (access) req = req.set("Authorization", `Bearer ${access}`);
  return req.send(body);
}
async function ok(req) {
  const response = await req;
  assert.ok(response.status < 300, JSON.stringify(response.body));
  return response.body.data;
}
const password = "A-test-password-123!",
  email = `reset-${randomUUID()}@example.test`;
const verificationToken = (message) => message.match(/#token=([\w-]+)/)?.[1];
test("signup sends a verification link, blocks sign-in until it is used and allows a resend", async () => {
  const signup = await ok(
    post("register", { email, password, firstName: "Reset", lastName: "" }),
  );
  assert.equal(signup.email, email);
  assert.equal(signup.verificationSent, true);
  assert.equal("accessToken" in signup, false);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /Verify your Barwaqt email address/);

  const registered = await db.user.findUnique({ where: { email } });
  assert.equal(registered.emailVerifiedAt, null);
  assert.equal(
    (await post("login", { identity: email, password })).status,
    403,
  );

  // Resend is enumeration-safe and replaces the previous link.
  const resent = await ok(post("resend-verification", { email }));
  const unknownResend = await ok(
    post("resend-verification", {
      email: `unknown-${randomUUID()}@example.test`,
    }),
  );
  assert.deepEqual(resent, unknownResend);
  assert.equal(messages.length, 2);
  const stale = verificationToken(messages[0]);
  const fresh = verificationToken(messages[1]);
  assert.ok(stale && fresh);
  assert.notEqual(stale, fresh);
  assert.equal((await post("verify-email", { token: stale })).status, 422);
  assert.equal((await post("verify-email", { token: fresh })).status, 200);
  assert.equal((await post("verify-email", { token: fresh })).status, 422);
  const verified = await db.user.findUnique({ where: { email } });
  assert.ok(verified.emailVerifiedAt);
  assert.ok(messages.some((m) => /Welcome to Barwaqt/.test(m)));
  await ok(post("login", { identity: email, password }));
});
test("reset email delivers locally, expires, is single-use and revokes sessions", async () => {
  const login = await ok(post("login", { identity: email, password }));
  const message = await ok(
    post("forgot-password", { email, portal: "customer" }),
  );
  const unknown = await ok(
    post("forgot-password", {
      email: `unknown-${randomUUID()}@example.test`,
      portal: "customer",
    }),
  );
  assert.deepEqual(message, unknown);
  const resetEmail = messages.find((m) =>
    m.includes("Reset your Barwaqt password"),
  );
  assert.ok(resetEmail, "reset email missing");
  const raw = verificationToken(resetEmail);
  assert.ok(raw);
  const row = await db.passwordReset.findFirst({
    where: { userId: login.user.id },
  });
  assert.equal(row.tokenHash, hashToken(raw));
  assert.notEqual(row.tokenHash, raw);
  await ok(
    post("reset-password", {
      token: raw,
      newPassword: "New-test-password-123!",
    }),
  );
  assert.equal(
    (await post("reset-password", { token: raw, newPassword: password }))
      .status,
    422,
  );
  assert.equal(
    (
      await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${login.accessToken}`)
    ).status,
    401,
  );
  assert.equal(
    (await post("login", { identity: email, password })).status,
    401,
  );
  await ok(
    post("login", { identity: email, password: "New-test-password-123!" }),
  );
  const expired = token();
  await db.passwordReset.create({
    data: {
      userId: login.user.id,
      tokenHash: hashToken(expired),
      expiresAt: new Date(Date.now() - 1000),
    },
  });
  assert.ok(
    messages.some((m) => m.includes("Your Barwaqt password was changed")),
    "password-changed notice missing",
  );
  assert.equal(
    (await post("reset-password", { token: expired, newPassword: password }))
      .status,
    422,
  );
});
test("Google signature boundary, nonce, account linking and vendor restrictions", async () => {
  let claims;
  mock.method(
    OAuth2Client.prototype,
    "verifyIdToken",
    async ({ idToken, audience }) => {
      assert.equal(audience, process.env.GOOGLE_CLIENT_ID);
      if (idToken === "invalid-signed-token-value")
        throw Error("invalid signature");
      return { getPayload: () => claims };
    },
  );
  const { nonce } = await ok(post("challenge", { provider: "google" }));
  const credential = "integration-mocked-identity-token";
  claims = {
    sub: `google-${randomUUID()}`,
    email: `social-${randomUUID()}@example.test`,
    email_verified: true,
    nonce,
    given_name: "Social",
  };
  assert.equal(
    (
      await post("social", {
        provider: "google",
        credential: "invalid-signed-token-value",
        nonce,
        portal: "customer",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await post("social", {
        provider: "google",
        credential,
        nonce: "another-wrong-nonce-with-32-characters",
        portal: "customer",
      })
    ).status,
    401,
  );
  const social = await ok(
    post("social", {
      provider: "google",
      credential,
      nonce,
      portal: "customer",
    }),
  );
  assert.equal(social.user.role, "CUSTOMER");
  assert.equal(
    (
      await post("social", {
        provider: "google",
        credential,
        nonce,
        portal: "customer",
      })
    ).status,
    401,
  );
  const existing = await ok(
    post("login", { identity: email, password: "New-test-password-123!" }),
  );
  const next = await ok(post("challenge", { provider: "google" }));
  claims = {
    ...claims,
    sub: `existing-${randomUUID()}`,
    email,
    nonce: next.nonce,
  };
  assert.equal(
    (
      await post("social", {
        provider: "google",
        credential,
        nonce: next.nonce,
        portal: "customer",
      })
    ).status,
    409,
  );
  await ok(
    post(
      "link-provider",
      { provider: "google", credential, nonce: next.nonce, portal: "customer" },
      existing.accessToken,
    ),
  );
  const nextLogin = await ok(post("challenge", { provider: "google" }));
  claims.nonce = nextLogin.nonce;
  const linked = await ok(
    post("social", {
      provider: "google",
      credential,
      nonce: nextLogin.nonce,
      portal: "customer",
    }),
  );
  assert.equal(linked.user.id, existing.user.id);
  const vendorChallenge = await ok(post("challenge", { provider: "google" }));
  claims = {
    ...claims,
    sub: `vendor-${randomUUID()}`,
    email: `vendor-${randomUUID()}@example.test`,
    nonce: vendorChallenge.nonce,
  };
  assert.equal(
    (
      await post("social", {
        provider: "google",
        credential,
        nonce: vendorChallenge.nonce,
        portal: "vendor",
      })
    ).status,
    403,
  );
  assert.equal((await post("challenge", { provider: "apple" })).status, 503);
});
