import { Router } from "express";
import { z } from "zod";
import {
  authenticate,
  roles,
  approvedVendor,
} from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { page } from "../validators/common.validator.js";
import {
  returnCreate,
  returnAction,
} from "../validators/management.validator.js";
import * as c from "../controllers/return.controller.js";
export const returnRouter = Router();
returnRouter.param("id", (req, res, next, id) => {
  z.uuid().parse(id);
  next();
});
returnRouter.use(authenticate);
returnRouter.use((req, res, next) =>
  req.user.role === "VENDOR" ? approvedVendor(req, res, next) : next(),
);
returnRouter.get(
  "/",
  roles("CUSTOMER", "VENDOR", "ADMIN", "FINANCE", "DISPATCHER"),
  validate(page, "query"),
  c.list,
);
returnRouter.post("/", roles("CUSTOMER"), validate(returnCreate), c.create);
returnRouter.post(
  "/:id/actions",
  roles("ADMIN", "DISPATCHER"),
  validate(returnAction),
  c.action,
);
