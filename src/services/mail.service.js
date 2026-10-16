import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { assert } from "../utils/error.js";
import {
  accountCreated,
  passwordChanged,
  resetPassword,
  verifyEmail,
  welcome,
} from "../emails/templates.js";

export const mailReady = () => Boolean(env.SMTP_HOST && env.SMTP_FROM);

function transport() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
}

/**
 * Sends one transactional email. Every template ships an HTML body and a plain-text
 * alternative, so clients that block HTML still show a usable message.
 */
async function deliver(to, message) {
  assert(mailReady(), 503, "Email is not configured. Contact support.");
  const mailer = transport();
  try {
    await mailer.sendMail({
      from: env.SMTP_FROM,
      to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: {
        "X-Entity-Ref-ID": message.entityId || undefined,
        "Auto-Submitted": "auto-generated",
      },
    });
  } finally {
    mailer.close();
  }
}

export async function sendResetEmail(email, url, { name = "" } = {}) {
  assert(
    mailReady(),
    503,
    "Password-reset email is not configured. Contact support.",
  );
  await deliver(email, {
    ...resetPassword({ name, url }),
    entityId: `password-reset:${email}`,
  });
}

export async function sendVerificationEmail(email, url, { name = "" } = {}) {
  await deliver(email, {
    ...verifyEmail({ name, url }),
    entityId: `email-verification:${email}`,
  });
}

export async function sendPasswordChangedEmail(
  email,
  { name = "", when = new Date() } = {},
) {
  await deliver(email, passwordChanged({ name, email, when }));
}

export async function sendWelcomeEmail(email, url, { name = "", role } = {}) {
  await deliver(email, {
    ...welcome({ name, url, role }),
    entityId: `welcome:${email}`,
  });
}

export async function sendAccountCreatedEmail(
  email,
  { name = "", temporaryPassword = "", url = "", role } = {},
) {
  await deliver(email, {
    ...accountCreated({ name, email, temporaryPassword, url, role }),
    entityId: `account-created:${email}`,
  });
}
