-- Initialize every existing category at 10%; future categories use the same default.
ALTER TABLE "Category" ADD COLUMN "commissionBps" INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE "Category" ADD CONSTRAINT "Category_commissionBps_range" CHECK ("commissionBps" BETWEEN 0 AND 10000);
-- Legacy vendors retain their current rate until an administrator assigns a category.
ALTER TABLE "Vendor" ADD COLUMN "categoryId" TEXT;
CREATE INDEX "Vendor_categoryId_idx" ON "Vendor"("categoryId");
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
