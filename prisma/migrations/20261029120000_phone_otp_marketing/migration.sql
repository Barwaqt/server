ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);
CREATE TABLE "PhoneOtp" (
 "phone" TEXT PRIMARY KEY, "id" TEXT NOT NULL UNIQUE, "purpose" TEXT NOT NULL, "portal" TEXT NOT NULL,
 "userId" TEXT, "pending" JSONB, "codeHash" TEXT NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0,
 "sends" INTEGER NOT NULL DEFAULT 1, "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING'
);
CREATE TABLE "MarketingCampaign" (
 "id" TEXT PRIMARY KEY, "actorId" TEXT NOT NULL, "requestKey" TEXT NOT NULL, "requestHash" TEXT NOT NULL,
 "name" TEXT NOT NULL, "channels" TEXT[] NOT NULL, "content" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "MarketingCampaign_actorId_requestKey_key" ON "MarketingCampaign"("actorId","requestKey");
CREATE TABLE "MarketingMessage" (
 "id" TEXT PRIMARY KEY, "campaignId" TEXT NOT NULL REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "phone" TEXT NOT NULL, "channel" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'QUEUED',
 "providerId" TEXT, "error" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "MarketingMessage_campaignId_phone_channel_key" ON "MarketingMessage"("campaignId","phone","channel");
CREATE INDEX "MarketingMessage_status_createdAt_idx" ON "MarketingMessage"("status","createdAt");
