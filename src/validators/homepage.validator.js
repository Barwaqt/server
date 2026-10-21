import { z } from "zod";
const text = z.string().trim().min(1).max(160),
  description = z.string().trim().max(1000);
const href = z
  .string()
  .max(500)
  .refine(
    (v) =>
      v.startsWith("/") && !v.startsWith("//") && !/[\\\u0000-\u0020]/.test(v),
    "Use an internal path, for example /category/electronics",
  );
const image = z
  .string()
  .max(2000)
  .refine(
    (v) =>
      /^https:\/\//.test(v) ||
      (v.startsWith("/") &&
        !v.startsWith("//") &&
        !/[\\\u0000-\u0020]/.test(v)),
    "Use an HTTPS image URL or local image path",
  );
const categorySlug = z.string().regex(/^[a-z0-9-]{1,180}$/);
const link = { linkLabel: text, href };
const panel = z
  .object({
    enabled: z.boolean(),
    eyebrow: z.string().max(100),
    title: text,
    highlight: z.string().max(160),
    description,
    image,
    alt: text,
    ...link,
  })
  .strict();
export const heroCarousel = z.union([
  z.object({ enabled: z.boolean(), slides: z.array(panel).max(12) }).strict(),
  panel.transform((value) => ({ enabled: value.enabled, slides: [value] })),
]);
const card = z
  .object({ title: text, description, image, alt: text, ...link })
  .strict();
const categories = z
  .object({
    enabled: z.boolean(),
    title: text,
    ...link,
    items: z
      .array(
        z
          .object({ label: text, icon: z.string().min(1).max(8), categorySlug })
          .strict(),
      )
      .max(16),
  })
  .strict();
const row = z
  .object({
    enabled: z.boolean(),
    title: text,
    description,
    categorySlug,
    linkLabel: text,
    productIds: z.array(z.uuid()).max(30),
  })
  .strict();
export const homepageContent = z
  .object({
    heroMain: heroCarousel,
    heroSide: heroCarousel,
    topCategories: categories,
    featured: z
      .object({
        enabled: z.boolean(),
        title: text,
        badge: z.string().max(100),
        description,
        ...link,
        items: z.array(card).max(8),
        promos: z
          .array(
            z
              .object({ eyebrow: text, title: text, description, ...link })
              .strict(),
          )
          .max(2),
      })
      .strict(),
    flash: row,
    banners: z
      .object({ enabled: z.boolean(), items: z.array(card).max(6) })
      .strict(),
    popularCategories: categories,
    productRows: z.array(row).max(20),
    moreCategories: categories,
    upgrade: panel,
    benefits: z
      .object({
        enabled: z.boolean(),
        items: z
          .array(
            z
              .object({
                icon: z.string().min(1).max(8),
                title: text,
                description,
              })
              .strict(),
          )
          .max(8),
      })
      .strict(),
    searches: z
      .object({
        enabled: z.boolean(),
        title: text,
        terms: z.array(text).max(100),
      })
      .strict(),
    footer: z
      .object({
        columns: z
          .array(
            z
              .object({
                title: text,
                links: z
                  .array(z.object({ label: text, href }).strict())
                  .max(12),
              })
              .strict(),
          )
          .max(6),
        title: text,
        description,
        ...link,
        copyright: text,
        paymentLabel: z.string().max(200),
      })
      .strict(),
  })
  .strict();
export const publishHomepage = z
  .object({ version: z.number().int().positive(), content: homepageContent })
  .strict();
