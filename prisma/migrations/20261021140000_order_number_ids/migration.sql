-- Order and shipment IDs become customer-facing numbers: barwaqt- followed by six digits.
-- Prisma no longer generates them; the API allocates them in `src/utils/order-number.js`.
-- Existing rows are rewritten here, and every foreign key cascades on update.

CREATE TABLE "_order_id_map" (
  "oldId" TEXT PRIMARY KEY,
  "newId" TEXT NOT NULL
);

DO $$
DECLARE
  existing RECORD;
  candidate TEXT;
BEGIN
  FOR existing IN SELECT "id" FROM "Order" LOOP
    LOOP
      candidate := 'barwaqt-' || lpad((floor(random() * 1000000))::int::text, 6, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "Order" WHERE "id" = candidate)
        AND NOT EXISTS (SELECT 1 FROM "VendorOrder" WHERE "id" = candidate)
        AND NOT EXISTS (SELECT 1 FROM "_order_id_map" WHERE "newId" = candidate);
    END LOOP;
    INSERT INTO "_order_id_map" ("oldId", "newId") VALUES (existing."id", candidate);
    UPDATE "Order" SET "id" = candidate WHERE "id" = existing."id";
  END LOOP;

  FOR existing IN SELECT "id" FROM "VendorOrder" LOOP
    LOOP
      candidate := 'barwaqt-' || lpad((floor(random() * 1000000))::int::text, 6, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "Order" WHERE "id" = candidate)
        AND NOT EXISTS (SELECT 1 FROM "VendorOrder" WHERE "id" = candidate)
        AND NOT EXISTS (SELECT 1 FROM "_order_id_map" WHERE "newId" = candidate);
    END LOOP;
    INSERT INTO "_order_id_map" ("oldId", "newId") VALUES (existing."id", candidate);
    UPDATE "VendorOrder" SET "id" = candidate WHERE "id" = existing."id";
  END LOOP;
END $$;

-- Historical text references (notifications, audit log) keep pointing at the same orders.
UPDATE "AuditLog" AS audit
SET "entityId" = map."newId"
FROM "_order_id_map" AS map
WHERE audit."entityId" = map."oldId";

UPDATE "Notification" AS notification
SET "body" = replace(notification."body", map."oldId", map."newId")
FROM "_order_id_map" AS map
WHERE notification."body" LIKE '%' || map."oldId" || '%';

DROP TABLE "_order_id_map";
