import {
  readFile,
  mkdir,
  copyFile,
  access,
  writeFile,
  chmod,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../src/config/database.js";
const root = new URL("../../", import.meta.url);
const catalog = JSON.parse(
  await readFile(new URL("./data/catalog.json", import.meta.url), "utf8"),
);
const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export async function seedCatalog() {
  const stock = Number(process.env.SEED_PRODUCT_STOCK || 50);
  if (!Number.isInteger(stock) || stock < 0 || stock > 1000000)
    throw Error("SEED_PRODUCT_STOCK must be 0–1000000");
  const email = (
    process.env.SEED_VENDOR_EMAIL || "catalog-vendor@barwaqt.example"
  ).toLowerCase();
  const city = process.env.SEED_VENDOR_CITY || "Lahore",
    zone = process.env.SEED_VENDOR_ZONE || "Gulberg";
  // Check every source image before writing database records. Mirror only missing assets.
  const images = new Set(
    [
      ...catalog.products.map((p) => p.image),
      ...catalog.categories.map((c) => c.image),
    ].filter(Boolean),
  );
  for (const image of images) {
    if (!/^\/(shop|product|category)\/[a-zA-Z0-9_.-]+$/.test(image))
      throw Error(`Unsafe asset path: ${image}`);
    const source = new URL("web/public" + image, root);
    await access(source);
    const target = new URL("vendor_web/public" + image, root);
    await mkdir(new URL(".", target), { recursive: true });
    try {
      await access(target);
    } catch {
      await copyFile(source, target);
    }
  }
  let user = await db.user.findUnique({
    where: { email },
    include: { vendor: true },
  });
  if (user && (user.role !== "VENDOR" || !user.active || !user.vendor))
    throw Error("Seed vendor email belongs to an incompatible account");
  if (!user) {
    const password =
      process.env.SEED_VENDOR_PASSWORD || randomBytes(24).toString("base64url");
    if (password.length < 12 || password.length > 72)
      throw Error("SEED_VENDOR_PASSWORD must be 12–72 characters");
    const passwordHash = await bcrypt.hash(password, 12);
    // Write credentials privately BEFORE creating account; do not print the password.
    const credentials = new URL("../.seed-vendor.local.json", import.meta.url);
    await writeFile(
      credentials,
      JSON.stringify({ email, password, city, zone }, null, 2) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    await chmod(credentials, 0o600);
    user = await db.user.create({
      data: {
        email,
        passwordHash,
        firstName: "Catalog",
        lastName: "Vendor",
        role: "VENDOR",
        vendor: {
          create: {
            name: "Barwaqt Catalog Store",
            slug: "barwaqt-catalog-store",
            description: "Imported Barwaqt reference catalog",
            businessType: "Marketplace",
            city,
            zone,
            address: "Seed catalog store",
            commissionBps: 1000,
          },
        },
      },
      include: { vendor: true },
    });
  }
  const counts = {
    categories: 0,
    products: 0,
    existingProducts: 0,
    assets: images.size,
  };
  await db.$transaction(
    async (tx) => {
      const categories = new Map();
      for (const c of catalog.categories) {
        const existed = await tx.category.findUnique({
          where: { slug: c.slug },
        });
        const image =
          c.image ||
          catalog.products.find((p) => c.productIds.includes(p.id))?.image ||
          null;
        const row = await tx.category.upsert({
          where: { slug: c.slug },
          create: {
            name: c.title,
            commissionBps: 1000,
            slug: c.slug,
            image,
            parentSlug: c.parent || null,
          },
          update: {
            ...(!existed?.image && image ? { image } : {}),
            ...(!existed?.parentSlug && c.parent
              ? { parentSlug: c.parent }
              : {}),
          },
        });
        categories.set(c.slug, row.id);
        if (!existed) counts.categories++;
      }
      for (const p of catalog.products) {
        const slug = `seed-${slugify(p.id)}-${slugify(p.name)}`.slice(0, 180);
        const existing = await tx.product.findUnique({ where: { slug } });
        if (existing) {
          if (existing.vendorId !== user.vendor.id)
            throw Error(`Seed slug owned by another vendor: ${slug}`);
          counts.existingProducts++;
          continue;
        }
        const memberships = catalog.categories.filter((c) =>
          c.productIds.includes(p.id),
        );
        const primary =
          memberships.find((c) => c.parent) ||
          memberships.find(
            (c) => !["all-products", "deals"].includes(c.slug),
          ) ||
          memberships[0];
        if (!primary) throw Error(`No category for ${p.id}`);
        const priceMinor = Math.round(p.price * 100);
        if (!Number.isSafeInteger(priceMinor) || priceMinor <= 0)
          throw Error(`Invalid price for ${p.id}`);
        await tx.product.create({
          data: {
            name: p.name,
            slug,
            vendorId: user.vendor.id,
            categoryId: categories.get(primary.slug),
            description: p.name,
            priceMinor,
            stock,
            images: [p.image],
            active: true,
            attributes: {
              sourceId: p.id,
              sourceSection: p.section,
              referencePrice: String(p.old),
              referenceRating: String(p.rating),
              sourceCurrency: "AED",
              seedCurrency: "PKR",
              pricePolicy: "Original numeric amount retained; no FX conversion",
            },
            catalogCategories: {
              connect: memberships.map((c) => ({ id: categories.get(c.slug) })),
            },
          },
        });
        counts.products++;
      }
    },
    { timeout: 120000 },
  );
  console.log(
    JSON.stringify(
      {
        message:
          "Catalog seed complete; existing vendor products/stock/passwords preserved",
        ...counts,
        vendorEmail: email,
        vendorId: user.vendor.id,
        city: user.vendor.city,
        zone: user.vendor.zone,
        credentialsFile:
          "server/.seed-vendor.local.json (only written for newly created vendor)",
      },
      null,
      2,
    ),
  );
  return counts;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await seedCatalog();
  } finally {
    await db.$disconnect();
  }
}
