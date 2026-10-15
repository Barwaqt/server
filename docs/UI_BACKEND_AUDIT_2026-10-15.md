# UI-to-backend audit — 2026-10-15

## Implementation follow-up

The findings below preserve the original audit baseline. The requested operations work now adds admin finance screens, category/coupon management, persistent uploads, scheduled delivery, and customer/vendor/admin return tracking. Central bank/JazzCash/Easypaisa transfers use platform-owned accounts and admin verification; COD is remitted to the platform. Vendor settlement is separate, and post-settlement refunds become future payout adjustments. Automated merchant gateways, card processing and the other unselected baseline gaps remain outside this implementation. See [operations setup](OPERATIONS_SETUP.md) and [API reference](../complete_api.md).

## Original audit verdict and scope

The core direct-vendor, cash-on-delivery marketplace is implemented. The server is **not complete for every feature shown or implied by the customer, vendor, and administrator interfaces**. Some gaps require backend work, others require connecting existing endpoints, and some are concrete integration defects.

Reviewed current source in `admin`, `vendor_web`, `web`, and `server`: page/component actions, Next API proxies, Express routes, validators, services, and Prisma schema. This is a source/contract audit, not a fresh production certification or full browser regression run. Admin authentication validation was reproduced directly with the current Zod schemas. No UI layout or application logic was changed during this audit.

## Implemented core

| Area | Implemented capabilities | Evidence |
|---|---|---|
| Admin | Vendor creation/approval/suspension/commission, platform product list and publish status, staff creation/list/status, reports, audit log, notifications, rider assignment | `admin/app/dashboard/panels.tsx`; `server/src/routes/admin.routes.js`; `server/src/services/admin.service.js`; `server/src/routes/order.routes.js` |
| Vendor | Own products with stock, prices, descriptions and image URLs; order acceptance/rejection/readiness; business profile; dashboard; settlement history; notifications | `vendor_web/app/dashboard/page.tsx`, `panels.tsx`; `server/src/routes/vendor.routes.js` |
| Customer | Vendor catalog, categories, product details, authenticated cart/wishlist, persistent addresses/profile, quotes/coupons, selected-item COD checkout, order history/cancellation/tracking, delivered-purchase reviews, notifications | `web/app/components/catalog-context.tsx`, `shop-store.tsx`, `delivery-flow.tsx`, `account-panels.tsx`; customer/catalog/order routes |
| Order engine | Vendor split, transactional stock reservation, idempotency, permitted status transitions, rider assignment/PIN delivery, recorded COD remittances/refunds/settlements | `server/src/services/order.service.js`, `finance.service.js`, `rider.service.js` |
| Authentication | Password login, refresh/logout, password change; customer/vendor reset and social identity implementations | auth routes/validators/services and role guards |

## Confirmed defects and integration gaps

### P1 — Admin reset and social login fail the API contract

- The visible admin login screen offers forgot-password and Google/Apple authentication (`admin/app/page.tsx`).
- `admin/app/api/auth/[action]/route.ts` adds `portal: "admin"` for reset, social login and provider linking.
- `server/src/validators/auth.validator.js` accepts only `customer` and `vendor`. Direct `safeParse` reproduces rejection for both admin reset and social requests.
- `identity.service.js` also maps portals to CUSTOMER/VENDOR only, and selects only customer/vendor reset URLs. There is no `admin/app/reset-password/page.tsx`.
- Fix requires explicit administrator identity handling and a reset destination, preserving the rule that social login must never provision a new administrator. Merely extending the enum is insufficient.

### P1 — No admin finance operations UI

The backend supports `/finance/remittances`, settlement creation/transitions, and recorded refunds. The admin UI displays balances but has no forms for these operations. Consequently the UI alone cannot reconcile rider cash or complete the vendor payout workflow. Actual bank transfers/payment refunds are not executed by these endpoints; they record externally performed actions.

### P1 — Processed settlements disappear from the pending-payable total

`vendorSummary` in `server/src/services/finance.service.js` counts delivered orders with no settlement or a PENDING settlement. Settlement transitions include PENDING → PROCESSED → PAID. PROCESSED but unpaid settlements are excluded from the displayed pending balance. Include all unpaid states or expose clearly separated balance buckets.

### P2 — Category and coupon management is incomplete

- Admin category creation accepts only `name` and `slug`; it cannot manage the category images, hierarchy, or curated collection memberships used by the storefront.
- No category update/delete endpoints or category-management admin screen.
- Coupons can be created and consumed, but there is no admin coupon-management screen or list/update/deactivate lifecycle.
- Seed scripts populate the original catalog; they are not a replacement for ongoing admin management.

### P2 — Catalog ratings and discounts do not match list UI capabilities

- Product list responses omit reviews/rating aggregates; `catalog-context.tsx` calculates ratings only from `p.reviews`, defaulting to zero. Product details have reviews, so list ratings and rating filters can disagree with detail pages.
- The adapter sets `old` equal to current price. Product schema has one price, with no compare-at/sale price or promotion period. The wishlist/category sale filters therefore have no genuine product-discount data. Checkout coupon discounts are supported separately.
- Product attributes are supported, but there is no generic variant/SKU inventory model. Existing coffee size links are product-specific presentation logic.

### P2 — Lists and analytics are truncated or filtered only locally

- Admin analytics counts vendors from `/admin/vendors?limit=100` rather than an aggregate total. The platform-product vendor selector uses the same first 100 vendors.
- Rider directory requests only 100 staff with no pagination controls; dispatch only fetches 20 READY orders. Shift statistics are computed from the latest 100 shift records, so sufficiently large installations can undercount active riders.
- Vendor order search/status filters operate on the currently fetched page of 20 orders, rather than passing filters to the API. Matching orders on other pages may be missed.
- Customer catalog provider downloads every product page before rendering the catalog and normally refreshes only on provider mount/manual reload. This is inefficient for a large marketplace and can show stale data in an open session.

### P2 — Vendor service-area management lacks an update path

The vendor business screen says administrators manage service city/zone. Vendor profile update allows only name/description/address; admin vendor update allows only status/commission. City and zone can be set at creation but not maintained through an existing update endpoint. Checkout requires both to match the delivery address.

### P2 — Optional rider phone field is submitted as an invalid empty string

Admin rider creation does not require the phone input but always includes `phone: ""` when empty. Backend accepts an omitted optional phone or a valid phone, not an empty string. Omit empty optional fields or make the UI field required.

## Missing backend capabilities represented or implied by UI

| Capability | Current boundary |
|---|---|
| Card, JazzCash, Easypaisa, saved cards | COD only. Checkout explicitly rejects non-COD with 503; UI alternatives are disabled. Provider payment intents, webhooks, reconciliation and tokenized saved methods are absent. |
| Scheduled delivery and pickup lockers | UI choices are unavailable; no delivery-slot capacity, reservation, pickup-location or locker model/routes. |
| Image/document upload | Product APIs store URLs; no file upload/storage service or vendor-document workflow. |
| Homepage CMS | Hero copy/images, department presentation, featured groups and promotional sections remain code-defined. No admin content-management API. Original images can remain unchanged while adding content data later. |
| Customer return requests | Failed-delivery return and finance refund recording exist, but customer initiation, approval, collection and post-delivery return processing do not. |
| Support tickets/chat | Support panels provide guidance; there is no ticket/message workflow. |
| Credits/gift cards/membership | No balance/redemption/subscription models or routes. Some related profile descriptions are dormant, not exposed as full active screens. |
| Live push/tracking | Stored notifications and last rider coordinates exist. No push-device registration/delivery or streaming updates; current screens rely on fetching/refresh. |

The broader warehouse workflow mentioned in the earlier project requirements remains separate: the current Prisma schema has no warehouse locations, receipts or picking models. A rider UI is also not present among these four applications; rider execution endpoints exist for a separate rider client.

## Recommended order

1. Fix administrator identity/reset contracts and add regression coverage.
2. Correct pending-settlement totals; expose cash reconciliation, settlements and refunds in admin.
3. Complete admin category/coupon/service-area management and the image-upload path.
4. Fix rating/discount data, pagination, reporting totals and catalog refresh behavior.
5. Implement optional payments, delivery scheduling, returns, CMS and support according to the required launch scope.

Existing server tests cover identity and the core multi-vendor lifecycle. They do not establish complete coverage of the newer admin product/staff UI endpoints or all defects above. Provider credentials and deployment behavior were not verified in this audit.
