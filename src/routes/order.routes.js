import { Router } from "express";
import { z } from "zod";
import * as c from "../controllers/order.controller.js";
import { authenticate, roles } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { page, orderId } from "../validators/common.validator.js";
import { checkout, action, assign } from "../validators/commerce.validator.js";
export const orderRouter = Router();
orderRouter.param("id", (req, res, next, value) => {
  orderId.parse(value);
  next();
});
orderRouter.use(authenticate);
orderRouter.post("/quote", roles("CUSTOMER"), validate(checkout), c.quote);
orderRouter.post(
  "/checkout",
  roles("CUSTOMER"),
  validate(checkout),
  c.checkout,
);
orderRouter.get(
  "/",
  roles("CUSTOMER", "VENDOR", "RIDER", "ADMIN", "DISPATCHER", "FINANCE"),
  validate(page, "query"),
  c.list,
);
orderRouter.get(
  "/:id",
  roles("CUSTOMER", "VENDOR", "RIDER", "ADMIN", "DISPATCHER", "FINANCE"),
  c.get,
);
orderRouter.post("/:id/actions", validate(action), c.transition);
orderRouter.post(
  "/:id/assign",
  roles("ADMIN", "DISPATCHER"),
  validate(assign),
  c.assign,
);
orderRouter.patch(
  "/:id/location",
  roles("RIDER"),
  validate(
    z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      })
      .strict(),
  ),
  c.location,
);
