import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, transaction } from "../config/database.js";
import { env } from "../config/env.js";
import { findIdentity, publicUser } from "../models/user.model.js";
import { hashToken, token } from "../utils/security.js";
import { assert } from "../utils/error.js";
import {
  issueVerification,
  verificationRequired,
} from "./verification.service.js";
const dummy = await bcrypt.hash(
  "constant-dummy-password-to-balance-login-time",
  12,
);
function access(user, session) {
  return jwt.sign({ sid: session.id }, env.JWT_SECRET, {
    subject: user.id,
    issuer: "barwaqt",
    audience: "barwaqt-api",
    expiresIn: env.ACCESS_TOKEN_MINUTES * 60,
    algorithm: "HS256",
  });
}
export async function sessionFor(user) {
  const refreshToken = token();
  const session = await db.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86400000),
    },
  });
  return {
    accessToken: access(user, session),
    refreshToken,
    expiresIn: env.ACCESS_TOKEN_MINUTES * 60,
    user: await db.user.findUnique({
      where: { id: user.id },
      select: publicUser,
    }),
  };
}
export async function register(input) {
  const user = await db.user.create({
    data: {
      ...input,
      password: undefined,
      passwordHash: await bcrypt.hash(input.password, 12),
      role: "CUSTOMER",
    },
  });
  // Without a configured mail server nobody could ever verify, so the account is
  // activated straight away instead of locking the customer out of their own signup.
  if (!verificationRequired()) {
    await db.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });
    return {
      message: "Account created. You can sign in now.",
      email: user.email,
      verificationSent: false,
    };
  }
  try {
    await issueVerification(user);
  } catch (error) {
    // No link means no account: remove it so the customer can simply try again.
    await db.user.delete({ where: { id: user.id } });
    throw error;
  }
  return {
    message:
      "Account created. Check your inbox and verify your email to sign in.",
    email: user.email,
    verificationSent: true,
  };
}
export async function login(input) {
  const user = await findIdentity(input.identity);
  const valid = await bcrypt.compare(
    input.password,
    user?.passwordHash || dummy,
  );
  assert(valid && user?.active, 401, "Invalid credentials");
  assert(
    user.emailVerifiedAt,
    403,
    "Verify your email address before signing in. Request a new verification link if it expired.",
  );
  return sessionFor(user);
}
export async function refresh(value) {
  const next = token();
  const result = await transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { tokenHash: hashToken(value) },
      include: { user: true },
    });
    assert(
      session && session.expiresAt > new Date() && session.user.active,
      401,
      "Invalid refresh token",
    );
    await tx.session.update({
      where: { id: session.id },
      data: { tokenHash: hashToken(next) },
    });
    return session;
  });
  return {
    accessToken: access(result.user, result),
    refreshToken: next,
    expiresIn: env.ACCESS_TOKEN_MINUTES * 60,
  };
}
export async function logout(sessionId) {
  await db.session.deleteMany({ where: { id: sessionId } });
}
export async function changePassword(user, input) {
  assert(
    await bcrypt.compare(input.currentPassword, user.passwordHash),
    401,
    "Current password is incorrect",
  );
  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.passwordReset.deleteMany({ where: { userId: user.id } });
  });
  return { message: "Password changed. Sign in again." };
}
