-- WSPAN: orders from customers who cancelled >= 2 shipments go to a separate section.
ALTER TABLE "Order"
ADD COLUMN "isWspan" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "cancelledShipments" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Order_isWspan_createdAt_idx" ON "Order"("isWspan", "createdAt" DESC);

-- Backfill: flag existing orders whose customer already has >=2 cancelled shipments before them.
UPDATE "Order" o
SET "isWspan" = true,
    "cancelledShipments" = c.cnt
FROM (
  SELECT "customerId", COUNT(*)::int AS cnt
  FROM "VendorOrder" vo
  JOIN "Order" o2 ON o2.id = vo."orderId"
  WHERE vo.status = 'CANCELLED'
  GROUP BY "customerId"
  HAVING COUNT(*) >= 2
) c
WHERE o."customerId" = c."customerId"
  AND o."createdAt" > (
    SELECT MIN(o3."createdAt") FROM "Order" o3 WHERE o3."customerId" = c."customerId"
  );
