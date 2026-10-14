ALTER TABLE "Category" ADD COLUMN "image" TEXT, ADD COLUMN "parentSlug" TEXT;
CREATE TABLE "_CatalogCategories" (
 "A" TEXT NOT NULL,
 "B" TEXT NOT NULL,
 CONSTRAINT "_CatalogCategories_AB_pkey" PRIMARY KEY ("A", "B")
);
CREATE INDEX "_CatalogCategories_B_index" ON "_CatalogCategories"("B");
ALTER TABLE "_CatalogCategories" ADD CONSTRAINT "_CatalogCategories_A_fkey" FOREIGN KEY ("A") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_CatalogCategories" ADD CONSTRAINT "_CatalogCategories_B_fkey" FOREIGN KEY ("B") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
