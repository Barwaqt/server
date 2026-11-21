-- Optional discount percentage and compare-at (original) price for products and variants.
-- Allows storefront to display crossed-out original price alongside discounted selling price.
ALTER TABLE "Product"
ADD COLUMN "compareAtPriceMinor" INTEGER,
ADD COLUMN "discountPercent" INTEGER;

ALTER TABLE "ProductVariant"
ADD COLUMN "compareAtPriceMinor" INTEGER;

