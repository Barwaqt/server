import { createHash, randomBytes } from "node:crypto";
export const hashToken = (value) =>
  createHash("sha256").update(value).digest("hex");
export const token = () => randomBytes(48).toString("base64url");
