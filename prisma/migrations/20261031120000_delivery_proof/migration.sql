ALTER TABLE "VendorOrder" DROP COLUMN "pinHash", DROP COLUMN "pinAttempts";
ALTER TABLE "VendorOrder" ADD COLUMN "proofImage" TEXT;
