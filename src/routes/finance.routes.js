import { Router } from "express";
import { z } from "zod";
import * as c from "../controllers/finance.controller.js";
import { authenticate, roles } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { id, text, minor } from "../validators/common.validator.js";
export const financeRouter = Router();
financeRouter.param("id", (req, res, next, value) => {
  z.uuid().parse(value);
  next();
});
financeRouter.use(authenticate, roles("ADMIN", "FINANCE"));
financeRouter.post(
  "/remittances",
  validate(
    z
      .object({ riderId: id, amountMinor: minor.positive(), reference: text })
      .strict(),
  ),
  c.remittance,
);
financeRouter.get("/settlements", c.settlements);
financeRouter.post(
  "/settlements",
  validate(z.object({ vendorId: id }).strict()),
  c.createSettlement,
);
financeRouter.patch(
  "/settlements/:id",
  validate(
    z
      .object({
        status: z.enum(["PROCESSED", "PAID"]),
        reference: text.optional(),
      })
      .strict(),
  ),
  c.updateSettlement,
);
financeRouter.post(
  "/orders/:id/refunds",
  validate(
    z
      .object({ amountMinor: minor.positive(), reason: text, reference: text })
      .strict(),
  ),
  c.refund,
);
