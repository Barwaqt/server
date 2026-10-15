ALTER TABLE "DeliverySlot" ADD CONSTRAINT "DeliverySlot_capacity_check" CHECK ("capacity" > 0 AND "reserved" >= 0 AND "reserved" <= "capacity");
ALTER TABLE "DeliverySlot" ADD CONSTRAINT "DeliverySlot_window_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_status_check" CHECK ("status" IN ('REQUESTED','APPROVED','REJECTED','RECEIVED','REFUNDED'));
ALTER TABLE "VendorAdjustment" ADD CONSTRAINT "VendorAdjustment_amount_check" CHECK ("amountMinor" <= 0);
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_kind_check" CHECK ("kind" IN ('IMAGE','DOCUMENT'));
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_size_check" CHECK ("size" > 0 AND "size" <= 5242880);
