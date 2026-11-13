-- Vendors advertise an express option (with an ETA in minutes) and a standard
-- option (within 1-7 days). Customers pick one at checkout and the choice is
-- snapshotted on the order and each vendor shipment.
ALTER TABLE "Vendor"
ADD COLUMN "expressDelivery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "expressEtaMinutes" INTEGER,
ADD COLUMN "standardDeliveryDays" INTEGER NOT NULL DEFAULT 7;

ALTER TABLE "Order"
ADD COLUMN "deliveryOption" TEXT NOT NULL DEFAULT 'STANDARD',
ADD COLUMN "deliveryEtaMinutes" INTEGER;

ALTER TABLE "VendorOrder"
ADD COLUMN "deliveryOption" TEXT NOT NULL DEFAULT 'STANDARD',
ADD COLUMN "deliveryEtaMinutes" INTEGER;
