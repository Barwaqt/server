import { preview, riderBalances } from "../services/reconciliation.service.js";
import { Router } from "express";
import { z } from "zod";
import * as c from "../controllers/finance.controller.js";
import { authenticate, roles } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  id,
  orderId,
  text,
  minor,
  page,
} from "../validators/common.validator.js";
export const financeRouter = Router();
// `:id` is an order number on /orders/:id/refunds and a UUID elsewhere.
const anyId = z.union([z.uuid(), orderId]);
financeRouter.param("id", (req, res, next, value) => {
  anyId.parse(value);
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
financeRouter.get(
  "/settlement-preview",
  validate(z.object({ vendorId: id }), "query"),
  async (req, res) =>
    res.json({ data: await preview(req.input.query.vendorId) }),
);
financeRouter.get("/rider-balances", async (req, res) =>
  res.json({ data: await riderBalances() }),
);
financeRouter.get("/remittances", validate(page, "query"), c.remittances);
financeRouter.get("/refunds", validate(page, "query"), c.refunds);
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
