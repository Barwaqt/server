-- Add image and structured options to ProductVariant
ALTER TABLE "ProductVariant"
ADD COLUMN "image" TEXT,
ADD COLUMN "options" JSONB DEFAULT '{}';

