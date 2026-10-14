# Marketplace implementation audit

> Historical audit before frontend integration. Customer and vendor commerce integration has since been implemented; see [current frontend integration guide](FRONTEND.md). The unsupported backend capabilities below remain limitations, but the “UI remains preview” entries describe the earlier state.

Reviewed 2026-10-13 against the current `web`, `vendor_web`, `server`, and supplied Barwaqt Workflow PDF. **The platform is not fully dynamic or production-complete.** Having routes does not mean that the screens use them.

## Customer UI versus backend

| Screen / feature | UI evidence | Backend status | Remaining work |
|---|---|---|---|
| Home/search/category lists | `web/app/page.tsx`, `category-listing.tsx`, `category-navigation.tsx` import bundled catalog/category JSON | Live approved-vendor products, categories, search, city/zone filtering; price/stock filters and sorting added in this audit | Replace product/category sources and static category mapping with API queries, including loading/error/empty states |
| Product details | `web/app/product/[id]/page.tsx` finds bundled product IDs | Live product UUID endpoint with vendor/category/reviews | Use backend UUIDs and API records; remove synthetic offers, ratings and availability claims |
| Cart | `shop-store.ts` persists JSON IDs to localStorage | Server cart, quantity and stock validation | Connect signed-in cart; explicitly design guest cart merge and unavailable-product handling |
| Wishlist | `shop-store.ts`, `wishlist.tsx` use local JSON/storage | Per-customer persistent wishlist routes | Replace local list with authenticated API and handle login/logout without account leakage |
| Addresses | `account-panels.tsx`, `delivery-flow.tsx` use local addresses/UAE fields | Persistent address CRUD; city/zone availability validation | Map fields to API; use real address UUID and consistent country/phone/currency settings |
| Checkout summary/coupon | `checkout.tsx` hardcodes fee and WELCOME10 | Added POST /orders/quote using the SAME preflight/calculation as checkout | Request quote after cart/address/coupon changes; never trust displayed local totals |
| Place order | `delivery-flow.tsx` creates preview orders | Atomic COD checkout, idempotency, vendor split, stock reservation | Submit real checkout and retain one idempotency key across retries; display returned parent and child IDs |
| Orders/tracking | `account-panels.tsx` uses seedOrders and simulated cancellation | Role-scoped orders, events, rider coordinates, action permissions | Load persisted orders and show child-specific states/cancellation; polling needed (no streaming) |
| Reviews | Product sections show reference content | Verified-delivered-purchase review upsert; latest 50 reviews on detail | Submit authenticated reviews and render backend reviews; no fabricated review counts |
| Notifications | Profile displays preview empty text | Private persisted notifications with read endpoint | Render API results; PIN notifications belong to customer only |
| Profile/auth | Auth and profile are connected | Password/social/reset flows and profile update | SMTP/Google/Apple deployment configuration still required; no SMS verification |
| Currency/payment | Customer UI displays AED, UAE and demo methods | PKR integer paisa; COD only | Align UI with PKR workflow or explicitly implement configurable markets; disable unsupported methods |
| Credits/gift cards/saved cards | Preview panels | Not implemented | Requires balance/ledger/redemption or payment-provider tokenization workflows, not placeholder CRUD |
| Post-delivery returns | Preview panel | Only dispatcher return of FAILED deliveries and finance-recorded refunds | Customer return-request/review/receipt workflow is not implemented |
| Promotions/hero/editorial sections | Static supplied images/copy | No content-management API | Static imagery can remain; price/discount/availability claims must be live or removed |

## Vendor UI versus backend

| Feature | Current status |
|---|---|
| Vendor onboarding | ADMIN creates vendor owner + approved business; no public self-registration API |
| Auth | Connected, including role guard; provider configuration required for social login |
| Product management | APIs create/update owned products; dashboard still adds sample products to React state. Connect full form (categoryId, slug, priceMinor, stock, image URLs) and handle backend errors |
| Catalog search | Backend now applies name search and categoryId for owned products; list remains paginated array for compatibility |
| Business settings | Added PATCH /vendor/profile for name, description, address with audit record; commission/status/owner/service city/zone remain admin-controlled. UI remains preview |
| Orders | API enforces own vendor acceptance/rejection/readiness; UI still changes sample status locally |
| Metrics/settlements | API dashboard and settlements exist; dashboard/finance UI still displays hardcoded numbers |
| Notifications | Shared private API exists; vendor screen still uses preview text |
| Images | Product API stores HTTPS/local image URLs. No upload/storage service; do not send binary files to product endpoint |

## Changes in this audit

- Added public GET /catalog/vendors and GET /catalog/vendors/:id. Only APPROVED vendors; public fields exclude owner, bank and commission data.
- Added CUSTOMER POST /orders/quote. Shares cart/address/availability/coupon/money allocation code with checkout. Quote does not reserve stock, consume coupons, clear the cart, or create orders. Checkout revalidates all state transactionally.
- Added product minPriceMinor/maxPriceMinor/inStock/sort filters, rejected inverted price ranges, and retained existing response envelope.
- Applied customer order status filter to parent orders with any matching vendor child; full child arrays remain in response.
- Added audited, strictly validated vendor business profile updates without allowing approval/commission changes.
- Updated complete_api.md for the expanded contract.

## Workflow PDF coverage

The direct-vendor fulfillment flow has backend support for admin registration, multi-vendor split, vendor decisions, dispatch assignment, rider shifts/pickup/location/PIN delivery, COD reconciliation, settlement transitions and audit/reporting. Automated online payment and bank transfer execution are not implemented; finance routes record external actions. The PDF's warehouse fulfillment option is not implemented: no warehouse stock-receipt, storage-location, pick-list or warehouse-return model. Do not represent vendor stock fields as a warehouse management system.

## Verification and limits

Backend syntax/unit checks and isolated PostgreSQL integration tests cover the supported transaction lifecycle. Added assertions cover quote/check-out parity, quote side-effect prevention, vendor public-field privacy, role restrictions, price filtering and vendor-setting privilege restrictions. Tests use a dedicated temporary database, not business data. No database migration was needed for these additions.

This audit does not certify the UI as integrated. No customer catalog/cart/checkout or vendor dashboard connection was changed in this backend audit. Live provider credentials, payment integrations, warehouse fulfillment, returns and the frontend work above remain necessary before claiming the whole product is complete.
