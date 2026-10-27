import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db, transaction } from "../config/database.js";
import { env } from "../config/env.js";
import { assert, ApiError } from "../utils/error.js";
import { token, hashToken } from "../utils/security.js";
import { sessionFor } from "./session.service.js";
import {
  mailReady,
  sendPasswordChangedEmail,
  sendResetEmail,
} from "./mail.service.js";
export { resendVerification, verifyEmail } from "./verification.service.js";
const google = new OAuth2Client();
const appleKeys = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);
export function providers() {
  return {
    googleClientId: env.GOOGLE_CLIENT_ID,
    appleClientId: env.APPLE_CLIENT_ID,
    appleRedirectUri: env.APPLE_REDIRECT_URI,
    passwordReset: mailReady(),
  };
}
export async function forgotPassword({ email, portal }) {
  assert(
    mailReady(),
    503,
    "Password-reset email is not configured. Contact support.",
  );
  const message =
    "If an eligible account exists, a password-reset link will be emailed shortly.";
  const user = await db.user.findUnique({ where: { email } });
  if (
    user?.active &&
    user.role === (portal === "vendor" ? "VENDOR" : "CUSTOMER")
  ) {
    const raw = token();
    const reset = await db.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + 20 * 60000),
      },
    });
    const url = new URL(
      "/reset-password",
      portal === "vendor" ? env.VENDOR_WEB_URL : env.WEB_URL,
    );
    url.hash = `token=${raw}`;
    try {
      await sendResetEmail(user.email, url.toString(), {
        name: user.firstName,
      });
    } catch {
      await db.passwordReset.deleteMany({ where: { id: reset.id } });
      throw new ApiError(
        503,
        "Unable to send password-reset email. Please try again later.",
      );
    }
  }
  return { message };
}
export async function resetPassword({ token: raw, newPassword }) {
  const passwordHash = await bcrypt.hash(newPassword, 12);
  let changed;
  await transaction(async (tx) => {
    const reset = await tx.passwordReset.findUnique({
      where: { tokenHash: hashToken(raw) },
      include: { user: true },
    });
    assert(
      reset && reset.expiresAt > new Date() && reset.user.active,
      422,
      "This reset link is invalid or expired. Request a new one.",
    );
    await tx.user.update({
      where: { id: reset.userId },
      data: { passwordHash },
    });
    await tx.passwordReset.deleteMany({ where: { userId: reset.userId } });
    await tx.session.deleteMany({ where: { userId: reset.userId } });
    changed = reset.user;
  });
  // Security notice only: the password is already changed, so a delivery failure
  // must never turn a completed reset into an error for the customer.
  if (mailReady()) {
    try {
      await sendPasswordChangedEmail(changed.email, {
        name: changed.firstName,
      });
    } catch {
      // Intentionally ignored; the reset already succeeded.
    }
  }
  return {
    message: "Your password has been changed. Sign in with your new password.",
  };
}
export async function challenge(provider) {
  assert(
    provider === "google"
      ? env.GOOGLE_CLIENT_ID
      : env.APPLE_CLIENT_ID && env.APPLE_REDIRECT_URI,
    503,
    `${provider === "google" ? "Google" : "Apple"} sign-in is not configured.`,
  );
  const nonce = token();
  await db.authChallenge.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  await db.authChallenge.create({
    data: {
      tokenHash: hashToken(nonce),
      provider,
      expiresAt: new Date(Date.now() + 5 * 60000),
    },
  });
  return { nonce };
}
export async function verifyIdentity(provider, credential) {
  try {
    if (provider === "google") {
      assert(env.GOOGLE_CLIENT_ID, 503, "Google sign-in is not configured.");
      const ticket = await google.verifyIdToken({
        idToken: credential,
        audience: env.GOOGLE_CLIENT_ID,
      });
      return ticket.getPayload();
    }
    assert(env.APPLE_CLIENT_ID, 503, "Apple sign-in is not configured.");
    const result = await jwtVerify(credential, appleKeys, {
      issuer: "https://appleid.apple.com",
      audience: env.APPLE_CLIENT_ID,
      algorithms: ["RS256"],
    });
    return result.payload;
  } catch (error) {
    if (error.status === 503) throw error;
    throw new ApiError(
      401,
      "Identity verification failed. Please try signing in again.",
    );
  }
}
export async function social(input, linkUser) {
  const claims = await verifyIdentity(input.provider, input.credential);
  assert(
    claims?.sub &&
      claims.nonce === input.nonce &&
      claims.email &&
      (claims.email_verified === true || claims.email_verified === "true"),
    401,
    "Verified email and a matching sign-in challenge are required",
  );
  const field = input.provider === "google" ? "googleSubject" : "appleSubject";
  const email = String(claims.email).toLowerCase();
  const randomPassword = await bcrypt.hash(token(), 12);
  const user = await transaction(async (tx) => {
    const nonce = await tx.authChallenge.findUnique({
      where: { tokenHash: hashToken(input.nonce) },
    });
    assert(
      nonce &&
        nonce.provider === input.provider &&
        nonce.expiresAt > new Date(),
      401,
      "Sign-in challenge expired. Try again.",
    );
    await tx.authChallenge.delete({ where: { id: nonce.id } });
    const linked = await tx.user.findUnique({
      where: { [field]: String(claims.sub) },
    });
    if (linkUser) {
      assert(
        !linked || linked.id === linkUser.id,
        409,
        "This provider is already linked to another account",
      );
      assert(
        linkUser.email === email,
        409,
        "Use the provider account matching your registered email",
      );
      return tx.user.update({
        where: { id: linkUser.id },
        data: { [field]: String(claims.sub) },
      });
    }
    if (linked) {
      assert(linked.active, 403, "Account is disabled");
      assert(
        linked.role === (input.portal === "vendor" ? "VENDOR" : "CUSTOMER"),
        403,
        "Use the appropriate account portal",
      );
      if (linked.role === "VENDOR") {
        const v = await tx.vendor.findUnique({ where: { ownerId: linked.id } });
        assert(v?.status === "APPROVED", 403, "Vendor account is not approved");
      }
      return linked;
    }
    const existing = await tx.user.findUnique({ where: { email } });
    assert(
      !existing,
      409,
      "An account with this email exists. Sign in with your password, then link this provider from your account.",
    );
    assert(
      input.portal !== "vendor",
      403,
      "Vendors must be registered by an administrator. Sign in with your assigned credentials and link your provider.",
    );
    return tx.user.create({
      data: {
        email,
        passwordHash: randomPassword,
        role: "CUSTOMER",
        firstName: String(claims.given_name || "Customer").slice(0, 100),
        lastName: String(claims.family_name || "").slice(0, 100),
        [field]: String(claims.sub),
        // The provider already proved ownership of this email address.
        emailVerifiedAt: new Date(),
      },
    });
  });
  if (linkUser)
    return {
      message: `${input.provider === "google" ? "Google" : "Apple"} account linked. You can now use it to sign in.`,
    };
  return sessionFor(user);
}
