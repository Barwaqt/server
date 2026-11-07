import {
  mkdir,
  writeFile,
  unlink,
  access,
  rename,
  copyFile,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "../config/database.js";
import {
  uploadRoot,
  publicUploadRoot,
  publicFileUrl,
} from "../config/paths.js";
import { assert } from "../utils/error.js";
const extensions = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
// Images are public files served by express.static; documents stay private and
// are only readable through the authenticated /uploads/:id/content route.
function publicName(id, mimeType) {
  return `${id}.${extensions[mimeType] ?? "bin"}`;
}
function publicFile(row) {
  return path.join(publicUploadRoot, publicName(row.id, row.mimeType));
}
function privateFile(id) {
  return path.join(uploadRoot, id);
}
function urlFor(row) {
  return row.kind === "IMAGE"
    ? publicFileUrl(publicName(row.id, row.mimeType))
    : `/api/media/${row.id}`;
}
async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
// Images uploaded before the public directory existed are stored without an
// extension in the upload root. Keep reading them through the same route.
async function fileFor(row) {
  if (row.kind === "IMAGE") {
    const file = publicFile(row);
    if (await exists(file)) return file;
  }
  return privateFile(row.id);
}
// Those same pre-public images would 404 at the static URL returned by urlFor(),
// because the served path carries an extension the file does not have. Move them
// into the public directory once at boot so that URL resolves to a real file.
export async function adoptLegacyImages() {
  const rows = await db.upload.findMany({
    where: { kind: "IMAGE" },
    select: { id: true, mimeType: true },
  });
  let adopted = 0;
  for (const row of rows) {
    const file = publicFile(row);
    if (await exists(file)) continue;
    const legacy = privateFile(row.id);
    if (!(await exists(legacy))) continue;
    await mkdir(publicUploadRoot, { recursive: true });
    await rename(legacy, file).catch(async (e) => {
      if (e.code !== "EXDEV") throw e;
      await copyFile(legacy, file);
      await unlink(legacy);
    });
    adopted += 1;
  }
  return adopted;
}
export async function adoptRelativeProductImages() {
  const products = await db.product.findMany({
    select: { id: true, images: true },
  });
  let count = 0;
  for (const p of products) {
    if (
      Array.isArray(p.images) &&
      p.images.some(
        (img) => typeof img === "string" && img.startsWith("/uploads/"),
      )
    ) {
      const normalized = p.images.map((img) =>
        typeof img === "string" && img.startsWith("/uploads/")
          ? publicFileUrl(img.replace(/^\/uploads\/?/, ""))
          : img,
      );
      await db.product.update({
        where: { id: p.id },
        data: { images: normalized },
      });
      count += 1;
    }
  }
  return count;
}
export function detect(buffer) {
  if (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
    return "image/jpeg";
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  if (buffer.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}
export async function create(user, input) {
  assert(
    input.kind === "IMAGE" || ["ADMIN", "VENDOR"].includes(user.role),
    403,
    "Document uploads require a vendor or administrator",
  );
  assert(
    /^[A-Za-z0-9+/]+={0,2}$/.test(input.data) && input.data.length % 4 === 0,
    422,
    "Invalid base64 file data",
  );
  const buffer = Buffer.from(input.data, "base64");
  assert(
    buffer.length > 0 && buffer.length <= 5 * 1024 * 1024,
    413,
    "Files must be no larger than 5 MB",
  );
  const mimeType = detect(buffer);
  assert(
    mimeType &&
      ((input.kind === "IMAGE" && mimeType.startsWith("image/")) ||
        (input.kind === "DOCUMENT" && mimeType === "application/pdf")),
    422,
    "Use PNG, JPEG or WebP images, or PDF documents",
  );
  const id = randomUUID();
  const file =
    input.kind === "IMAGE"
      ? path.join(publicUploadRoot, publicName(id, mimeType))
      : privateFile(id);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buffer, {
    flag: "wx",
    mode: input.kind === "IMAGE" ? 0o644 : 0o600,
  });
  try {
    const row = await db.upload.create({
      data: {
        id,
        ownerId: user.id,
        kind: input.kind,
        filename: path.basename(input.filename).replace(/[\r\n"\\]/g, "_"),
        mimeType,
        size: buffer.length,
      },
    });
    return { ...row, url: urlFor(row) };
  } catch (e) {
    await unlink(file).catch(() => {});
    throw e;
  }
}
export async function get(id) {
  const row = await db.upload.findUnique({ where: { id } });
  assert(row, 404, "File not found");
  return { ...row, path: await fileFor(row) };
}
export async function list(user) {
  return (
    await db.upload.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    })
  ).map((u) => ({ ...u, url: urlFor(u) }));
}
export async function remove(user, id) {
  const row = await get(id);
  assert(
    row.ownerId === user.id || user.role === "ADMIN",
    403,
    "File belongs to another account",
  );
  // Catalog rows may hold the public URL or the older frontend-proxy URL.
  const urls = [...new Set([urlFor(row), `/api/media/${id}`])];
  assert(
    !(await db.product.count({ where: { images: { hasSome: urls } } })) &&
      !(await db.category.count({ where: { image: { in: urls } } })) &&
      !(await db.orderItem.count({ where: { image: { in: urls } } })),
    409,
    "This file is still referenced by catalog products or orders",
  );
  await db.upload.delete({ where: { id } });
  await unlink(row.path).catch((e) => {
    if (e.code !== "ENOENT") throw e;
  });
}
