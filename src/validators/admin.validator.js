import { z } from "zod";
import { id } from "./common.validator.js";
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
