CREATE TYPE "ProductReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
-- Preserve the visibility of existing listings; all new listings require review.
ALTER TABLE "Product" ADD COLUMN "reviewStatus" "ProductReviewStatus" NOT NULL DEFAULT 'APPROVED',
 ADD COLUMN "rejectionReason" TEXT,
 ADD COLUMN "reviewedAt" TIMESTAMP(3),
 ADD COLUMN "reviewedById" TEXT,
 ADD COLUMN "reviewVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Product" ALTER COLUMN "reviewStatus" SET DEFAULT 'PENDING';
ALTER TABLE "Product" ADD CONSTRAINT "Product_rejection_reason_check" CHECK (
 ("reviewStatus" = 'REJECTED' AND length(btrim("rejectionReason")) >= 3 AND "rejectionReason" IS NOT NULL)
 OR ("reviewStatus" <> 'REJECTED' AND "rejectionReason" IS NULL)
);
CREATE INDEX "Product_reviewStatus_createdAt_idx" ON "Product"("reviewStatus", "createdAt");
