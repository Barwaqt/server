import * as identity from "../controllers/identity.controller.js";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import * as c from "../controllers/auth.controller.js";
import * as v from "../validators/auth.validator.js";
import { validate } from "../middlewares/validate.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
export const authRouter = Router();
authRouter.use(
  rateLimit({
    windowMs: 900000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
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
