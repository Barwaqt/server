import { settingsInput } from "../validators/settings.validator.js";
import { resolveDeliveryFee } from "../utils/delivery-fee.js";
import { db, transaction } from "../config/database.js";
import { env } from "../config/env.js";
export { settingsInput };
export const SETTINGS_KEY = "settings";
export async function getSettings() {
  const row = await db.storefrontPage.findUnique({
    where: { key: SETTINGS_KEY },
  });
  return {
    deliveryFeeMinor: resolveDeliveryFee(row?.content, env.DELIVERY_FEE_MINOR),
  };
}
// Reads the configured delivery fee, accepting either the shared client or a
// transaction so quote and checkout price an order the same way.
export async function deliveryFeeMinor(client) {
  const row = await client.storefrontPage.findUnique({
    where: { key: SETTINGS_KEY },
    select: { content: true },
  });
  return resolveDeliveryFee(row?.content, env.DELIVERY_FEE_MINOR);
}
export async function saveSettings(user, input) {
  return transaction(async (tx) => {
    const row = await tx.storefrontPage.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, content: input },
      update: { content: input, version: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "SETTINGS_UPDATED",
        entityId: SETTINGS_KEY,
      },
    });
    return row.content;
  });
}
