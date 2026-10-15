-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliverySlotId" TEXT,
ADD COLUMN     "deliveryWindow" JSONB;

-- CreateTable
CREATE TABLE "DeliverySlot" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliverySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnRequest" (
    "id" TEXT NOT NULL,
    "vendorOrderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT NOT NULL DEFAULT '',
    "restocked" BOOLEAN NOT NULL DEFAULT false,
    "refundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorAdjustment" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "settlementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliverySlot_city_zone_startsAt_idx" ON "DeliverySlot"("city", "zone", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnRequest_vendorOrderId_key" ON "ReturnRequest"("vendorOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnRequest_refundId_key" ON "ReturnRequest"("refundId");

-- CreateIndex
CREATE INDEX "ReturnRequest_customerId_createdAt_idx" ON "ReturnRequest"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VendorAdjustment_refundId_key" ON "VendorAdjustment"("refundId");

-- CreateIndex
CREATE INDEX "VendorAdjustment_vendorId_settlementId_idx" ON "VendorAdjustment"("vendorId", "settlementId");

-- CreateIndex
CREATE INDEX "Upload_ownerId_createdAt_idx" ON "Upload"("ownerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliverySlotId_fkey" FOREIGN KEY ("deliverySlotId") REFERENCES "DeliverySlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_vendorOrderId_fkey" FOREIGN KEY ("vendorOrderId") REFERENCES "VendorOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAdjustment" ADD CONSTRAINT "VendorAdjustment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAdjustment" ADD CONSTRAINT "VendorAdjustment_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
