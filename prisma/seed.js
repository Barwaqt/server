import bcrypt from "bcryptjs";
import { db } from "../src/config/database.js";
try {
  const email = process.env.ADMIN_EMAIL,
    password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12)
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) to seed the admin.",
    );
  await db.user.upsert({
    where: { email: email.toLowerCase() },
    create: {
      email: email.toLowerCase(),
      passwordHash: await bcrypt.hash(password, 12),
      role: "ADMIN",
      firstName: "Barwaqt",
      lastName: "Admin",
      // The administrator is provisioned out of band, not through customer signup.
      emailVerifiedAt: new Date(),
    },
    update: { emailVerifiedAt: new Date() },
  });
  for (const [name, slug] of [
    ["Electronics", "electronics"],
    ["Home & Kitchen", "home-kitchen"],
    ["Beauty & Fragrance", "beauty"],
    ["Grocery", "grocery"],
    ["Fashion", "fashion"],
  ])
    await db.category.upsert({
      where: { slug },
      create: { name, slug, commissionBps: 1000 },
      update: {},
    });
  console.log(
    "Admin and categories seeded. Existing credentials were not changed.",
  );
} finally {
  await db.$disconnect();
}
