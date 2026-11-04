-- Vendors can serve several categories; the first entry is the primary category.
ALTER TABLE "Vendor"
ADD COLUMN "categoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "categoryCommissions" JSONB NOT NULL DEFAULT '{}';

-- Backfill the new list from the existing single category.
UPDATE "Vendor"
SET "categoryIds" = ARRAY["categoryId"]
WHERE "categoryId" IS NOT NULL;
