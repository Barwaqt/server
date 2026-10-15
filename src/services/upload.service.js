import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { db } from "../config/database.js";
import { env } from "../config/env.js";
import { assert } from "../utils/error.js";
const root = path.resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
  env.UPLOAD_DIR,
);
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
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, id), buffer, { flag: "wx", mode: 0o600 });
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
    return { ...row, url: `/api/media/${id}` };
  } catch (e) {
    await unlink(path.join(root, id)).catch(() => {});
    throw e;
  }
}
export async function get(id) {
  const row = await db.upload.findUnique({ where: { id } });
  assert(row, 404, "File not found");
  return { ...row, path: path.join(root, id) };
}
export async function list(user) {
  return (
    await db.upload.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    })
  ).map((u) => ({ ...u, url: `/api/media/${u.id}` }));
}
export async function remove(user, id) {
  const row = await get(id);
  assert(
    row.ownerId === user.id || user.role === "ADMIN",
    403,
    "File belongs to another account",
  );
  const url = `/api/media/${id}`;
  assert(
    !(await db.product.count({ where: { images: { has: url } } })) &&
      !(await db.category.count({ where: { image: url } })) &&
      !(await db.orderItem.count({ where: { image: url } })),
    409,
    "This file is still referenced by catalog products or orders",
  );
  await db.upload.delete({ where: { id } });
  await unlink(row.path).catch((e) => {
    if (e.code !== "ENOENT") throw e;
  });
}
