import { Router } from "express";
import { z } from "zod";
import { authenticate, roles } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { page } from "../validators/common.validator.js";
import { slot, slotUpdate } from "../validators/management.validator.js";
import * as c from "../controllers/delivery.controller.js";
export const deliveryRouter = Router();
deliveryRouter.param("id", (req, res, next, id) => {
  z.uuid().parse(id);
  next();
});
deliveryRouter.get(
  "/slots",
  authenticate,
  roles("CUSTOMER", "ADMIN", "DISPATCHER"),
  validate(page, "query"),
  c.list,
);
deliveryRouter.post(
  "/slots",
  authenticate,
  roles("ADMIN", "DISPATCHER"),
  validate(slot),
  c.create,
);
deliveryRouter.patch(
  "/slots/:id",
  authenticate,
  roles("ADMIN", "DISPATCHER"),
  validate(slotUpdate),
  c.update,
);
