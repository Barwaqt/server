import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middlewares/auth.middleware.js";
import * as c from "../controllers/notification.controller.js";
export const notificationRouter = Router();
notificationRouter.param("id", (req, res, next, value) => {
  z.uuid().parse(value);
  next();
});
notificationRouter.use(authenticate);
notificationRouter.get("/", c.list);
notificationRouter.patch("/:id/read", c.markRead);
