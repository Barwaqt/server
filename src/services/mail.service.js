import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { assert } from "../utils/error.js";
export const mailReady = () => Boolean(env.SMTP_HOST && env.SMTP_FROM);
export async function sendResetEmail(email, url) {
  assert(
    mailReady(),
    503,
    "Password-reset email is not configured. Contact support.",
  );
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  try {
    await transport.sendMail({
      from: env.SMTP_FROM,
      to: email,
      subject: "Reset your Barwaqt password",
      text: `A password reset was requested for your Barwaqt account.\n\n${url}\n\nThis link expires in 20 minutes and can be used once. If you did not request this, ignore this email.`,
    });
  } finally {
    transport.close();
  }
}
