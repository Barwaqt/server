import { z } from "zod";
import { Router } from "express";
import * as c from "../controllers/catalog.controller.js";
import * as finance from "../controllers/finance.controller.js";
import {
  authenticate,
  roles,
  approvedVendor,
} from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { product } from "../validators/commerce.validator.js";
import * as vendor from "../controllers/vendor.controller.js";
import { page, text } from "../validators/common.validator.js";
export const vendorRouter = Router();
vendorRouter.param("id", (req, res, next, value) => {
  z.uuid().parse(value);
  next();
});
vendorRouter.use(authenticate, roles("VENDOR"), approvedVendor);
vendorRouter.get("/profile", vendor.profile);
vendorRouter.patch(
  "/profile",
  validate(
    z
      .object({
        name: text.optional(),
        description: z.string().max(5000).optional(),
        address: text.optional(),
      })
      .strict()
      .refine(
        (value) => Object.keys(value).length > 0,
        "Provide at least one field",
      ),
  ),
  vendor.updateProfile,
);
vendorRouter.get("/dashboard", finance.summary);
vendorRouter.get("/products", validate(page, "query"), c.vendorProducts);
vendorRouter.post("/products", validate(product), c.create);
vendorRouter.patch("/products/:id", validate(product.partial()), c.update);
vendorRouter.get("/settlements", finance.settlements);
