import { z } from "zod";
import { Router } from "express";
import * as c from "../controllers/catalog.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { page } from "../validators/common.validator.js";
export const catalogRouter = Router();
const slug = z.string().regex(/^[a-z0-9-]{1,180}$/);
catalogRouter.param("id", (req, res, next, value) => {
  z.uuid().parse(value);
  next();
});
catalogRouter.param("vendorId", (req, res, next, value) => {
  z.union([z.uuid(), slug]).parse(value);
  next();
});
catalogRouter.get("/categories", c.categories);
catalogRouter.get("/products", validate(page, "query"), c.products);
catalogRouter.get("/products/:id", c.product);

catalogRouter.get("/vendors", validate(page, "query"), c.vendors);
catalogRouter.get("/vendors/:vendorId", c.vendor);
