import * as identity from "../controllers/identity.controller.js";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import * as c from "../controllers/auth.controller.js";
import * as v from "../validators/auth.validator.js";
import { validate } from "../middlewares/validate.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { env } from "../config/env.js";
export const authRouter = Router();
// Background session checks use the API-wide limit. Each sensitive action
// has a separate budget so login attempts cannot block email verification.
for (const action of ["register", "login", "forgot-password", "reset-password", "verify-email", "resend-verification", "challenge", "social", "link-provider", "change-password"]) {
  authRouter.post(`/${action}`, rateLimit({
    windowMs: 900000,
    limit: env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { message: "Too many attempts for this action. Please try again in 15 minutes." } },
  }));
}
authRouter.post("/register", validate(v.register), c.register);
authRouter.post("/login", validate(v.login), c.login);
authRouter.post("/refresh", validate(v.refresh), c.refresh);
authRouter.get("/providers", identity.providers);
authRouter.post(
  "/forgot-password",
  validate(v.forgotPassword),
  identity.forgotPassword,
);
authRouter.post(
  "/reset-password",
  validate(v.resetPassword),
  identity.resetPassword,
);
authRouter.post("/verify-email", validate(v.verifyEmail), identity.verifyEmail);
authRouter.post(
  "/resend-verification",
  validate(v.resendVerification),
  identity.resendVerification,
);
authRouter.post("/challenge", validate(v.challenge), identity.challenge);
authRouter.post("/social", validate(v.social), identity.social);
authRouter.use(authenticate);
authRouter.post("/link-provider", validate(v.social), identity.link);
authRouter.get("/me", c.me);
authRouter.post("/logout", c.logout);
authRouter.post(
  "/change-password",
  validate(v.changePassword),
  c.changePassword,
);
