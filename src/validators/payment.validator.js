import { z } from "zod";
import { text, page } from "./common.validator.js";
export const methods = z.enum(["BANK_TRANSFER", "JAZZCASH", "EASYPAISA"]);
export const account = z
  .object({
    method: methods,
    accountTitle: text,
    accountNumber: z.string().trim().min(5).max(100),
    bankName: z.string().trim().max(200).default(""),
    instructions: z.string().trim().max(1000).default(""),
    active: z.boolean().default(false),
  })
  .strict();
export const submission = z
  .object({
    reference: z
      .string()
      .trim()
      .min(3)
      .max(100)
      .transform((v) => v.toUpperCase()),
  })
  .strict();
export const review = z
  .object({
    action: z.enum(["verify", "reject"]),
    note: z.string().trim().min(3).max(1000),
  })
  .strict();
export const paymentQuery = page
  .omit({ status: true })
  .extend({
    status: z
      .enum([
        "AWAITING_TRANSFER",
        "UNDER_REVIEW",
        "REJECTED",
        "PAID",
        "REFUND_DUE",
        "REFUNDED",
        "CANCELLED",
      ])
      .optional(),
  });
