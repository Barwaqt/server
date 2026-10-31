import { createHmac, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, transaction } from "../config/database.js";
import { env } from "../config/env.js";
import { assert } from "../utils/error.js";
import { internationalPhone, normalizePhone } from "../utils/phone.js";
import { verificationCode } from "../utils/security.js";
import { password, text } from "../validators/common.validator.js";
import { sessionFor } from "./session.service.js";
import { smsReady, sendSms } from "./veevo.service.js";
export const phoneSignup = z
  .object({
    phone: internationalPhone,
    password,
    firstName: text,
    lastName: z.string().trim().max(200).default(""),
  })
  .strict();
export const phoneLogin = z
  .object({
    phone: internationalPhone,
    portal: z.enum(["customer", "vendor"]).default("customer"),
  })
  .strict();
export const phoneVerify = z
  .object({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/) })
  .strict();
export const phoneResend = z.object({ challengeId: z.uuid() }).strict();
const digest = (id, code) =>
  createHmac("sha256", env.JWT_SECRET).update(`${id}:${code}`).digest("hex");
async function issue(phone, purpose, portal, pending, userId) {
  assert(
    smsReady(),
    503,
    "SMS is not configured. Add a real Veevo SMS API key.",
  );
  const id = randomUUID(),
    code = verificationCode(),
    now = new Date();
  await transaction(async (tx) => {
    const previous = await tx.phoneOtp.findUnique({ where: { phone } });
    assert(
      !previous || now - previous.sentAt >= 60000,
      429,
      "Wait 60 seconds before requesting another code.",
    );
    const sameWindow = previous && now - previous.windowStartedAt < 3600000;
    assert(
      !sameWindow || previous.sends < 5,
      429,
      "Too many codes requested. Try again in an hour.",
    );
    const data = {
      id,
      purpose,
      portal,
      pending: pending || {},
      userId: userId || null,
      codeHash: digest(id, code),
      attempts: 0,
      sends: sameWindow ? previous.sends + 1 : 1,
      windowStartedAt: sameWindow ? previous.windowStartedAt : now,
      sentAt: now,
      expiresAt: new Date(+now + 5 * 60000),
      status: "PENDING",
    };
    await tx.phoneOtp.upsert({
      where: { phone },
      create: { phone, ...data },
      update: data,
    });
  });
  try {
    // Unknown login accounts receive the same response but no SMS or session.
    if (purpose === "signup" || userId)
      await sendSms(
        phone,
        `Your Barwaqt verification code is ${code}. It expires in 5 minutes. Do not share this code.`,
      );
    await db.phoneOtp.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "SENT" },
    });
  } catch (error) {
    await db.phoneOtp.updateMany({
      where: { id },
      data: { status: "FAILED", codeHash: "" },
    });
    throw error;
  }
  return {
    challengeId: id,
    phone,
    expiresIn: 300,
    resendAfter: 60,
    message:
      "If this number is eligible, a verification code has been sent by SMS.",
  };
}
async function findPhoneUser(client, phone) {
  const variants = [
    phone,
    phone.slice(1),
    "00" + phone.slice(1),
    ...(phone.startsWith("+92") ? ["0" + phone.slice(3)] : []),
  ];
  const users = await client.user.findMany({
    where: { phone: { in: variants } },
    take: 2,
  });
  assert(
    users.length < 2,
    409,
    "Multiple accounts use this phone number. Contact support.",
  );
  return users[0] || null;
}
export async function signup(input) {
  assert(
    smsReady(),
    503,
    "SMS is not configured. Add a real Veevo SMS API key.",
  );
  assert(
    !(await findPhoneUser(db, input.phone)),
    409,
    "This phone number already has an account. Please log in.",
  );
  const { password: plain, ...details } = input;
  return issue(
    input.phone,
    "signup",
    "customer",
    { ...details, passwordHash: await bcrypt.hash(plain, 12) },
    null,
  );
}
export async function login({ phone, portal }) {
  const user = await findPhoneUser(db, phone);
  const allowed =
    user?.active && user.role === (portal === "vendor" ? "VENDOR" : "CUSTOMER");
  return issue(phone, "login", portal, null, allowed ? user.id : null);
}
export async function resend({ challengeId }) {
  const previous = await db.phoneOtp.findUnique({ where: { id: challengeId } });
  assert(
    previous && ["SENT", "FAILED"].includes(previous.status),
    422,
    "Request a new code from the signup or login screen.",
  );
  if (previous.purpose === "login")
    return login({ phone: previous.phone, portal: previous.portal });
  return issue(
    previous.phone,
    previous.purpose,
    previous.portal,
    previous.pending,
    previous.userId,
  );
}
export async function verify({ challengeId, code }) {
  const result = await transaction(async (tx) => {
    const pending = await tx.phoneOtp.findUnique({
      where: { id: challengeId },
    });
    if (
      !pending ||
      pending.status !== "SENT" ||
      pending.expiresAt <= new Date() ||
      pending.attempts >= 5
    )
      return null;
    if (pending.codeHash !== digest(challengeId, code)) {
      await tx.phoneOtp.update({
        where: { id: challengeId },
        data: { attempts: { increment: 1 } },
      });
      return null;
    }
    let user;
    if (pending.purpose === "signup") {
      if (await findPhoneUser(tx, pending.phone)) return null;
      const data = pending.pending;
      user = await tx.user.create({
        data: {
          phone: pending.phone,
          firstName: data.firstName,
          lastName: data.lastName,
          passwordHash: data.passwordHash,
          role: "CUSTOMER",
          phoneVerifiedAt: new Date(),
        },
      });
    } else {
      user = pending.userId
        ? await tx.user.findUnique({ where: { id: pending.userId } })
        : null;
      if (
        !user?.active ||
        normalizePhone(user.phone || "") !== pending.phone ||
        user.role !== (pending.portal === "vendor" ? "VENDOR" : "CUSTOMER")
      )
        return null;
      user = await tx.user.update({
        where: { id: user.id },
        data: { phone: pending.phone, phoneVerifiedAt: new Date() },
      });
    }
    await tx.phoneOtp.update({
      where: { id: challengeId },
      data: { status: "CONSUMED", codeHash: "", pending: {} },
    });
    return sessionFor(user, tx);
  });
  assert(
    result,
    422,
    "Invalid or expired code. Request a new code after five unsuccessful attempts.",
  );
  return { ...result, message: "Phone verified. You are signed in." };
}
