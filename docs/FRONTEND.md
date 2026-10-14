# Connected customer and vendor applications

Both applications now use the Node API for authentication and supported commerce features. They use same-origin Next.js proxies with HttpOnly session cookies; browser JavaScript does not receive backend bearer/refresh tokens. Commerce requests go through `/api/commerce/[...path]`; authentication uses `/api/auth/[action]`. Mutating proxy calls require a matching Origin header. API errors propagate to the UI; private responses are not cached.

## Run locally

1. Configure `server/.env`, run database migrations and seed an administrator as documented in `server/README.md`.
2. Start `server` with `npm run dev` (port 4000).
3. In each frontend, set `API_URL=http://localhost:4000/api/v1` in `.env.local` if not using the default. API_URL is server-only. Restart Next.js after changing it.
4. Run `npm run dev` in `web` (3000) and `vendor_web` (3001).
5. Admin creates categories and vendors through the documented API/Postman collection. Vendor signs in with the assigned account and creates products. Customer signup creates CUSTOMER accounts only.

No example credentials or sample products are automatically inserted into your business database. An empty catalog means no active vendor products exist yet, or no products match delivery/search filters. Suspended vendors are excluded from public results.

## Implemented screens

| App / screen | Connected behavior |
|---|---|
| Customer homepage/category/search | Live categories and approved-vendor products; pagination, search, city/zone, price and in-stock filters, sort |
| Store directory/detail | Public vendors, service area and their live products |
| Product detail | Live images, vendor, stock, description, attributes and reviews; purchase-review submission |
| Cart | Authenticated server cart; quantity/removal with stock validation; mutations serialized |
| Wishlist | Per-account persisted wishlist; no browser-only saved IDs |
| Addresses | Create/edit/delete saved addresses, choose one for checkout |
| Checkout | Server quote with coupon, vendor split and delivery fee; COD order submission with retry idempotency key; success only after API confirms |
| Customer profile | Profile update, order history/status filters, shipment cancellation while NEW, event history, last rider location, notifications/read, password change and linked providers |
| Vendor overview/reports | Real all-time product/order/delivered-sales aggregates, not arbitrary date-range samples |
| Vendor products | Paginated/searchable owned catalog; create/edit prices, stock, category, description, image URLs, attributes and active status |
| Vendor orders | Paginated/status-filtered own shipments; accept/reject/ready with service-enforced transitions and event history |
| Vendor finance | Actual settlements, statuses, references and included orders; latest 100 per API |
| Vendor business | Save business name/description/address; approval, commission and service area remain administrator controlled |
| Vendor account/notifications | Password change, provider linking, sign out and private notifications/read |

## Data and interaction rules

- All prices are PKR integer paisa at the API boundary; user-entered PKR product prices are converted to integers. Product stock is authoritative on the server.
- Product/category URLs now use actual backend IDs/slugs. Bundled catalog files and old demo components are not used by active commerce routes. Existing image files remain available; vendor product images are displayed exactly from their stored URLs.
- Prefer HTTPS image URLs shared by both deployments. Relative URLs work only if that asset exists in both apps. This integration does not implement binary uploads.
- Cart/wishlist require sign-in; no guest-cart merge exists. Account changes reset client state. Browser storage is not treated as a source of purchases.
- The customer quote is invalidated when cart/address ID/coupon changes. Checkout validates stock and totals again. Its idempotency key is retained for retries during the mounted checkout attempt; a new browser session does not recover an abandoned checkout key. If an uncertain request is followed by a full reload, inspect order history before placing another purchase.
- Customer order IDs are parent IDs; vendor preparation and cancellation actions use child IDs. Partial cancellation is displayed per shipment; parent totals remain the original checkout total.
- Refresh buttons reload order/notification data. This is not push delivery or a continuous GPS stream.
- Vendor product edits set stock absolutely; they are not inventory-adjustment transactions.
- Single-app-server refresh requests are coalesced in memory to avoid simultaneous token rotations from commerce requests. Multi-instance deployments should use shared session/refresh coordination.

## Unsupported features

Only COD is available. No simulated cards, wallets, credits, gift cards, delivery schedules, customer return requests, guaranteed delivery estimates, manufactured ratings, or fake payout success are shown. Online gateways, uploads, SMS verification, external push notifications, bank transfers and warehouse operations require additional backend/provider work. Social login and password-reset email still require their provider credentials; see AUTH_SETUP.md.

Historical UI files that are no longer routed are retained as design references. Do not reintroduce them as active commerce screens without replacing their demo state.

## Verification

Both frontends passed production builds and lint/type checks during integration. A Chromium run against an isolated PostgreSQL test database verified vendor product creation, customer catalog and persistent wishlist, address creation, server quoting, actual COD checkout, vendor acceptance/readiness, customer order status and delivery-PIN notifications. It also checked for browser runtime errors and horizontal overflow on the mobile homepage. Test records were created only in the isolated database, not the configured business database.

The authentication proxy also preserves HTTP 429 responses with an actionable message when the upstream rate limiter returns plain text. Provider sign-in/email delivery remain dependent on external configuration and were not exercised by the commerce test.

## Existing design retained

The customer storefront uses the original homepage, navigation, category, product, wishlist, checkout and account layouts. `CatalogProvider` adapts API catalog data to those existing components; prices, availability, vendor ownership, cart and wishlist remain server-backed. Original product and category assets are retained. The vendor portal keeps its original sidebar, header, dashboard columns, chart and order table with database metrics and API-backed editors.

Checkout address forms persist to the customer account. Quotes and order placement use the same optional `productIds` selection, so unchecked cart items remain. Only COD is currently enabled; online payment options remain visibly unavailable until backend payment integrations are configured.
