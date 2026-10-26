import { rateLimit } from "express-rate-limit";
import { getSupport } from "../services/support.service.js";
import { recordSearch } from "../services/search.service.js";
import { get as homepage } from "../controllers/homepage.controller.js";
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
catalogRouter.get("/homepage", homepage);
catalogRouter.get("/support", async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ data: await getSupport() });
});
catalogRouter.post(
  "/searches",
  rateLimit({
    windowMs: 60000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
  validate(z.object({ term: z.string().trim().min(2).max(100) }).strict()),
  async (req, res) => {
    await recordSearch(req.input.body.term);
    res.status(204).end();
  },
);
catalogRouter.get("/categories", c.categories);
catalogRouter.get("/products", validate(page, "query"), c.products);
catalogRouter.get("/products/:id", c.product);

catalogRouter.get("/vendors", validate(page, "query"), c.vendors);
catalogRouter.get("/vendors/:vendorId", c.vendor);
