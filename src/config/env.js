import { config } from "dotenv";
import { fileURLToPath } from "node:url";
config({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});
import { z } from "zod";
const schema = z.object({
  GOOGLE_CLIENT_ID: z.string().default(""),
  APPLE_CLIENT_ID: z.string().default(""),
  APPLE_REDIRECT_URI: z.string().default(""),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default(""),
  WEB_URL: z.url().default("http://localhost:3000"),
  VENDOR_WEB_URL: z.url().default("http://localhost:3001"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:3001"),
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  DELIVERY_FEE_MINOR: z.coerce
    .number()
    .int()
    .min(0)
    .max(1000000)
    .default(15000),
});
const result = schema.safeParse(process.env);
if (!result.success) {
  const fields = [
    ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
  ];
  throw new Error(
    `Invalid server configuration: ${fields.join(", ")}. Configure server/.env using .env.example before starting the API.`,
  );
}
export const env = result.data;
