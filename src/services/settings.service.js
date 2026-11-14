import { settingsInput } from "../validators/settings.validator.js";
import { resolveDeliveryFees } from "../utils/delivery-fee.js";
import { db, transaction } from "../config/database.js";
import { env } from "../config/env.js";
export { settingsInput };
export const SETTINGS_KEY = "settings";
export async function getSettings() {
  const row = await db.storefrontPage.findUnique({
    where: { key: SETTINGS_KEY },
  });
  const fees = resolveDeliveryFees(row?.content, env.DELIVERY_FEE_MINOR);
  return {
    deliveryFeeMinor: fees.STANDARD,
    expressDeliveryFeeMinor: fees.EXPRESS,
  };
}
// Reads the configured fees, accepting either the shared client or a
// transaction so quote and checkout price an order the same way.
export async function deliveryFeesMinor(client) {
  const row = await client.storefrontPage.findUnique({
    where: { key: SETTINGS_KEY },
    select: { content: true },
  });
  return resolveDeliveryFees(row?.content, env.DELIVERY_FEE_MINOR);
}
export async function saveSettings(user, input) {
  return transaction(async (tx) => {
    const existing = await tx.storefrontPage.findUnique({
      where: { key: SETTINGS_KEY },
      select: { content: true },
    });
    // Express is optional so older clients that only send the standard fee do
    // not wipe a previously saved express price.
    const content = { ...existing?.content, ...input };
    await tx.storefrontPage.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, content },
      update: { content, version: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "SETTINGS_UPDATED",
        entityId: SETTINGS_KEY,
      },
    });
    const fees = resolveDeliveryFees(content, env.DELIVERY_FEE_MINOR);
    return {
      deliveryFeeMinor: fees.STANDARD,
      expressDeliveryFeeMinor: fees.EXPRESS,
    };
  });
}
