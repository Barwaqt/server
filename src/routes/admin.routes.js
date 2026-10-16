import * as homepage from "../controllers/homepage.controller.js";
import { publishHomepage } from "../validators/homepage.validator.js";
import * as m from "../controllers/management.controller.js";
import {
  category,
  categoryUpdate,
  couponUpdate,
} from "../validators/management.validator.js";
import { page } from "../validators/common.validator.js";
import { Router } from "express";
import { z } from "zod";
import * as c from "../controllers/admin.controller.js";
import { authenticate, roles } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { vendor, staff, coupon } from "../validators/commerce.validator.js";
import {
  vendorQuery,
  vendorUpdate,
  productQuery,
  staffQuery,
  productUpdate,
  staffUpdate,
} from "../validators/admin.validator.js";
export const adminRouter = Router();
adminRouter.param("id", (req, res, next, value) => {
  z.uuid().parse(value);
  next();
});
adminRouter.use(authenticate, roles("ADMIN"));
adminRouter.get("/homepage", homepage.get);
adminRouter.put("/homepage", validate(publishHomepage), homepage.publish);
adminRouter.post("/vendors", validate(vendor), c.createVendor);
adminRouter.get("/vendors", validate(vendorQuery, "query"), c.vendors);
adminRouter.get("/vendors/:id", c.vendor);
adminRouter.patch("/vendors/:id", validate(vendorUpdate), c.updateVendor);
adminRouter.get("/products", validate(productQuery, "query"), c.products);
adminRouter.patch("/products/:id", validate(productUpdate), c.updateProduct);
adminRouter.get("/staff", validate(staffQuery, "query"), c.staff);
adminRouter.patch("/staff/:id", validate(staffUpdate), c.updateStaff);
adminRouter.post("/staff", validate(staff), c.createStaff);
adminRouter.get("/categories", validate(page, "query"), m.categories);
adminRouter.post("/categories", validate(category), m.createCategory);
adminRouter.patch(
  "/categories/:id",
  validate(categoryUpdate),
  m.updateCategory,
);
adminRouter.delete("/categories/:id", m.deleteCategory);
adminRouter.get("/coupons", validate(page, "query"), m.coupons);
adminRouter.post("/coupons", validate(coupon), m.createCoupon);
adminRouter.patch("/coupons/:id", validate(couponUpdate), m.updateCoupon);
adminRouter.delete("/coupons/:id", m.deleteCoupon);
adminRouter.get("/reports", c.report);
adminRouter.get("/audit-logs", c.audits);
