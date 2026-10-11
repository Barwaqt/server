import express from "express";
import helmet from "helmet";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";
import { env } from "./config/env.js";
import { db } from "./config/database.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { ApiError } from "./utils/error.js";
import { authRouter } from "./routes/auth.routes.js";
import { catalogRouter } from "./routes/catalog.routes.js";
import { customerRouter } from "./routes/customer.routes.js";
import { orderRouter } from "./routes/order.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { vendorRouter } from "./routes/vendor.routes.js";
import { riderRouter } from "./routes/rider.routes.js";
import { financeRouter } from "./routes/finance.routes.js";
import { notificationRouter } from "./routes/notification.routes.js";
export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(
  pinoHttp({
    genReqId: () => randomUUID(),
    autoLogging: env.NODE_ENV !== "test",
    redact: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
    ],
    level: env.NODE_ENV === "test" ? "silent" : "info",
  }),
);
const origins = env.CORS_ORIGINS.split(",").map((s) => s.trim());
app.use(
  cors({
    origin(origin, cb) {
      cb(null, !origin || origins.includes(origin));
    },
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);
app.use(express.json({ limit: "256kb" }));
app.use(
  rateLimit({
    windowMs: 60000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
app.get(["/", "/api/v1"], (req, res) =>
  res.json({
    name: "Barwaqt API",
    version: "1.0.0",
    message: "API is running. Use the endpoints below to access the backend.",
    endpoints: {
      health: "/health",
      readiness: "/ready",
      categories: "/api/v1/catalog/categories",
      products: "/api/v1/catalog/products",
      login: "POST /api/v1/auth/login",
    },
  }),
);
app.get("/favicon.ico", (req, res) => res.status(204).end());
app.get("/health", (req, res) => res.json({ status: true, message: "Barwaqt API is Running" }));
app.get("/ready", async (req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ status: "ready" });
});
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/catalog", catalogRouter);
app.use("/api/v1/customer", customerRouter);
app.use("/api/v1/orders", orderRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/vendor", vendorRouter);
app.use("/api/v1/rider", riderRouter);
app.use("/api/v1/finance", financeRouter);
app.use("/api/v1/notifications", notificationRouter);
app.use((req, res, next) => next(new ApiError(404, "Route not found")));
app.use(errorHandler);
