import { Router } from "express";
import { z } from "zod";
import * as c from "../controllers/rider.controller.js";
import { authenticate, roles } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
export const riderRouter = Router();
riderRouter.use(authenticate);
riderRouter.get("/shifts", roles("RIDER", "ADMIN", "DISPATCHER"), c.shifts);
riderRouter.post(
  "/shifts",
  roles("RIDER"),
  validate(
    z.object({ action: z.enum(["start", "break", "resume", "end"]) }).strict(),
  ),
  c.shift,
);
