import { z } from "zod";
import { Router } from "express";
import * as c from "../controllers/catalog.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { page } from "../validators/common.validator.js";
export const catalogRouter = Router();
catalogRouter.param("id", (req, res, next, value) => {
  z.uuid().parse(value);
  next();
});
catalogRouter.get("/categories", c.categories);
catalogRouter.get("/products", validate(page, "query"), c.products);
catalogRouter.get("/products/:id", c.product);
