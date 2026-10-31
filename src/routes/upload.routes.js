import express, { Router } from "express";
import { z } from "zod";
import {
  authenticate,
  roles,
  approvedVendor,
} from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { assert } from "../utils/error.js";
import { upload } from "../validators/management.validator.js";
import * as s from "../services/upload.service.js";
import * as c from "../controllers/upload.controller.js";
export const uploadRouter = Router();
uploadRouter.param("id", (req, res, next, id) => {
  z.uuid().parse(id);
  next();
});
uploadRouter.get(
  "/:id/content",
  async (req, res, next) => {
    req.upload = await s.get(req.params.id);
    if (req.upload.kind === "IMAGE") return next();
    return authenticate(req, res, () => {
      assert(
        req.user.id === req.upload.ownerId || req.user.role === "ADMIN",
        403,
        "Private document",
      );
      next();
    });
  },
  c.content,
);
uploadRouter.use(authenticate, roles("ADMIN", "VENDOR", "RIDER"));
uploadRouter.use((req, res, next) =>
  req.user.role === "VENDOR" ? approvedVendor(req, res, next) : next(),
);
uploadRouter.post(
  "/",
  express.json({ limit: "7mb" }),
  validate(upload),
  c.create,
);
uploadRouter.get("/", c.list);
uploadRouter.delete("/:id", c.remove);
