import { vendorPayout } from "./vendor-payout.validator.js";
import { z } from "zod";
import { id, text, email, phone, password } from "./common.validator.js";
import { product } from "./commerce.validator.js";

const list = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
});

export const vendorQuery = list.extend({
  status: z.enum(["APPROVED", "SUSPENDED"]).optional(),
  city: z.string().max(100).optional(),
  zone: z.string().max(100).optional(),
});

export const productQuery = list.extend({
  vendorId: id.optional(),
  categoryId: id.optional(),
  active: z.enum(["true", "false"]).optional(),
});

export const staffQuery = list.extend({
  role: z.enum(["RIDER", "DISPATCHER", "FINANCE"]).optional(),
});

export const productUpdate = product.partial();

export const staffUpdate = z
  .object({
    active: z.boolean().optional(),
    role: z.enum(["RIDER", "DISPATCHER", "FINANCE"]).optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one field",
  );

export const vendorUpdate = z
  .object({
    name: text.optional(),
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(180)
      .optional(),
    businessType: text.optional(),
    description: z.string().max(5000).optional(),
    city: text.optional(),
    zone: text.optional(),
    address: text.optional(),
    status: z.enum(["APPROVED", "SUSPENDED"]).optional(),
    categoryId: id.optional(),
    bankDetails: vendorPayout.optional(),
    commissionBps: z.number().int().min(0).max(10000).optional(),
    owner: z
      .object({
        firstName: text.optional(),
        lastName: z.string().trim().max(200).optional(),
        email: email.optional(),
        phone: phone.nullable().optional(),
        password: password.optional(),
      })
      .strict()
      .refine((v) => Object.keys(v).length > 0, "Provide owner fields")
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field");
