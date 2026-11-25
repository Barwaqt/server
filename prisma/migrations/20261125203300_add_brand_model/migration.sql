-- CreateTable
CREATE TABLE "barwaqt"."Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "image" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Brand_slug_key" ON "barwaqt"."Brand"("slug");

-- AlterTable
ALTER TABLE "barwaqt"."Product" ADD COLUMN "brandId" TEXT;

-- CreateIndex
CREATE INDEX "Product_brandId_idx" ON "barwaqt"."Product"("brandId");

-- AddForeignKey
ALTER TABLE "barwaqt"."Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "barwaqt"."Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
