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
authRouter.use(authenticate);
authRouter.get("/me", c.me);
authRouter.post("/logout", c.logout);
authRouter.post(
  "/change-password",
  validate(v.changePassword),
  c.changePassword,
);
