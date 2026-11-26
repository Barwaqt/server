import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import * as c from "../controllers/notification.controller.js";
export const notificationRouter = Router();
notificationRouter.param("id", (req, res, next, value) => {
  z.uuid().parse(value);
  next();
});
const deviceToken = z
  .object({
    token: z.string().trim().min(20).max(4096),
    platform: z.enum(["WEB", "ANDROID", "IOS"]).default("WEB"),
  })
  .strict();
notificationRouter.use(authenticate);
notificationRouter.get("/", c.list);
notificationRouter.get("/badges", c.badges);
notificationRouter.patch("/:id/read", c.markRead);
notificationRouter.post("/devices", validate(deviceToken), c.registerDevice);
notificationRouter.delete(
  "/devices",
  validate(z.object({ token: z.string().trim().min(20).max(4096) }).strict()),
  c.unregisterDevice,
);
