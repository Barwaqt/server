import { db } from "../src/config/database.js";

// Vendors and staff are provisioned by an administrator, so they never use the
// customer email-verification flow. Accounts created before provisioning marked
// them verified (for example the initial admin or catalog vendor seed) can still
// be locked out at sign-in; this script repairs those rows.
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const emails = args
  .filter((value) => !value.startsWith("--"))
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

try {
  const where = {
    role: { not: "CUSTOMER" },
    emailVerifiedAt: null,
    ...(emails.length ? { email: { in: emails } } : {}),
  };
  const pending = await db.user.findMany({
    where,
    select: { email: true, role: true },
    orderBy: { email: "asc" },
  });
  if (!pending.length) {
    console.log("No unverified vendor, admin or staff accounts found.");
  } else {
    for (const user of pending)
      console.log(
        `${dryRun ? "Would verify" : "Verified"} ${user.role} ${user.email}`,
      );
    if (dryRun) {
      console.log(`${pending.length} account(s) need verification (dry run).`);
    } else {
      const result = await db.user.updateMany({
        where,
        data: { emailVerifiedAt: new Date() },
      });
      console.log(
        `${result.count} account(s) verified. Sign in is now enabled.`,
      );
    }
  }
} finally {
  await db.$disconnect();
}
