import { z } from "zod";
export const text = z.string().trim().min(1).max(200);
export const phone = z.string().regex(/^\+?[0-9]{9,15}$/);
export const password = z.string().min(12).max(72);
export const email = z.email().toLowerCase();
export const minor = z.number().int().min(0).max(100000000);
export const id = z.uuid();
export const page = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  minPriceMinor: z.coerce.number().int().min(0).max(100000000).optional(),
  maxPriceMinor: z.coerce.number().int().min(0).max(100000000).optional(),
  inStock: z.enum(["true", "false"]).optional(),
  sort: z.enum(["newest", "price-asc", "price-desc", "name"]).default("newest"),
  city: z.string().max(100).optional(),
  zone: z.string().max(100).optional(),
  categoryId: id.optional(),
  vendorId: id.optional(),
  status: z
    .enum([
      "NEW",
      "PREPARING",
      "READY",
      "ASSIGNED",
      "PICKED_UP",
      "DELIVERED",
      "FAILED",
      "CANCELLED",
      "RETURNED",
    ])
    .optional(),
});
export const pagination = (q) => ({
  skip: (q.page - 1) * q.limit,
  take: q.limit,
});
