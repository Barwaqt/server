# Barwaqt API

Node.js (ES modules), Express 5, PostgreSQL, Prisma 7. Based on the supplied Barwaqt Workflow PDF and the customer/vendor frontend domains. Application files use names such as `auth.controller.js`, `auth.routes.js`, `auth.service.js`, and `auth.middleware.js`.

## Run locally testing...

Requires Node 22.12+ (tested on Node 24) and PostgreSQL 16+.

```sh
cd server
npm install
cp .env.example .env
```

Edit `.env`: set your PostgreSQL `DATABASE_URL` and a randomly generated `JWT_SECRET` (at least 32 characters). Generate a secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

If Docker is available, set `POSTGRES_PASSWORD` in your shell and run `docker compose up -d`; the database is available on **localhost:5433**, database/user `barwaqt`. Update `DATABASE_URL` accordingly. Existing PostgreSQL installations work without Docker.

```sh
npm run db:generate
npm run db:migrate
# Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) in .env first:
npm run db:seed
npm run dev
```

API: `http://localhost:4000/api/v1`. Health: `/health`; database readiness: `/ready`. Seeding creates one administrator and five categories without overwriting existing passwords. Do not keep seed credentials in shared files.

## Architecture

See the [backend architecture diagrams](docs/ARCHITECTURE.md) for application layers, integrations, route responsibilities, and the order/payment flow.

- `prisma/schema.prisma`: relational models and enums (the Prisma equivalent of ORM model definitions).
- `prisma/migrations`: versioned SQL migrations, including stock/amount constraints and one-open-shift uniqueness.
- `src/models`: reusable persistence projections and queries.
- `src/controllers`: HTTP input/output adapters.
- `src/services`: business rules and transactional workflows.
- `src/routes`: versioned route definitions with role guards.
- `src/middlewares`: authentication, authorization, validation, error handling.
- `src/validators`: strict Zod request schemas; unknown properties are rejected.
- `src/config`: validated configuration, Prisma adapter, serializable transactions.
- `tests`: unit and real PostgreSQL integration tests.

## Implemented workflow

1. Customers register; **only administrators create vendors and staff**. Public registration always creates a customer. There is no public vendor approval bypass.
2. Approved vendor products are discoverable by category, city and zone. Vendors manage only their own products.
3. Customer cart/wishlist/addresses/reviews are scoped to the authenticated customer. Reviews require a delivered purchase.
4. COD checkout uses database prices and stock, reserves inventory atomically, validates service zones/coupon limits, and creates one customer order plus vendor orders.
5. Each vendor accepts/rejects independently, prepares items and marks them ready. Rejection/cancellation restores stock once.
6. Dispatch assigns an available on-shift rider. The rider picks up, reports location, and delivers using the customer's six-digit PIN and exact COD amount.
7. Failed deliveries must be retried or returned by dispatch. A retry keeps the same rider/custody; a confirmed return restores inventory and releases the rider.
8. Finance records received rider cash; outstanding cash blocks shift end. Reconciled delivered orders become eligible for settlement.
9. Finance records refunds made externally before settlement, creates a settlement, processes it, then marks it paid with a unique bank/reference identifier. These endpoints record payments; they do not initiate bank transfers.
10. Customer notifications, vendor summaries, administrator reports, order events and audit logs capture the workflow.

## Explicit business rules

- Currency is **PKR**. Every `*Minor` integer is paisa: `125000` means PKR 1,250. No client-calculated totals are accepted.
- Delivery is one configured fee per checkout, proportionally allocated across vendor orders. Coupons are vendor-funded, allocated proportionally; commission is charged on each vendor's discounted product subtotal. Integer rounding remainder is distributed deterministically.
- For a cancelled vendor order, its product amount and allocated delivery fee are not collected. Parent totals preserve the original checkout quote; each child status/total shows the outstanding or fulfilled part. Coupon usage is not released by cancellation.
- COD is collected independently per vendor order. One rider handles one active assignment at a time. A rider can receive another assignment after completing or returning the previous one.
- Cash can be remitted partially. Orders become settlement-eligible only after that rider's entire outstanding balance is reconciled. This conservative policy prevents partially received cash being paid out twice.
- Refunds are restricted to reconciled deliveries not yet linked to a settlement. Refunds cannot exceed the discounted product amount; commission is proportionally reversed and audited. Delivery fees are not refunded by this endpoint. Post-settlement disputes need a separate adjustment process, not mutation of paid history.
- Settlements progress `PENDING → PROCESSED → PAID`. Duplicate cash/payment references and settling the same order twice are rejected.
- PINs are bcrypt hashed, five bad attempts lock delivery, and dispatch may reset a PIN. The customer receives PINs via authenticated in-app notifications. Riders and vendors never receive the PIN/hash from order APIs.
- Address availability currently uses exact case-insensitive city/zone matching, not geofencing. Shift break seconds are deducted from working time; breaks do not require a separate approval workflow.

## Authentication and operations

Access JWTs expire after 15 minutes by default. Refresh tokens are random, hashed in PostgreSQL, rotated on refresh, and expire after 30 days. Each access request checks the persisted session and active user. Logout/password changes revoke sessions. Only allowed roles and resource owners can operate on private resources.

Bearer authentication is used; the API does not set authentication cookies. Store tokens appropriately in your frontend/BFF; never store actual passwords or delivery PINs in logs. Browser origins are allowlisted. Helmet, bounded JSON bodies, request IDs, strict validation, password hashing and rate limits are configured. Built-in rate limiting is per process; use a shared store at multi-instance deployment. Configure proxy trust explicitly for your deployment rather than accepting arbitrary forwarded IP headers.

## Frontend integration

The `web` and `vendor_web` authentication and commerce screens call the backend through HttpOnly-cookie proxies. Customer catalog, cart, wishlist, addresses, COD checkout, orders and notifications use persisted API data. Vendor products, order actions, dashboard, settlements and business settings are connected. All commerce amounts use PKR and resource IDs use backend UUIDs. See [complete API reference](complete_api.md) and [frontend integration guide](docs/FRONTEND.md).

Authentication is connected in both frontends; see [authentication setup](docs/AUTH_SETUP.md) for SMTP, Google and Apple credentials. Provider credentials are required for live email/social sign-in. Not connected: online gateways (CARD/JAZZCASH/EASYPAISA return 503), SMS/OTP sign-in, external push notifications, bank transfers, document storage/verification, and warehouse fulfillment. No mock payment success or fake identity verification is exposed. Vendor identity/bank documents should be verified through your chosen provider/storage before production onboarding. The PDF explicitly places warehouse fulfillment in a future phase.

## Verification

```sh
npm run check
npm test
# Use a dedicated database named barwaqt_test; never a production database:
NODE_ENV=test DATABASE_URL=postgresql://.../barwaqt_test JWT_SECRET=<32-or-more-characters> npm run db:migrate
NODE_ENV=test DATABASE_URL=postgresql://.../barwaqt_test JWT_SECRET=<32-or-more-characters> npm run test:integration
```

Integration tests create uniquely named fixtures (they do not truncate databases). They verify ownership/role rejection, multi-vendor checkout, idempotency, concurrent stock protection, coupons, dispatch, PIN failures, COD, refunds, settlements, session rotation and revocation. Remove the dedicated test database when finished.

Framework references: [Prisma PostgreSQL adapter](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql), [Express 5 error handling](https://expressjs.com/en/5x/guide/error-handling/).

## Import existing storefront catalog

Run `npm run db:seed:catalog` after migrations to import the original 218 products and 171 category entries, assigned to a manageable vendor. See [catalog seed instructions](prisma/CATALOG_SEED.md) for images, login credentials, stock, price conventions and repeat-run behavior.

## CI/CD

GitHub Actions runs backend tests with PostgreSQL on pushes and pull requests to `main`. Successful pushes to `main` automatically publish tested code to the VPS through SSH and restart PM2; no server-side `git pull` is needed. See [deployment setup](docs/DEPLOYMENT.md) for secrets, prerequisites and migration handling.

The API trusts forwarded headers only from loopback peers for the same-host Nginx deployment. Remote peers are not trusted. See [Express proxy configuration](https://expressjs.com/en/guide/behind-proxies/).

## Product approval

New vendor products require admin review before publication. Vendors see rejection reasons and can resubmit corrected listings. See [product review API and rollout](docs/PRODUCT_REVIEW.md) for states, re-review rules and the required database migration.

## Private developer API reference

Open `https://api.barwaqt.com/integerate/api/complete_api.md` and enter the shared developer PIN. The server returns the current `complete_api.md` as readable plain text only after a correct form submission. Each access requires the PIN; no URL token or public static copy is created. Share the PIN separately. Responses disable caching and search indexing. Five failed attempts per IP within 15 minutes block further attempts until the window resets (in-memory limits reset on API restart). No new environment variables or database migrations are required for this route. Deploy the backend to make it available.

## Session and support updates

Search popularity requires migration `20261026120000_search_terms`. Support contacts use the existing StorefrontPage table. See complete_api.md for support and search endpoints.
