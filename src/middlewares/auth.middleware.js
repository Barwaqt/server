import jwt from "jsonwebtoken";
import { db } from "../config/database.js";
import { env } from "../config/env.js";
import { ApiError, assert } from "../utils/error.js";
export async function authenticate(req, res, next) {
  const value = req.headers.authorization;
  if (!value?.startsWith("Bearer "))
    throw new ApiError(401, "Authentication required");
  let claims;
  try {
    claims = jwt.verify(value.slice(7), env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "barwaqt",
      audience: "barwaqt-api",
    });
  } catch {
    throw new ApiError(401, "Invalid or expired access token");
  }
  const session = await db.session.findUnique({
    where: { id: claims.sid },
    include: { user: { include: { vendor: true } } },
  });
  assert(
    session &&
      session.expiresAt > new Date() &&
      session.user.active &&
      session.user.id === claims.sub,
    401,
    "Session expired",
  );
  req.user = session.user;
  req.sessionId = session.id;
  next();
}
export const roles =
  (...allowed) =>
  (req, res, next) => {
    assert(allowed.includes(req.user.role), 403, "Insufficient permissions");
    next();
  };
export function approvedVendor(req, res, next) {
  assert(
    req.user.vendor?.status === "APPROVED",
    403,
    "An approved vendor account is required",
  );
  next();
}
