import { z } from "zod";
import { db, transaction } from "../config/database.js";
const phone = z.union([
  z.literal(""),
  z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,30}$/),
]);
export const supportInput = z
  .object({
    phone,
    phone2: phone,
    whatsapp: phone,
    email: z.union([z.literal(""), z.email()]),
  })
  .strict();
export async function getSupport() {
  const row = await db.storefrontPage.findUnique({ where: { key: "support" } });
  return row?.content || { phone: "", phone2: "", whatsapp: "", email: "" };
}
export async function saveSupport(user, input) {
  return transaction(async (tx) => {
    const row = await tx.storefrontPage.upsert({
      where: { key: "support" },
      create: { key: "support", content: input },
      update: { content: input, version: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "SUPPORT_UPDATED",
        entityId: "support",
      },
    });
    return row.content;
  });
}
