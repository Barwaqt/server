import { z } from "zod";
import { text, email, password, phone } from "./common.validator.js";
export const register = z
  .object({
    email,
    password,
    phone: phone.optional(),
    firstName: text,
    lastName: text.optional(),
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
