import bcrypt from "bcryptjs";
import { db } from "../src/config/database.js";

// Explicit operator command only; never run automatically during deployment.
const email = "catalog-vendor@barwaqt.example";
try {
  if (process.stdin.isTTY)
    throw Error("Supply the password through standard input.");
  let password = "";
  for await (const chunk of process.stdin) {
    password += chunk.toString();
    if (Buffer.byteLength(password) > 1024)
      throw Error("Password input too long");
  }
  password = password.replace(/\r?\n$/, "");
  if (password.length < 12 || Buffer.byteLength(password) > 72)
    throw Error(
      "Password must be at least 12 characters and at most 72 UTF-8 bytes",
    );
  const passwordHash = await bcrypt.hash(password, 12);
  await db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { email },
      include: { vendor: true },
    });
    if (user && (user.role !== "VENDOR" || !user.vendor))
      throw Error("Account is not a vendor with a store; no changes made");
    if (user) {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          active: true,
          emailVerifiedAt: user.emailVerifiedAt || new Date(),
        },
      });
      await tx.vendor.update({
        where: { id: user.vendor.id },
        data: { status: "APPROVED" },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
    } else {
      await tx.user.create({
        data: {
          email,
          passwordHash,
          role: "VENDOR",
          active: true,
          firstName: "Catalog",
          lastName: "Vendor",
          emailVerifiedAt: new Date(),
          vendor: {
            create: {
              name: "Barwaqt Catalog Store",
              slug: "barwaqt-catalog-store",
              description: "Imported Barwaqt reference catalog",
              businessType: "Marketplace",
              city: process.env.SEED_VENDOR_CITY || "Lahore",
              zone: process.env.SEED_VENDOR_ZONE || "Gulberg",
              address: "Seed catalog store",
              commissionBps: 1000,
              status: "APPROVED",
            },
          },
        },
      });
    }
  });
  console.log(
    `Vendor login configured for ${email}. Products preserved; previous sessions revoked.`,
  );
} catch (error) {
  // Do not print database query arguments or password material.
  console.error(
    error.code
      ? `Account repair failed (${error.code}); no changes committed.`
      : error.message,
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
