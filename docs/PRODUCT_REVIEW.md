# Product review and publication

New products, including newly seeded catalog products, have `reviewStatus: PENDING`.
`active` expresses whether the vendor wants a listing enabled; it does not bypass approval.
Customers can browse, add to cart/wishlist and check out only APPROVED, active products from approved vendors.
Existing products are backfilled APPROVED during migration to preserve their current visibility; this does not claim a historical manual review.

## Vendor flow

POST `/api/v1/vendor/products` submits a new listing. GET `/api/v1/vendor/products?reviewStatus=PENDING|APPROVED|REJECTED` returns the owner's listings with reviewStatus, rejectionReason, reviewVersion and reviewedAt.
PATCH `/api/v1/vendor/products/:id` changes the listing. Name, slug, category, description, price, images or attribute changes send it back to PENDING and remove it from sale until approved. Stock and enable/disable changes alone preserve the review outcome. Saving a rejected listing's content resubmits it even if the submitted values are unchanged. Vendor-supplied moderation fields are rejected by strict validation.

## Admin flow

GET `/api/v1/admin/products?reviewStatus=PENDING` returns the review queue, all product details and vendor/category context.
POST `/api/v1/admin/products/:id/review` accepts one of:

```json
{"decision":"APPROVED","reviewVersion":1}
```

```json
{"decision":"REJECTED","reviewVersion":1,"reason":"Please replace the blurred images."}
```

Only administrators can decide. Rejection requires 3–2000 characters after trimming. The current reviewVersion is required; stale or already-decided submissions return 409. Decisions, audit entries and vendor notifications are committed together. Admin listing edits also invalidate prior approval when reviewed content changes. Approval does not override the vendor's disabled setting or a suspended store.

The admin Products page defaults to pending listings and includes full-size image links, description, category, price, stock, slug and attributes. Approval requires confirmation that the listing was reviewed. Rejections show the reason in the vendor's Products page and notifications.

## Deploy in order

1. Back up production PostgreSQL.
2. Deploy the backend revision and apply `20261025120000_product_moderation` before starting the new API code. The existing Actions deployment stops when migrations are pending.
3. Generate the Prisma client and restart the API.
4. Deploy the admin and vendor revisions. The customer app needs no code changes: its catalog, cart and checkout use the approval-filtered API.

For a manual initial rollout on the VPS:

```bash
cd /var/www/api.barwaqt.com
git pull origin main
npm run db:generate && npm run db:migrate && pm2 restart barwaqt-api --update-env
```

Then rerun the backend deployment if it stopped on pending migrations, and deploy the admin/vendor revisions. Do not run a database reset. Reversing application code does not reverse moderation decisions or the additive migration.
