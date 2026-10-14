import { transaction } from "../config/database.js";
export async function updateProfile(user, input) {
  return transaction(async (tx) => {
    const result = await tx.vendor.update({
      where: { id: user.vendor.id },
      data: input,
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "VENDOR_PROFILE_UPDATED",
        entityId: user.vendor.id,
        metadata: input,
      },
    });
    return result;
  });
}
