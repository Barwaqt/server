import { Router } from "express";
import { z } from "zod";
import { authenticate, roles } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import * as v from "../validators/payment.validator.js";
import * as c from "../controllers/payment.controller.js";
export const paymentRouter = Router();
paymentRouter.param("id", (req, res, next, id) => {
  z.uuid().parse(id);
  next();
});
paymentRouter.use(authenticate);
paymentRouter.get(
  "/accounts",
  roles("CUSTOMER", "ADMIN", "FINANCE"),
  c.accounts,
);
paymentRouter.put(
  "/accounts",
  roles("ADMIN"),
  validate(v.account),
  c.saveAccount,
);
paymentRouter.get(
  "/",
  roles("CUSTOMER", "ADMIN", "FINANCE"),
  validate(v.paymentQuery, "query"),
  c.list,
);
paymentRouter.post(
  "/orders/:id/submissions",
  roles("CUSTOMER"),
  validate(v.submission),
  c.submit,
);
paymentRouter.post(
  "/submissions/:id/review",
  roles("ADMIN", "FINANCE"),
  validate(v.review),
  c.review,
);
