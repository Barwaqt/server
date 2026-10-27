import { db, transaction } from "../config/database.js";
import { env } from "../config/env.js";
import { assert } from "../utils/error.js";
import { hashToken, verificationCode } from "../utils/security.js";
import {
  mailReady,
  sendVerificationEmail,
  sendWelcomeEmail,
} from "./mail.service.js";

/* A six-digit code is only strong while it is short-lived. */
export const VERIFICATION_TTL_MINUTES = 15;

/* Verification can only be enforced when the install can actually deliver email. */
export const verificationRequired = () => mailReady();

/* The email carries the code, so the link only opens the form where it is entered. */
export function verificationUrl(portal = "customer") {
  const base = portal === "vendor" ? env.VENDOR_WEB_URL : env.WEB_URL;
  return new URL("/verify-email", base).toString();
}

/**
 * Creates a fresh single-use code for the account and emails it.
 * Older codes are dropped so only the newest one works.
 */
export async function issueVerification(user) {
  const code = verificationCode();
  await db.emailVerification.deleteMany({ where: { userId: user.id } });
  await db.emailVerification.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(code),
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MINUTES * 60000),
    },
  });
  await sendVerificationEmail(
    user.email,
    {
      code,
      url: verificationUrl(user.role === "VENDOR" ? "vendor" : "customer"),
      minutes: VERIFICATION_TTL_MINUTES,
    },
    { name: user.firstName },
  );
}

export async function verifyEmail({ code }) {
  const user = await transaction(async (tx) => {
    const pending = await tx.emailVerification.findUnique({
      where: { tokenHash: hashToken(code) },
      include: { user: true },
    });
    assert(
      pending && pending.expiresAt > new Date(),
      422,
      "This verification code is invalid or expired. Request a new one.",
    );
    assert(pending.user.active, 403, "This account is disabled.");
    await tx.emailVerification.deleteMany({
      where: { userId: pending.userId },
    });
    return tx.user.update({
      where: { id: pending.userId },
      data: { emailVerifiedAt: new Date() },
    });
  });
  // Best effort: a welcome email must never fail a successful verification.
  if (mailReady()) {
    try {
      await sendWelcomeEmail(user.email, env.WEB_URL, {
        name: user.firstName,
        role: user.role,
      });
    } catch {
      // Intentionally ignored.
    }
  }
  return { message: "Email verified. You can sign in now.", email: user.email };
}

export async function resendVerification({ email }) {
  const message =
    "If this account needs verification, a new verification code will be emailed shortly.";
  const user = await db.user.findUnique({ where: { email } });
  if (user?.active && !user.emailVerifiedAt && mailReady()) {
    await issueVerification(user);
  }
  return { message };
}
