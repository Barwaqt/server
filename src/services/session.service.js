import jwt from "jsonwebtoken";
import { db } from "../config/database.js";
import { env } from "../config/env.js";
import { hashToken, token } from "../utils/security.js";
import { publicUser } from "../models/user.model.js";

export function access(user, session) {
  return jwt.sign({ sid: session.id }, env.JWT_SECRET, {
    subject: user.id,
    issuer: "barwaqt",
    audience: "barwaqt-api",
    expiresIn: env.ACCESS_TOKEN_MINUTES * 60,
    algorithm: "HS256",
  });
}

/**
 * Starts a session for the account. Shared by password login, social sign-in and
 * email verification, which signs the customer in as soon as the code is accepted.
 */
export async function sessionFor(user, client = db) {
  const refreshToken = token();
  const session = await client.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86400000),
    },
  });
  return {
    accessToken: access(user, session),
    refreshToken,
    expiresIn: env.ACCESS_TOKEN_MINUTES * 60,
    user: await client.user.findUnique({
      where: { id: user.id },
      select: publicUser,
    }),
  };
}
