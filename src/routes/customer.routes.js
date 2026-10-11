import { Router } from "express";
import { z } from "zod";
import * as c from "../controllers/customer.controller.js";
import { authenticate, roles } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { address, quantity } from "../validators/commerce.validator.js";
import { text, phone } from "../validators/common.validator.js";
export const customerRouter = Router();
customerRouter.param("id", (req, res, next, value) => {
  z.uuid().parse(value);
  next();
});
customerRouter.use(authenticate, roles("CUSTOMER"));
customerRouter.patch(
  "/profile",
  validate(
    z
      .object({
        firstName: text.optional(),
        lastName: z.string().max(100).optional(),
        phone: phone.optional(),
        profile: z
          .object({
            birthday: z.iso.date().optional(),
            gender: z.enum(["Male", "Female", "Other"]).optional(),
            nationality: z.string().max(100).optional(),
            tourist: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
  ),
  c.profile,
);
customerRouter.get("/addresses", c.addresses);
customerRouter.post("/addresses", validate(address), c.createAddress);
customerRouter.put("/addresses/:id", validate(address), c.updateAddress);
customerRouter.delete("/addresses/:id", c.deleteAddress);
customerRouter.get("/cart", c.cart);
customerRouter.put("/cart/:id", validate(quantity), c.updateCart);
customerRouter.get("/wishlist", c.wishlist);
customerRouter.put("/wishlist/:id", c.saveWishlist);
customerRouter.delete("/wishlist/:id", c.removeWishlist);
customerRouter.put(
  "/reviews/:id",
  validate(
    z
      .object({
        rating: z.number().int().min(1).max(5),
        comment: z.string().trim().min(1).max(2000),
      })
      .strict(),
  ),
  c.review,
);
