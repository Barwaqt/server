-- Delivery options belong to each product now: the vendor chooses an express
-- promise (minutes) and a standard window (1-7 days) per listing. Existing
-- vendor-wide settings are copied onto that vendor's products before the
-- vendor columns are removed.
ALTER TABLE "Product"
ADD COLUMN "expressDelivery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "expressEtaMinutes" INTEGER,
ADD COLUMN "standardDeliveryDays" INTEGER NOT NULL DEFAULT 7;

UPDATE "Product" AS p
SET "expressDelivery" = v."expressDelivery",
    "expressEtaMinutes" = v."expressEtaMinutes",
    "standardDeliveryDays" = v."standardDeliveryDays"
FROM "Vendor" AS v
WHERE p."vendorId" = v."id";

ALTER TABLE "Vendor"
DROP COLUMN "expressDelivery",
DROP COLUMN "expressEtaMinutes",
DROP COLUMN "standardDeliveryDays";
