import { z } from "zod";
import { text } from "./common.validator.js";
export const vendorPayout = z
  .object({
    method: z.enum(["BANK_TRANSFER", "EASYPAISA", "JAZZCASH"]),
    accountTitle: text,
    accountNumber: z.string().trim().min(5).max(100),
    bankName: z.string().trim().max(200).default(""),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.method === "BANK_TRANSFER" && !value.bankName)
      ctx.addIssue({
        code: "custom",
        path: ["bankName"],
        message: "Enter the bank name",
      });
  })
  .transform((value) => ({
    ...value,
    bankName:
      value.method === "EASYPAISA"
        ? "Easypaisa"
        : value.method === "JAZZCASH"
          ? "JazzCash"
          : value.bankName,
  }));
