import { z } from "zod";
import { text, email, password, phone } from "./common.validator.js";
export const register = z
  .object({
    email,
    password,
    phone: phone.optional(),
    firstName: text,
    lastName: z.string().trim().max(200).optional(),
  })
  .strict();
export const login = z
  .object({ identity: text, password: z.string().min(1).max(72) })
  .strict();
export const refresh = z
  .object({ refreshToken: z.string().min(32).max(200) })
  .strict();
export const changePassword = z
  .object({ currentPassword: z.string().max(72), newPassword: password })
  .strict();
export const forgotPassword = z
  .object({ email, portal: z.enum(["customer", "vendor"]).default("customer") })
  .strict();
export const resetPassword = z
  .object({ token: z.string().min(32).max(200), newPassword: password })
  .strict();
export const verifyEmail = z
  .object({
    code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from the email"),
  })
  .strict();
export const resendVerification = z.object({ email }).strict();
export const social = z
  .object({
    provider: z.enum(["google", "apple"]),
    credential: z.string().min(20).max(10000),
    nonce: z.string().min(32).max(200),
    portal: z.enum(["customer", "vendor"]).default("customer"),
  })
  .strict();
export const challenge = z
  .object({ provider: z.enum(["google", "apple"]) })
  .strict();
