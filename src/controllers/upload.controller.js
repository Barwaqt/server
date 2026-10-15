import * as s from "../services/upload.service.js";
export const create = async (req, res) =>
  res.status(201).json({ data: await s.create(req.user, req.input.body) });
export const list = async (req, res) =>
  res.json({ data: await s.list(req.user) });
export const remove = async (req, res) => {
  await s.remove(req.user, req.params.id);
  res.status(204).end();
};
export const content = async (req, res) => {
  const row = req.upload;
  res.set({
    "Content-Type": row.mimeType,
    "Content-Disposition": `${row.kind === "DOCUMENT" ? "attachment" : "inline"}; filename="${row.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
    "Cache-Control":
      row.kind === "DOCUMENT" ? "private, no-store" : "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  res.sendFile(row.path);
};
