# Static catalog seed

Run from `server`:

```sh
npm run db:generate
npm run db:migrate
npm run db:seed:catalog
```

The seed imports the checked-in `prisma/data/catalog.json` snapshot of the original `web/app/shop-data.json` products and `web/app/category-data.json` categories. It imports 218 products and 171 category entries, including collections and subcategories. UUIDs are assigned by PostgreSQL/Prisma. Product slugs are stable and namespaced with `seed-`.

Products belong to the approved **Barwaqt Catalog Store** vendor by default. Default login email: `catalog-vendor@barwaqt.example`. On first creation, a random password is generated and saved to **server/.seed-vendor.local.json**, excluded from Git (the script requests mode 0600; verify permissions on your deployment filesystem). Sign into vendor_web with that file's email/password to edit stock, prices, descriptions and images. No password is printed or committed. Existing seed-vendor credentials are never reset.

Optional environment variables:

| Variable | Default |
|---|---|
| SEED_VENDOR_EMAIL | catalog-vendor@barwaqt.example |
| SEED_VENDOR_PASSWORD | Random password; 12–72 characters if supplied |
| SEED_VENDOR_CITY | Lahore |
| SEED_VENDOR_ZONE | Gulberg |
| SEED_PRODUCT_STOCK | 50 per newly seeded product |

City/zone must match a customer's address to quote or buy these products. Seed stock is illustrative initial inventory; the vendor should set actual stock before real sales.

## Preservation rules

- Repeat runs create only missing products; never overwrite vendor price/stock/content/publishing edits, reset credentials, or delete products.
- Every newly seeded category starts with a 10% commission (1000 basis points). The category-commission migration initializes all existing categories at 10%; repeat seed runs preserve individually edited rates.
- Existing vendors retain their current commission until an administrator assigns their vendor category; no category or bank account is guessed for existing vendors.
- Existing category names are preserved. Missing category image/parent metadata is filled from the source snapshot.
- Products keep their original category collection memberships. Parent-category browsing also includes newly created vendor products assigned to descendant categories. Changing a seeded product's primary category through the vendor API clears its imported collection memberships so it does not remain in obsolete categories.
- All original product image files exist. URLs are stored in the database; the unchanged files remain in `web/public` and missing copies are mirrored into `vendor_web/public` at the same paths. Run this seed from the full repository so those source assets exist. Deploy both apps with their public directories. No new images are generated.
- Category entries with no original image use their first product's existing image when available. Empty collections can have a null image.
- The reference UI displayed AED while the implemented marketplace uses PKR. **Original numeric amounts are retained**, multiplied by 100 for integer paisa. No FX conversion is applied. Confirm intended prices with the vendor before real sales.
- The static product dataset contains names and promotional section labels, not detailed product specifications. Descriptions use the original product names. Original section labels, old prices, source IDs and reference ratings are retained as attributes for import provenance but hidden from customer specifications. Reference ratings are not fabricated customer reviews, and original coupon labels do not create active coupons.

The original admin bootstrap remains `npm run db:seed` and requires ADMIN_EMAIL/ADMIN_PASSWORD; catalog seeding is a separate command and does not create or change an admin.
