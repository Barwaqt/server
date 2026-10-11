import { Router } from "express";
import { z } from "zod";
import * as c from "../controllers/admin.controller.js";
import { authenticate, roles } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { vendor, staff, coupon } from "../validators/commerce.validator.js";
import { page, text } from "../validators/common.validator.js";
export const adminRouter = Router();
adminRouter.param("id", (req, res, next, value) => {
  z.uuid().parse(value);
  next();
});
adminRouter.use(authenticate, roles("ADMIN"));
adminRouter.post("/vendors", validate(vendor), c.createVendor);
adminRouter.get("/vendors", validate(page, "query"), c.vendors);
adminRouter.patch(
  "/vendors/:id",
  validate(
    z
      .object({
        status: z.enum(["APPROVED", "SUSPENDED"]).optional(),
        commissionBps: z.number().int().min(0).max(10000).optional(),
      })
      .strict(),
  ),
  c.updateVendor,
);
adminRouter.post("/staff", validate(staff), c.createStaff);
adminRouter.post(
  "/categories",
  validate(
    z
      .object({
        name: text,
        slug: z
          .string()
          .regex(/^[a-z0-9-]+$/)
          .max(180),
      })
      .strict(),
  ),
  c.category,
);
adminRouter.post("/coupons", validate(coupon), c.coupon);
adminRouter.get("/reports", c.report);
adminRouter.get("/audit-logs", c.audits);
