import { z } from "zod";
import { id, text } from "./common.validator.js";
import { coupon } from "./commerce.validator.js";
export const category = z
  .object({
    name: text,
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(180),
    image: z
      .string()
      .max(2000)
      .refine((v) => v === "" || /^https:\/\//.test(v) || /^\/(?!\/)/.test(v))
      .nullable()
      .optional(),
    parentSlug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(180)
      .nullable()
      .optional(),
    productIds: z.array(id).max(500).optional(),
  })
  .strict();
export const categoryUpdate = category
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field");
export const couponUpdate = coupon
  .partial()
  .extend({ active: z.boolean().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field");
export const slot = z
  .object({
    city: text,
    zone: text,
    startsAt: z.iso.datetime().transform((v) => new Date(v)),
    endsAt: z.iso.datetime().transform((v) => new Date(v)),
    capacity: z.number().int().min(1).max(10000),
    active: z.boolean().default(true),
  })
  .strict();
export const slotUpdate = slot
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field");
export const returnCreate = z
  .object({ vendorOrderId: id, reason: z.string().trim().min(5).max(1000) })
  .strict();
export const returnAction = z
  .object({
    action: z.enum(["approve", "reject", "receive"]),
    note: z.string().trim().max(1000).default(""),
    restock: z.boolean().default(false),
  })
  .strict()
  .refine(
    (v) => v.action !== "reject" || v.note.length >= 3,
    "Provide a rejection reason",
  );
export const upload = z
  .object({
    filename: z.string().min(1).max(200),
    kind: z.enum(["IMAGE", "DOCUMENT"]).default("IMAGE"),
    data: z.string().min(4).max(7000000),
  })
  .strict();
