import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env.js";
export const db = new PrismaClient({
  adapter: new PrismaPg(
    {
      connectionString: env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 10000,
    },
    {
      schema: new URL(env.DATABASE_URL).searchParams.get("schema") || "public",
    },
  ),
});
// Retry only transactions that PostgreSQL aborted; never repeat committed writes.
export async function transaction(work) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: "Serializable",
        timeout: 15000,
      });
    } catch (error) {
      if (error.code !== "P2034" || attempt === 3) throw error;
    }
  }
}
