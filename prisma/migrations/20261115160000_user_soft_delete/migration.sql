-- Track deleted customer accounts so they are hidden while their order
-- history stays intact for vendors, finance and audit.
ALTER TABLE "User"
ADD COLUMN "deletedAt" TIMESTAMP(3);
