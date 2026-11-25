import { copyFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "../src/config/database.js";
import { publicUploadRoot, publicFileUrl } from "../src/config/paths.js";

// Starter brands for local and demo environments. The PNGs in ./brand-logos
// are published into the same upload store used by Admin → Brands, so seeded
// and uploaded logos both produce /uploads/... URLs. Running this repeatedly
// is safe: upload rows and files are reused, and an existing logo uploaded by
// an administrator is never overwritten.
const logoDir = fileURLToPath(new URL("./brand-logos/", import.meta.url));
const seedOwner = "system:brand-seed";
const brands = [
  ["Apple", "apple", "iPhone, iPad, Mac and accessories."],
  ["Samsung", "samsung", "Phones, tablets, TVs, appliances and accessories."],
  ["Xiaomi", "xiaomi", "Smartphones, smart home devices and accessories."],
  ["Infinix", "infinix", "Smartphones and everyday electronics."],
  ["Tecno", "tecno", "Smartphones, tablets and accessories."],
  ["Oppo", "oppo", "Smartphones, wearables and audio."],
  ["Vivo", "vivo", "Smartphones and accessories."],
  ["Realme", "realme", "Smartphones, audio and smart devices."],
  ["Nokia", "nokia", "Phones and everyday mobile accessories."],
  ["OnePlus", "oneplus", "Smartphones, audio and wearables."],
];

async function publishLogo(slug) {
  const source = path.join(logoDir, `${slug}.png`);
  const { size } = await stat(source);
  let upload = await db.upload.findFirst({
    where: { ownerId: seedOwner, kind: "IMAGE", filename: `${slug}.png` },
  });
  if (!upload) {
    upload = await db.upload.create({
      data: {
        id: randomUUID(),
        ownerId: seedOwner,
        kind: "IMAGE",
        filename: `${slug}.png`,
        mimeType: "image/png",
        size,
      },
    });
  }
  await mkdir(publicUploadRoot, { recursive: true });
  await copyFile(source, path.join(publicUploadRoot, `${upload.id}.png`));
  return publicFileUrl(`${upload.id}.png`);
}

try {
  for (const [name, slug, description] of brands) {
    const image = await publishLogo(slug);
    const current = await db.brand.findUnique({ where: { slug } });
    if (!current) {
      await db.brand.create({ data: { name, slug, description, image } });
      continue;
    }
    const data = {};
    // Replace the old frontend-served seed paths; keep real uploaded logos.
    if (!current.image || current.image.startsWith("/brands/"))
      data.image = image;
    if (!current.description) data.description = description;
    if (Object.keys(data).length)
      await db.brand.update({ where: { id: current.id }, data });
  }
  const total = await db.brand.count();
  console.log(
    `Brand seed complete: ${brands.length} brands with server-uploaded logos (${total} brands in total).`,
  );
  console.log(`Logo files published to ${publicUploadRoot}.`);
} finally {
  await db.$disconnect();
}
