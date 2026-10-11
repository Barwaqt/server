# Connecting the two frontends

API base URL: `http://localhost:4000/api/v1`. Allowed origins default to localhost ports 3000, 3001 and 3002. Set deployment origins in CORS_ORIGINS. No client API key is required. Authenticated requests send `Authorization: Bearer <accessToken>`.

| Existing frontend feature | API |
|---|---|
| Customer signup/login | POST /auth/register, /auth/login |
| Account/profile | GET /auth/me, PATCH /customer/profile |
| Home/category/product data | GET /catalog/categories, /catalog/products, /catalog/products/:id |
| Cart quantities | GET /customer/cart, PUT /customer/cart/:productId |
| Wishlist | GET /customer/wishlist, PUT/DELETE /customer/wishlist/:productId |
| Addresses | GET/POST /customer/addresses, PUT/DELETE /customer/addresses/:id |
| Checkout | POST /orders/checkout + Idempotency-Key |
| Customer order history/tracking | GET /orders, GET /orders/:parentOrderId |
| Delivery PIN | GET /notifications (customer session only) |
| Product reviews | PUT /customer/reviews/:productId |
| Vendor login | POST /auth/login with admin-created credentials |
| Vendor dashboard | GET /vendor/dashboard |
| Vendor product management | GET/POST /vendor/products, PATCH /vendor/products/:id |
| Vendor orders | GET /orders (vendor session); only that vendor's child orders |
| Accept/prepare | POST /orders/:vendorOrderId/actions |
| Settlements | GET /vendor/settlements |
| Administrator onboarding | POST /admin/vendors (admin session only) |

## Field mapping

- UI `first`/`last` → `firstName`/`lastName`.
- Address `area` → `zone`; add `street`. `point.lat/lng` → `latitude/longitude`.
- UI `price` is a major-unit value; server `priceMinor` is an integer. Display `priceMinor / 100` with currency `PKR`.
- Frontend `/shop/*.webp` assets may be stored as relative image paths. Production images should use HTTPS URLs from the selected object storage service.
- Replace existing static IDs with API UUIDs. Do not submit old IDs such as `nescafe-gold-190g` as product IDs.
- Dashboard order statuses map NEW → New, PREPARING → Preparing, READY → Ready for Pickup, ASSIGNED/PICKED_UP → In progress, DELIVERED → Completed, CANCELLED/RETURNED → Cancelled/returned.
- Public customer signup cannot create a vendor, administrator, or rider. The vendor registration screen can become an application intake UI later; currently administrators create approved vendor accounts through the API.
- Quote totals come from server checkout; the frontend must not mark payment/order success until a successful API response. Use the same idempotency key only for retries of the same checkout attempt.
- Parent order totals are the original quote. Show each child status when one vendor rejects, rather than treating a partial cancellation as a cancellation of the whole basket.
