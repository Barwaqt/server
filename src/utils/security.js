import { createHash, randomBytes, randomInt } from "node:crypto";
export const hashToken = (value) =>
  createHash("sha256").update(value).digest("hex");
export const token = () => randomBytes(48).toString("base64url");
/* Short codes are retyped from a phone, so they stay six digits; they are stored
   hashed, single-use and expire quickly. */
export const verificationCode = () =>
  String(randomInt(0, 1000000)).padStart(6, "0");
