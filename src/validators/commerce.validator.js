import { vendorPayout } from "./vendor-payout.validator.js";
import { z } from "zod";
import { text, minor, id, phone, email, password } from "./common.validator.js";
export const address = z
  .object({
    kind: z.enum(["Home", "Work", "Other"]).default("Home"),
    firstName: text,
    lastName: z.string().max(100).default(""),
    phone,
    city: text,
    zone: text,
    street: text,
    building: z.string().max(200).default(""),
    apartment: z.string().max(100).default(""),
    directions: z.string().max(500).default(""),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .strict();
export const product = z
  .object({
    name: text,
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(180),
    categoryId: id,
    description: z.string().max(10000).default(""),
    priceMinor: minor.positive(),
    stock: z.number().int().min(0).max(1000000),
    images: z
      .array(
        z
          .string()
          .max(2000)
          .refine((v) => /^https:\/\//.test(v) || /^\/(?!\/)/.test(v)),
      )
      .max(12)
      .default([]),
    attributes: z.record(z.string().max(50), z.string().max(500)).default({}),
    active: z.boolean().default(true),
  })
  .strict();
export const vendor = z
  .object({
    email,
    password,
    phone,
    firstName: text,
    lastName: text.optional(),
    name: text,
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(180),
    businessType: text,
    description: z.string().max(5000).optional(),
    city: text,
    zone: text,
    address: text,
    categoryId: id,
    bankDetails: vendorPayout,
  })
  .strict();
export const staff = z
  .object({
    email,
    password,
    phone: phone.optional(),
    firstName: text,
    lastName: text.optional(),
    role: z.enum(["RIDER", "DISPATCHER", "FINANCE"]),
  })
  .strict();
export const coupon = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,30}$/),
    percentBps: z.number().int().min(1).max(10000),
    maxDiscountMinor: minor.positive(),
    minSubtotalMinor: minor.default(0),
    maxUses: z.number().int().min(1).max(1000000),
    expiresAt: z.iso.datetime().transform((v) => new Date(v)),
  })
  .strict();
export const checkout = z
  .object({
    addressId: id,
    deliverySlotId: id.optional(),
    productIds: z.array(id).min(1).max(100).optional(),
    couponCode: z.string().max(30).optional(),
    paymentMethod: z
      .enum(["COD", "CARD", "JAZZCASH", "EASYPAISA", "BANK_TRANSFER"])
      .default("COD"),
  })
  .strict();
export const action = z
  .object({
    action: z.enum([
      "accept",
      "reject",
      "ready",
      "cancel",
      "pickup",
      "deliver",
      "fail",
      "retry",
      "return",
    ]),
    reason: z.string().trim().min(3).max(500).optional(),
    pin: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    cashCollectedMinor: minor.optional(),
  })
  .strict();
export const assign = z.object({ riderId: id }).strict();
export const quantity = z
  .object({ quantity: z.number().int().min(0).max(99) })
  .strict();
