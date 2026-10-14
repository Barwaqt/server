# Barwaqt complete API reference

This document describes the endpoints implemented in `src/app.js` and `src/routes`, including service-level requirements. It describes the Node API directly; the Next.js authentication proxy has a different cookie-based interface.

## Postman and mobile developer quick start

Import [the complete Postman collection](postman/Barwaqt.postman_collection.json) and [the local environment template](postman/Barwaqt.local.postman_environment.json). The collection has **65 unique endpoints and 78 requests**, including explicit order-action/shift/settlement examples. Every request includes its contract description, authentication configuration, and JSON payload where needed.

Select an environment, set your account email/password, and run login. Login/refresh automatically save tokens; selected create requests capture resource IDs. Duplicate environments per role. Read [the Postman/mobile integration guide](postman/README.md) for setup, variables, workflow order and mobile token handling. Do not run the whole collection blindly: many requests mutate data.

This file is the human-readable contract; the collection is its importable request companion. Both describe implemented APIs, not unimplemented features.

## Connection and conventions

- Development origin: `http://localhost:4000`.
- API base URL: `http://localhost:4000/api/v1`. Endpoint headings below include the full path.
- Send `Content-Type: application/json` for JSON bodies. Protected endpoints require `Authorization: Bearer <accessToken>`.
- `Public` means no token required. `Authenticated` means any active account with a valid session. Other access labels are exact uppercase roles.
- All resource IDs are UUIDs. Replace example UUIDs with IDs returned by the API; frontend demo product IDs are not valid backend IDs.
- Amounts ending in `Minor` are integer PKR paisa: `125000` means PKR 1,250. Percentages ending in `Bps` use basis points: `1000` means 10%.
- Datetimes are ISO 8601 strings; nullable database fields can be `null`.
- Unless stated otherwise, success is `{ "data": ... }`. Arrays are not automatically paginated envelopes. `204` has no response body.
- Request bodies use strict validation: unknown fields are rejected. Optional does not imply nullable. GET requests and endpoints marked **None** need no body.
- Global rate limit: 300 requests/minute per IP. All `/auth` endpoints additionally share 30 requests/15 minutes per IP. Limit responses are HTTP 429 and may be plain text rather than the JSON error format.
- JSON body limit: 256 KB. Browser origins must be configured in `CORS_ORIGINS`.

### Authentication/session response

Register, login, and social sign-in return:

```json
{"data":{"accessToken":"<JWT>","refreshToken":"<opaque token>","expiresIn":900,"user":{"id":"11111111-1111-4111-8111-111111111111","email":"customer@example.com","phone":"+923001234567","role":"CUSTOMER","firstName":"Ali","lastName":"Khan","profile":{},"active":true,"createdAt":"2026-10-12T10:00:00.000Z"}}}
```

`expiresIn` is seconds and configurable (default 15 minutes). Refresh tokens default to 30 days. Refresh rotates the token: save both new tokens and never reuse the old refresh token. Refresh does not extend the original session expiry. Logout revokes the current session; password change/reset revokes every session. The direct Node API returns tokens in JSON and does not set authentication cookies. Existing Next.js `/api/auth/[action]` proxies store them in HttpOnly cookies; do not mix those endpoints with this API contract.

### Errors

```json
{"error":{"message":"Validation failed","details":[{"path":"email","message":"Invalid email address"}]},"requestId":"<request UUID>"}
```

`details` is optional. Common statuses: `401` missing/expired authentication or invalid credentials; `403` wrong role/ownership; `404` missing resource; `409` duplicate, stock conflict, invalid state, or concurrent update; `422` invalid input/business requirement; `423` delivery PIN locked; `503` unconfigured provider/payment service; `500` unexpected server error. Preserve `requestId` when reporting a failure. Invalid JSON can return 400 and oversized bodies 413.

### Shared validation rules

| Type | Rule |
|---|---|
| text | Trimmed string, 1–200 characters |
| email | Valid email; normalized to lowercase |
| password | 12–72 characters for registration/new passwords |
| phone | Optional leading `+`, followed by 9–15 digits; no spaces |
| UUID | Valid UUID string |
| minor | Integer 0–100,000,000; positive fields must be at least 1 |
| slug | Lowercase letters, digits, hyphens; 1–180 characters |
| pagination | `page` defaults 1, minimum 1; `limit` defaults 20, range 1–100 |

Only use query parameters explicitly documented for each endpoint. Several routes share a broader query validator, but their services ignore unused filters. Unknown query keys are stripped, not applied.

## Endpoint index

| Method | Endpoint | Access |
|---|---|---|
| GET | `/` | Public |
| GET | `/api/v1` | Public |
| GET | `/health` | Public |
| GET | `/ready` | Public |
| GET | `/favicon.ico` | Public |
| POST | `/api/v1/auth/register` | Public |
| POST | `/api/v1/auth/login` | Public |
| POST | `/api/v1/auth/refresh` | Public |
| GET | `/api/v1/auth/providers` | Public |
| POST | `/api/v1/auth/forgot-password` | Public |
| POST | `/api/v1/auth/reset-password` | Public |
| POST | `/api/v1/auth/challenge` | Public |
| POST | `/api/v1/auth/social` | Public |
| POST | `/api/v1/auth/link-provider` | Authenticated |
| GET | `/api/v1/auth/me` | Authenticated |
| POST | `/api/v1/auth/logout` | Authenticated |
| POST | `/api/v1/auth/change-password` | Authenticated |
| GET | `/api/v1/catalog/vendors` | Public |
| GET | `/api/v1/catalog/vendors/:id` | Public |
| POST | `/api/v1/orders/quote` | CUSTOMER |
| PATCH | `/api/v1/vendor/profile` | Approved VENDOR |
| GET | `/api/v1/catalog/categories` | Public |
| GET | `/api/v1/catalog/products` | Public |
| GET | `/api/v1/catalog/products/:id` | Public |
| PATCH | `/api/v1/customer/profile` | CUSTOMER |
| GET | `/api/v1/customer/addresses` | CUSTOMER |
| POST | `/api/v1/customer/addresses` | CUSTOMER |
| PUT | `/api/v1/customer/addresses/:id` | CUSTOMER |
| DELETE | `/api/v1/customer/addresses/:id` | CUSTOMER |
| GET | `/api/v1/customer/cart` | CUSTOMER |
| PUT | `/api/v1/customer/cart/:id` | CUSTOMER |
| GET | `/api/v1/customer/wishlist` | CUSTOMER |
| PUT | `/api/v1/customer/wishlist/:id` | CUSTOMER |
| DELETE | `/api/v1/customer/wishlist/:id` | CUSTOMER |
| PUT | `/api/v1/customer/reviews/:id` | CUSTOMER |
| POST | `/api/v1/orders/checkout` | CUSTOMER |
| GET | `/api/v1/orders` | CUSTOMER, VENDOR, RIDER, ADMIN, DISPATCHER, FINANCE |
| GET | `/api/v1/orders/:id` | CUSTOMER, VENDOR, RIDER, ADMIN, DISPATCHER, FINANCE |
| POST | `/api/v1/orders/:id/actions` | Authenticated; action-specific permissions below |
| POST | `/api/v1/orders/:id/assign` | ADMIN, DISPATCHER |
| POST | `/api/v1/orders/:id/reset-pin` | ADMIN, DISPATCHER |
| PATCH | `/api/v1/orders/:id/location` | RIDER |
| GET | `/api/v1/vendor/profile` | Approved VENDOR |
| GET | `/api/v1/vendor/dashboard` | Approved VENDOR |
| GET | `/api/v1/vendor/products` | Approved VENDOR |
| POST | `/api/v1/vendor/products` | Approved VENDOR |
| PATCH | `/api/v1/vendor/products/:id` | Approved VENDOR |
| GET | `/api/v1/vendor/settlements` | Approved VENDOR |
| POST | `/api/v1/admin/vendors` | ADMIN |
| GET | `/api/v1/admin/vendors` | ADMIN |
| PATCH | `/api/v1/admin/vendors/:id` | ADMIN |
| POST | `/api/v1/admin/staff` | ADMIN |
| POST | `/api/v1/admin/categories` | ADMIN |
| POST | `/api/v1/admin/coupons` | ADMIN |
| GET | `/api/v1/admin/reports` | ADMIN |
| GET | `/api/v1/admin/audit-logs` | ADMIN |
| GET | `/api/v1/rider/shifts` | RIDER, ADMIN, DISPATCHER |
| POST | `/api/v1/rider/shifts` | RIDER |
| POST | `/api/v1/finance/remittances` | ADMIN, FINANCE |
| GET | `/api/v1/finance/settlements` | ADMIN, FINANCE |
| POST | `/api/v1/finance/settlements` | ADMIN, FINANCE |
| PATCH | `/api/v1/finance/settlements/:id` | ADMIN, FINANCE |
| POST | `/api/v1/finance/orders/:id/refunds` | ADMIN, FINANCE |
| GET | `/api/v1/notifications` | Authenticated |
| PATCH | `/api/v1/notifications/:id/read` | Authenticated |

## System endpoints
### GET /

**Access:** Public.

**Body:** None.

**Success:** 200; unwrapped `{name, version, message, endpoints}` API discovery object.

### GET /api/v1

**Access:** Public.

**Body:** None.

**Success:** 200; unwrapped `{name, version, message, endpoints}` API discovery object.

### GET /health

**Access:** Public.

**Body:** None.

**Success:** 200; `{"status":true,"message":"Barwaqt API is Running..."}`.

Liveness only; does not check the database.

### GET /ready

**Access:** Public.

**Body:** None.

**Success:** 200; `{"status":"ready"}`.

Runs a database query; database errors use the error handler.

### GET /favicon.ico

**Access:** Public.

**Body:** None.

**Success:** 204; empty body.

## Authentication

### POST /api/v1/auth/register

**Access:** Public.

**Example JSON body:**

```json
{
  "email": "customer@example.com",
  "password": "ExamplePass123!",
  "firstName": "Ali",
  "lastName": "Khan",
  "phone": "+923001234567"
}
```

**Success:** 201; session response including public user.

Required: email, password, firstName. Optional: lastName (trimmed, max 200; empty allowed), phone. Always creates CUSTOMER. Vendors/staff are created by ADMIN; a `role` field is rejected.

### POST /api/v1/auth/login

**Access:** Public.

**Example JSON body:**

```json
{
  "identity": "customer@example.com",
  "password": "ExamplePass123!"
}
```

**Success:** 200; session response.

Both fields required. identity is an email or exact phone string (text); password 1–72 characters. Supports all roles; check returned user.role to choose the portal. Password login itself does not enforce vendor approval; vendor routes do.

### POST /api/v1/auth/refresh

**Access:** Public.

**Example JSON body:**

```json
{
  "refreshToken": "<opaque refresh token from login>"
}
```

**Success:** 200; `data: {accessToken, refreshToken, expiresIn}` (no user).

refreshToken is required, 32–200 characters. Serialize refresh calls to avoid reusing a rotated token.

### GET /api/v1/auth/providers

**Access:** Public.

**Body:** None.

**Success:** 200; `data: {googleClientId, appleClientId, appleRedirectUri, passwordReset}`.

Client IDs/redirect URI are public configuration strings; empty strings mean unconfigured. passwordReset is a boolean configuration check, not proof of SMTP connectivity.

### POST /api/v1/auth/forgot-password

**Access:** Public.

**Example JSON body:**

```json
{
  "email": "customer@example.com",
  "portal": "customer"
}
```

**Success:** 200; `data: {message: "If an eligible account exists, a password-reset link will be emailed shortly."}`.

email required; portal customer/vendor, defaults customer. Only active matching-role accounts receive email. SMTP configuration is required (503 if missing). Link is `<portal URL>/reset-password#token=<token>`, expires in 20 minutes. The API never returns the reset token.

### POST /api/v1/auth/reset-password

**Access:** Public.

**Example JSON body:**

```json
{
  "token": "<token extracted from email URL fragment>",
  "newPassword": "NewExamplePass123!"
}
```

**Success:** 200; `data: {message: "Your password has been changed. Sign in with your new password."}`.

Both required. token 32–200 characters; newPassword 12–72. Single use; invalid/expired links return 422. Clears all reset tokens and sessions for the user.

### POST /api/v1/auth/challenge

**Access:** Public.

**Example JSON body:**

```json
{
  "provider": "google"
}
```

**Success:** 200; `data: {nonce: "<opaque challenge>"}`.

provider required: google/apple. Challenge expires after five minutes. Provider must be configured (503 otherwise). Pass this nonce to the provider SDK so it is included in the signed ID token.

### POST /api/v1/auth/social

**Access:** Public.

**Example JSON body:**

```json
{
  "provider": "google",
  "credential": "<provider-issued signed ID token>",
  "nonce": "<nonce from challenge endpoint>",
  "portal": "customer"
}
```

**Success:** 200; session response.

Required: provider google/apple, credential (20–10,000 characters), nonce (32–200). portal customer/vendor defaults customer. Use an ID token, not an OAuth access token or authorization code. Signature, issuer/audience, verified email and matching nonce are checked. Successful challenges are single use. New identities create CUSTOMER only. Existing email without provider link returns 409; sign in with password and link explicitly. Vendor identities must already be linked to an admin-created, approved vendor.

### POST /api/v1/auth/link-provider

**Access:** Authenticated.

**Example JSON body:**

```json
{
  "provider": "google",
  "credential": "<provider-issued signed ID token>",
  "nonce": "<nonce from challenge endpoint>",
  "portal": "customer"
}
```

**Success:** 200; `data: {message: "Google account linked. You can now use it to sign in."}` (Apple wording for Apple).

Same payload validation/challenge flow as social sign-in. Provider email must match the signed-in account email. A provider linked elsewhere returns 409. Does not issue a new session.

### GET /api/v1/auth/me

**Access:** Authenticated.

**Body:** None.

**Success:** 200; `data: PublicUser` (see response fields below).

### POST /api/v1/auth/logout

**Access:** Authenticated.

**Body:** None.

**Success:** 204; empty body.

Revokes only the session associated with the supplied access token.

### POST /api/v1/auth/change-password

**Access:** Authenticated.

**Example JSON body:**

```json
{
  "currentPassword": "ExamplePass123!",
  "newPassword": "NewExamplePass123!"
}
```

**Success:** 200; `data: {message: "Password changed. Sign in again."}`.

Both required. currentPassword max 72; newPassword 12–72. Revokes all sessions, including the current one.

## Public catalog

### GET /api/v1/catalog/categories

**Access:** Public.

**Body:** None.

**Success:** 200; `data: Category[]`, sorted by name.

No pagination or category hierarchy endpoint.

### GET /api/v1/catalog/products

**Access:** Public.

**Query:** page, limit; optional search (name contains, case-insensitive), city and zone (exact case-insensitive vendor match), categoryId UUID, vendorId UUID. String filters max 100. Optional minPriceMinor/maxPriceMinor (integer 0–100,000,000; min must not exceed max), inStock=true to require stock > 0 (false means no stock restriction), sort=newest/price-asc/price-desc/name (default newest).

**Body:** None.

**Success:** 200; `data: {items: Product[], total, page, limit}`. Each item includes category and vendor `{id,name,city,zone}`.

Only active products from APPROVED vendors, newest first. Example: `/api/v1/catalog/products?page=1&limit=20&search=rice&city=Lahore&zone=Gulberg`.

### GET /api/v1/catalog/products/:id

**Access:** Public.

**Body:** None.

**Success:** 200; `data: Product` with category, vendor `{id,name,city,zone}`, and up to 50 newest reviews `{rating,comment,createdAt}`.

id is product UUID. Inactive products/suspended vendors return 404.

## Customer profile, addresses, cart, wishlist, reviews

### PATCH /api/v1/customer/profile

**Access:** CUSTOMER.

**Example JSON body:**

```json
{
  "firstName": "Ali",
  "lastName": "Khan",
  "phone": "+923001234567",
  "profile": {
    "birthday": "1995-06-20",
    "gender": "Male",
    "nationality": "Pakistani",
    "tourist": false
  }
}
```

**Success:** 200; `data: PublicUser`.

All fields optional. firstName text; lastName max 100; phone shared format. profile allows only birthday (ISO YYYY-MM-DD), gender Male/Female/Other, nationality max 100, tourist boolean. Supplied profile replaces the stored JSON object; send retained fields too. Cannot change email or role here.

### GET /api/v1/customer/addresses

**Access:** CUSTOMER.

**Body:** None.

**Success:** 200; `data: Address[]`, own addresses newest first.

### POST /api/v1/customer/addresses

**Access:** CUSTOMER.

**Example JSON body:**

```json
{
  "kind": "Home",
  "firstName": "Ali",
  "lastName": "Khan",
  "phone": "+923001234567",
  "city": "Lahore",
  "zone": "Gulberg",
  "street": "Main Boulevard",
  "building": "Building A",
  "apartment": "Flat 12",
  "directions": "Call on arrival",
  "latitude": 31.52,
  "longitude": 74.35
}
```

**Success:** 201; `data: Address`.

Required: firstName, phone, city, zone, street. Optional: kind Home/Work/Other (default Home), lastName max 100 (default empty), building max 200, apartment max 100, directions max 500 (these default empty), latitude −90…90, longitude −180…180. Other required strings use text rules.

### PUT /api/v1/customer/addresses/:id

**Access:** CUSTOMER.

**Example JSON body:**

```json
{
  "kind": "Home",
  "firstName": "Ali",
  "lastName": "Khan",
  "phone": "+923001234567",
  "city": "Lahore",
  "zone": "Gulberg",
  "street": "Main Boulevard",
  "building": "Building A",
  "apartment": "Flat 12",
  "directions": "Call on arrival",
  "latitude": 31.52,
  "longitude": 74.35
}
```

**Success:** 200; `data: Address`.

id is owned address UUID. Full validated address input required, not a partial PATCH. Required: firstName, phone, city, zone, street. Optional: kind Home/Work/Other (default Home), lastName max 100 (default empty), building max 200, apartment max 100, directions max 500 (these default empty), latitude −90…90, longitude −180…180. Other required strings use text rules.

### DELETE /api/v1/customer/addresses/:id

**Access:** CUSTOMER.

**Body:** None.

**Success:** 204; empty body.

Only deletes an owned address. Missing/non-owned IDs also return 204.

### GET /api/v1/customer/cart

**Access:** CUSTOMER.

**Body:** None.

**Success:** 200; `data: CartItem[]`, each including product and product.vendor `{id,name,status,city,zone}`.

No totals envelope; checkout calculates authoritative prices and totals.

### PUT /api/v1/customer/cart/:id

**Access:** CUSTOMER.

**Example JSON body:**

```json
{
  "quantity": 2
}
```

**Success:** 200; `data: {userId,productId,quantity}`; quantity 0 returns `data: {count}`.

id is PRODUCT UUID, not cart item ID. quantity required integer 0–99. Sets absolute quantity, not an increment. Zero removes the item. Positive quantities require active product, approved vendor and sufficient stock. Cart does not reserve stock.

### GET /api/v1/customer/wishlist

**Access:** CUSTOMER.

**Body:** None.

**Success:** 200; `data: WishlistItem[]`, each `{userId,productId,product}`.

### PUT /api/v1/customer/wishlist/:id

**Access:** CUSTOMER.

**Body:** None.

**Success:** 200; `data: {userId,productId}`.

id is product UUID. Idempotently saves an active product from an approved vendor.

### DELETE /api/v1/customer/wishlist/:id

**Access:** CUSTOMER.

**Body:** None.

**Success:** 204; empty body.

id is product UUID. Idempotently removes the caller’s wishlist item.

### PUT /api/v1/customer/reviews/:id

**Access:** CUSTOMER.

**Example JSON body:**

```json
{
  "rating": 5,
  "comment": "Arrived on time and in good condition."
}
```

**Success:** 200; `data: Review`.

id is product UUID. Both fields required: rating integer 1–5, comment trimmed 1–2,000. Requires a DELIVERED purchase of the product. Creates or updates the caller’s single review for that product.

## Orders and delivery

### POST /api/v1/orders/checkout

**Access:** CUSTOMER.

**Example JSON body:**

```json
{
  "addressId": "11111111-1111-4111-8111-111111111111",
  "couponCode": "WELCOME10",
  "paymentMethod": "COD"
}
```

**Success:** 201; `data: Order` including `vendorOrders`, their items and events. Replaying the same request also returns 201.

Required header: `Idempotency-Key: checkout-20261012-001` (8–100 letters, digits, hyphen or underscore). addressId required; optional productIds is an array of 1–100 product UUIDs from the authenticated customer’s cart (omit to purchase the entire cart); couponCode optional max 30; paymentMethod defaults COD. CARD/JAZZCASH/EASYPAISA validate but return 503 because online payment is not configured. Uses the server cart (1–100 distinct products), owned address, current prices/stock. Every vendor city AND zone must match address case-insensitively. Reserves stock, applies coupon and configured delivery fee, splits into one child order per vendor, and removes only purchased cart items atomically; unchecked items remain. Retry the identical payload with the same key; changed payload returns 409. Start a new purchase with a new key. PINs go to customer notifications, not the order response.

### GET /api/v1/orders

**Access:** CUSTOMER, VENDOR, RIDER, ADMIN, DISPATCHER, FINANCE.

**Query:** page, limit; status filters child orders for non-customers; for customers it returns parent orders having at least one matching child (all children remain included). Other shared filters are ignored. Status: NEW/PREPARING/READY/ASSIGNED/PICKED_UP/DELIVERED/FAILED/CANCELLED/RETURNED.

**Body:** None.

**Success:** 200; `data: Order[]` for CUSTOMER, `data: VendorOrder[]` for all other roles.

Customer sees own parent orders with children/items/events. Vendor sees own children; rider sees assigned children; admin/dispatch/finance see all children. Non-customer rows include items, events, and order `{address,currency,paymentMethod}`. Newest first. No total-count envelope.

### GET /api/v1/orders/:id

**Access:** CUSTOMER, VENDOR, RIDER, ADMIN, DISPATCHER, FINANCE.

**Body:** None.

**Success:** 200; `data: Order` for CUSTOMER; `data: VendorOrder` for other roles, with relations as in the list.

CUSTOMER supplies parent Order.id. All other roles supply child VendorOrder.id. Ownership restrictions match the list. Parent orders do not have a single status: inspect vendorOrders[].status.

### POST /api/v1/orders/:id/actions

**Access:** Authenticated; action-specific permissions below.

**Example JSON body:**

```json
{
  "action": "deliver",
  "pin": "123456",
  "cashCollectedMinor": 130000
}
```

**Success:** 200; `data: VendorOrder` scalar fields (without items/events).

Always supply child VendorOrder.id, including customer cancellation. Required action; optional reason trimmed 3–500, pin exactly six digits, cashCollectedMinor nonnegative minor integer. The action table below specifies conditional requirements. Example PIN/amount are placeholders: use actual notification PIN and child totalMinor.

### Order action payloads and transitions

Every row uses `POST /api/v1/orders/:id/actions` with the child order UUID.

| Action | Allowed actor | Required current status | Next status | JSON payload |
|---|---|---|---|---|
| accept | Owning approved VENDOR | NEW | PREPARING | `{"action":"accept"}` |
| reject | Owning approved VENDOR | NEW | CANCELLED | `{"action":"reject","reason":"Item unavailable"}` |
| ready | Owning approved VENDOR | PREPARING | READY | `{"action":"ready"}` |
| cancel | Owning CUSTOMER or ADMIN | NEW | CANCELLED | `{"action":"cancel"}` |
| pickup | Assigned RIDER | ASSIGNED | PICKED_UP | `{"action":"pickup"}` |
| deliver | Assigned RIDER | PICKED_UP | DELIVERED | `{"action":"deliver","pin":"123456","cashCollectedMinor":130000}` |
| fail | Assigned RIDER | ASSIGNED or PICKED_UP | FAILED | `{"action":"fail","reason":"Customer unavailable"}` |
| retry | ADMIN or DISPATCHER | FAILED | ASSIGNED | `{"action":"retry"}` |
| return | ADMIN or DISPATCHER | FAILED | RETURNED | `{"action":"return","reason":"Returned to vendor"}` |

Delivery requires cashCollectedMinor to equal the **child** totalMinor exactly. Wrong PIN returns 422 and increments attempts; after five failures further delivery attempts return 423 until dispatch resets the PIN. Cancellation/return restores stock. Retry retains the assigned rider and requires pickup again. FAILED deliveries keep the rider busy; completed/cancelled/returned deliveries release the rider when no active assignments remain. Returns here concern failed deliveries, not customer returns after delivery. Refunds have a separate finance endpoint.

### POST /api/v1/orders/:id/assign

**Access:** ADMIN, DISPATCHER.

**Example JSON body:**

```json
{
  "riderId": "11111111-1111-4111-8111-111111111111"
}
```

**Success:** 200; `data: VendorOrder` scalar fields.

id is child UUID. Order must be READY. riderId required UUID for active RIDER on an AVAILABLE open shift. Sets ASSIGNED and marks rider BUSY.

### POST /api/v1/orders/:id/reset-pin

**Access:** ADMIN, DISPATCHER.

**Body:** None.

**Success:** 200; `data: {message: "New PIN sent to customer notifications"}`.

id is child UUID. Cannot reset DELIVERED/CANCELLED/RETURNED orders. Resets attempts and sends a new customer notification; does not return the PIN.

### PATCH /api/v1/orders/:id/location

**Access:** RIDER.

**Example JSON body:**

```json
{
  "latitude": 31.52,
  "longitude": 74.35
}
```

**Success:** 200; `data: {updated: true}`.

id is assigned child UUID in ASSIGNED or PICKED_UP state. Both coordinates required (latitude −90…90; longitude −180…180). Updates locationAt. No active matching assignment returns 404.

## Vendor portal

### GET /api/v1/vendor/profile

**Access:** Approved VENDOR.

**Body:** None.

**Success:** 200; `data: Vendor`.

All endpoints in this section require the caller’s vendor status APPROVED.

### GET /api/v1/vendor/dashboard

**Access:** Approved VENDOR.

**Body:** None.

**Success:** 200; `data: {currency:"PKR",products,orders,delivered,recent,productStatus,sales,topProducts,pendingPayableMinor}`.

products is a count. orders is `[{status,_count}]`. delivered is `{_sum:{subtotalMinor,commissionMinor,payableMinor}}` (sums can be null). recent contains up to 10 `{id,status,totalMinor,createdAt}` child orders.

`productStatus` contains `{active,inactive,outOfStock}` counts. `sales` contains 30 UTC days of `{date:"YYYY-MM-DD",totalMinor}` delivered gross sales, including zero days. `topProducts` contains up to five `{id,name,image,sold,totalMinor}` products ranked by delivered quantity; `totalMinor` is delivered gross item revenue. `pendingPayableMinor` sums delivered child-order payables not yet in a PAID settlement (cash reconciliation is still required before payout). All results are scoped to the authenticated vendor.

### GET /api/v1/vendor/products

**Access:** Approved VENDOR.

**Query:** page, limit; optional search (case-insensitive name contains) and categoryId UUID.

**Body:** None.

**Success:** 200; `data: Product[]`, newest first, including inactive owned products.

No total-count wrapper. Search and categoryId are supported; status is not a product filter.

### POST /api/v1/vendor/products

**Access:** Approved VENDOR.

**Example JSON body:**

```json
{
  "name": "Basmati Rice 5kg",
  "slug": "basmati-rice-5kg",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "description": "Premium basmati rice.",
  "priceMinor": 125000,
  "stock": 50,
  "images": [
    "https://example.com/rice.jpg",
    "/shop/rice.webp"
  ],
  "attributes": {
    "weight": "5kg",
    "brand": "Example"
  },
  "active": true
}
```

**Success:** 201; `data: Product`.

Required: name text, slug, categoryId UUID of existing category, positive priceMinor, stock integer 0–1,000,000. Optional: description max 10,000 (default empty), images max 12 strings (max 2,000 each; HTTPS URL or single-leading-slash path), attributes string map (keys max 50, values max 500; default {}), active boolean (default true). Owner vendorId is server assigned. Slug is globally unique. This endpoint accepts image URLs, not file uploads.

### PATCH /api/v1/vendor/products/:id

**Access:** Approved VENDOR.

**Example JSON body:**

```json
{
  "priceMinor": 120000,
  "stock": 40,
  "active": true
}
```

**Success:** 200; `data: Product`.

id must belong to caller’s vendor. Same fields/rules as product creation, all optional. Supplied stock is absolute; supplied images/attributes replace those values. Set active false to unpublish; no product DELETE route.

### GET /api/v1/vendor/settlements

**Access:** Approved VENDOR.

**Body:** None.

**Success:** 200; `data: Settlement[]` with orders `{id,subtotalMinor,discountMinor,commissionMinor,payableMinor}`.

Own settlements only, newest first, max 100; no pagination query.

## Administration

### POST /api/v1/admin/vendors

**Access:** ADMIN.

**Example JSON body:**

```json
{
  "email": "vendor@example.com",
  "password": "VendorPass123!",
  "phone": "+923001234568",
  "firstName": "Sara",
  "lastName": "Ahmed",
  "name": "Gulberg Market",
  "slug": "gulberg-market",
  "businessType": "Grocery",
  "description": "Local groceries",
  "city": "Lahore",
  "zone": "Gulberg",
  "address": "Main Boulevard",
  "commissionBps": 1000
}
```

**Success:** 201; `data: Vendor` (not a session).

Required: email, password, phone, firstName, name, slug, businessType, city, zone, address. Optional: lastName text, description max 5,000, commissionBps integer 0–10,000 (default 1000). Creates owner role VENDOR and vendor status APPROVED. Owner signs in using assigned credentials. No public vendor registration.

### GET /api/v1/admin/vendors

**Access:** ADMIN.

**Query:** page, limit only.

**Body:** None.

**Success:** 200; `data: Vendor[]`, including owner PublicUser.

Newest first. No total-count wrapper; search/status/city filters are not applied.

### PATCH /api/v1/admin/vendors/:id

**Access:** ADMIN.

**Example JSON body:**

```json
{
  "status": "SUSPENDED",
  "commissionBps": 1200
}
```

**Success:** 200; `data: Vendor`.

id is vendor UUID, not owner user UUID. Both fields optional: status APPROVED/SUSPENDED; commissionBps integer 0–10,000. Commission changes apply to future checkouts, not existing order snapshots.

### POST /api/v1/admin/staff

**Access:** ADMIN.

**Example JSON body:**

```json
{
  "email": "rider@example.com",
  "password": "RiderPass123!",
  "phone": "+923001234569",
  "firstName": "Usman",
  "lastName": "Ali",
  "role": "RIDER"
}
```

**Success:** 201; `data: PublicUser` (not a session).

Required: email, password, firstName, role RIDER/DISPATCHER/FINANCE. Optional: phone, lastName text. ADMIN cannot be created through this route; initial admin uses seed setup.

### POST /api/v1/admin/categories

**Access:** ADMIN.

**Example JSON body:**

```json
{
  "name": "Groceries",
  "slug": "groceries"
}
```

**Success:** 201; `data: Category`.

Both required: name text, slug. Slug unique. No update/delete category routes.

### POST /api/v1/admin/coupons

**Access:** ADMIN.

**Example JSON body:**

```json
{
  "code": "WELCOME10",
  "percentBps": 1000,
  "maxDiscountMinor": 50000,
  "minSubtotalMinor": 100000,
  "maxUses": 100,
  "expiresAt": "2030-12-31T23:59:59.000Z"
}
```

**Success:** 201; `data: Coupon`.

Required: code (trimmed/uppercased, 3–30 uppercase letters/digits/_/-), percentBps integer 1–10,000, positive maxDiscountMinor, maxUses integer 1–1,000,000, expiresAt ISO datetime. Optional minSubtotalMinor defaults 0. New coupons active=true and used=0. Checkout validates expiry, usage and minimum; no standalone coupon validation/list/update endpoint.

### GET /api/v1/admin/reports

**Access:** ADMIN.

**Body:** None.

**Success:** 200; `data: {currency,orders,delivered,codRemittedMinor,codOutstandingMinor,settlementsPaidMinor,refundsMinor}`.

All-time aggregates, no date filter. orders: `{_sum:{totalMinor},_count}`. delivered: `{_sum:{subtotalMinor,discountMinor,commissionMinor,deliveryMinor,payableMinor,codCollectedMinor},_count}` for DELIVERED children. Aggregate sums can be null; scalar report amounts default to zero.

### GET /api/v1/admin/audit-logs

**Access:** ADMIN.

**Body:** None.

**Success:** 200; `data: AuditLog[]`, newest 100.

No pagination/filter parameters.

## Rider shifts

### GET /api/v1/rider/shifts

**Access:** RIDER, ADMIN, DISPATCHER.

**Body:** None.

**Success:** 200; `data: Shift[]` with rider `{id,firstName,lastName}` and computed workedSeconds.

Rider sees own shifts; admin/dispatch see all. Newest 100, no query filters. workedSeconds excludes recorded breaks and any current break.

### POST /api/v1/rider/shifts

**Access:** RIDER.

**Example JSON body:**

```json
{
  "action": "start"
}
```

**Success:** 200; `data: Shift` scalar fields.

action required: start/break/resume/end. Payloads: `{"action":"break"}`, `{"action":"resume"}`, `{"action":"end"}`. start requires no open shift; break requires AVAILABLE; resume requires BREAK. BUSY riders cannot break/resume/end. End requires all collected COD remitted, including earlier shifts. Shift statuses AVAILABLE/BUSY/BREAK/ENDED; assignment updates BUSY automatically.

## Finance and settlements

### POST /api/v1/finance/remittances

**Access:** ADMIN, FINANCE.

**Example JSON body:**

```json
{
  "riderId": "11111111-1111-4111-8111-111111111111",
  "amountMinor": 130000,
  "reference": "CASH-20261012-001"
}
```

**Success:** 201; `data: Remittance`.

All required: riderId UUID, positive amountMinor, reference text (unique). Amount cannot exceed rider’s outstanding COD. Partial remittances are allowed; delivered orders become cashReceived=true only when the entire outstanding balance is cleared. This records money received; it does not transfer money.

### GET /api/v1/finance/settlements

**Access:** ADMIN, FINANCE.

**Body:** None.

**Success:** 200; `data: Settlement[]` with orders `{id,subtotalMinor,discountMinor,commissionMinor,payableMinor}`.

All vendors, newest 100. No filters/pagination.

### POST /api/v1/finance/settlements

**Access:** ADMIN, FINANCE.

**Example JSON body:**

```json
{
  "vendorId": "11111111-1111-4111-8111-111111111111"
}
```

**Success:** 201; `data: Settlement`, status PENDING.

vendorId required UUID. Collects that vendor’s DELIVERED, cashReceived, unsettled children. Sum payableMinor must be positive. Once attached to a settlement, those orders cannot receive refunds through the refund route.

### PATCH /api/v1/finance/settlements/:id

**Access:** ADMIN, FINANCE.

**Example JSON body:**

```json
{
  "status": "PAID",
  "reference": "BANK-20261012-001"
}
```

**Success:** 200; `data: Settlement`.

id is settlement UUID. status required PROCESSED/PAID. Only PENDING→PROCESSED→PAID allowed. First send `{"status":"PROCESSED"}`; then the example above. reference text required for PAID and must be unique; a reference supplied at PROCESSED is ignored. Records payout status; does not execute a bank transfer.

### POST /api/v1/finance/orders/:id/refunds

**Access:** ADMIN, FINANCE.

**Example JSON body:**

```json
{
  "amountMinor": 25000,
  "reason": "Damaged item adjustment",
  "reference": "REFUND-20261012-001"
}
```

**Success:** 201; `data: Refund`.

id is child VendorOrder UUID. All fields required: positive amountMinor, reason text, reference unique text. Requires DELIVERED, cashReceived=true and no settlementId. Cumulative refunds cannot exceed subtotalMinor−discountMinor; delivery fee is not refundable here. Adjusts payable and proportionally reverses commission. Records an externally handled refund; no payment gateway transfer is executed.

## Notifications

### GET /api/v1/notifications

**Access:** Authenticated.

**Body:** None.

**Success:** 200; `data: Notification[]`, newest 100 owned notifications.

Includes customer delivery PIN notifications. No pagination/unread filter or push/WebSocket endpoint.

### PATCH /api/v1/notifications/:id/read

**Access:** Authenticated.

**Body:** None.

**Success:** 200; `data: {count: 1}` on an owned match, `{count: 0}` otherwise.

id is notification UUID. Sets readAt; does not return the notification object.

## Response field reference

These are scalar response fields, not additional writable fields. Relations appear only where specified in endpoint responses. `?` indicates a nullable value. Datetimes serialize as ISO strings. Creation/update endpoints generally return scalar records without loaded relations.

| Record | Scalar fields |
|---|---|
| Vendor | `id: String`, `ownerId: String`, `name: String`, `slug: String`, `description: String`, `businessType: String`, `city: String`, `zone: String`, `address: String`, `status: VendorStatus`, `commissionBps: Int`, `bankDetails: Json`, `createdAt: DateTime` |
| Category | `id: String`, `name: String`, `slug: String` |
| Product | `id: String`, `vendorId: String`, `categoryId: String`, `name: String`, `slug: String`, `description: String`, `priceMinor: Int`, `stock: Int`, `active: Boolean`, `images: String[]`, `attributes: Json`, `createdAt: DateTime`, `updatedAt: DateTime` |
| Address | `id: String`, `userId: String`, `kind: String`, `firstName: String`, `lastName: String`, `phone: String`, `city: String`, `zone: String`, `street: String`, `building: String`, `apartment: String`, `directions: String`, `latitude: Float?`, `longitude: Float?`, `createdAt: DateTime` |
| CartItem | `userId: String`, `productId: String`, `quantity: Int` |
| WishlistItem | `userId: String`, `productId: String` |
| Coupon | `id: String`, `code: String`, `percentBps: Int`, `maxDiscountMinor: Int`, `minSubtotalMinor: Int`, `maxUses: Int`, `used: Int`, `active: Boolean`, `expiresAt: DateTime` |
| Order | `id: String`, `customerId: String`, `idempotencyKey: String`, `requestHash: String`, `address: Json`, `currency: String`, `paymentMethod: String`, `subtotalMinor: Int`, `discountMinor: Int`, `deliveryMinor: Int`, `totalMinor: Int`, `couponId: String?`, `createdAt: DateTime` |
| VendorOrder | `id: String`, `orderId: String`, `vendorId: String`, `status: OrderStatus`, `subtotalMinor: Int`, `discountMinor: Int`, `deliveryMinor: Int`, `totalMinor: Int`, `commissionMinor: Int`, `payableMinor: Int`, `riderId: String?`, `codCollectedMinor: Int`, `cashReceived: Boolean`, `deliveredAt: DateTime?`, `failureReason: String?`, `latitude: Float?`, `longitude: Float?`, `locationAt: DateTime?`, `settlementId: String?`, `createdAt: DateTime`, `updatedAt: DateTime` |
| OrderItem | `id: String`, `vendorOrderId: String`, `productId: String`, `name: String`, `unitPriceMinor: Int`, `quantity: Int`, `image: String?` |
| OrderEvent | `id: String`, `vendorOrderId: String`, `actorId: String`, `status: OrderStatus`, `note: String?`, `createdAt: DateTime` |
| Shift | `id: String`, `riderId: String`, `status: ShiftStatus`, `startedAt: DateTime`, `endedAt: DateTime?`, `breakStartedAt: DateTime?`, `breakSeconds: Int` |
| Remittance | `id: String`, `riderId: String`, `amountMinor: Int`, `reference: String`, `receivedBy: String`, `createdAt: DateTime` |
| Settlement | `id: String`, `vendorId: String`, `amountMinor: Int`, `status: SettlementStatus`, `reference: String?`, `createdBy: String`, `paidAt: DateTime?`, `createdAt: DateTime` |
| Refund | `id: String`, `vendorOrderId: String`, `amountMinor: Int`, `reason: String`, `reference: String`, `createdBy: String`, `createdAt: DateTime` |
| Notification | `id: String`, `userId: String`, `title: String`, `body: String`, `readAt: DateTime?`, `createdAt: DateTime` |
| Review | `id: String`, `userId: String`, `productId: String`, `rating: Int`, `comment: String`, `createdAt: DateTime` |
| AuditLog | `id: String`, `actorId: String`, `action: String`, `entityId: String`, `metadata: Json`, `createdAt: DateTime` |

PublicUser contains only `id, email, phone, role, firstName, lastName, profile, active, createdAt`; no password hashes, linked subject identifiers, or sessions. Category also returns nullable `image` (asset URL) and `parentSlug` (parent category slug). The public category list adds `productIds` for active approved-vendor products explicitly assigned to that collection; direct and descendant primary-category memberships are included when filtering catalog products. Category has no createdAt field. CartItem and WishlistItem have compound keys and no independent id. PIN hashes and attempt counts are stripped from all order responses. Parent Order responses currently include idempotencyKey and requestHash; integrations should treat these as internal metadata, not IDs. Address in Order is a checkout-time JSON snapshot (without userId), not a live relation.

## Integration walkthrough

1. ADMIN logs in, creates category and vendor, and creates RIDER/DISPATCHER/FINANCE accounts as required. Keep each returned resource ID.
2. VENDOR logs in and creates products with the category UUID and integer prices.
3. CUSTOMER registers/logs in, browses catalog, creates an address matching vendor city/zone, and sets cart quantities with product UUIDs.
4. CUSTOMER posts checkout with addressId and a fresh Idempotency-Key. Save parent `data.id` and each `data.vendorOrders[].id` separately. Retry network failures with the same key and payload.
5. VENDOR reads `/orders`, accepts each child, then marks it ready. RIDER starts a shift. ADMIN/DISPATCHER assigns an available rider to a ready child.
6. RIDER marks pickup, updates location as needed, then delivers using the PIN shown in the CUSTOMER’s notifications and exact child totalMinor. For failed deliveries, dispatch retries or returns the child.
7. FINANCE records COD remittance. Record any refunds before creating a vendor settlement. Process the settlement, then mark it paid with the actual payment reference. Rider can end the shift after active deliveries and outstanding COD are cleared.

### curl examples

```bash
# Public catalog
curl 'http://localhost:4000/api/v1/catalog/products?page=1&limit=20'

# Login (example credentials only)
curl -X POST 'http://localhost:4000/api/v1/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{"identity":"customer@example.com","password":"ExamplePass123!"}'

# Use the returned access token and an actual saved address UUID
curl -X POST 'http://localhost:4000/api/v1/orders/checkout' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: checkout-20261012-001' \
  -d '{"addressId":"11111111-1111-4111-8111-111111111111","paymentMethod":"COD"}'
```

## Current boundaries and setup

- Only the endpoints listed here exist. There are no generic CRUD routes for every database model.
- Online payments, upload endpoints, SMS/OTP endpoints, real-time tracking streams, public vendor signup, and automatic bank payouts are not implemented. COD is the supported checkout method.
- Google/Apple sign-in and reset emails require server provider configuration. See [AUTH_SETUP.md](docs/AUTH_SETUP.md). Fetch `/auth/providers` before displaying enabled provider options.
- Product image URLs must resolve from your deployed frontend/CDN; storing a URL does not upload the image.
- Lists capped at 100 without pagination cannot be made exhaustive by adding page/limit parameters.
- Frontend sample data must be replaced with actual API resources and UUIDs. See [FRONTEND.md](docs/FRONTEND.md) and [README.md](README.md) for setup/context.
- Examples are illustrative; no real credentials or personal data are included.

## Marketplace additions (2026-10-13)

### GET /api/v1/catalog/vendors

**Access:** Public. **Body:** None.

**Query:** page (default 1), limit (default 20, max 100), search (vendor name contains), city, zone (case-insensitive exact match). String filters max 100.

**Success:** 200; `data: {items, total, page, limit}`. Items have `{id,name,slug,description,businessType,city,zone}`. Only APPROVED vendors, sorted by name; owner/bank/commission fields are never included.

### GET /api/v1/catalog/vendors/:id

**Access:** Public. **Body:** None. id is vendor UUID.

**Success:** 200; `data: {id,name,slug,description,businessType,city,zone}`. Missing/suspended vendor returns 404. Fetch its products using `/catalog/products?vendorId=<id>`.

### POST /api/v1/orders/quote

**Access:** CUSTOMER. No Idempotency-Key needed.

```json
{"addressId":"11111111-1111-4111-8111-111111111111","couponCode":"WELCOME10","paymentMethod":"COD"}
```

To quote or purchase only checked cart items, add the same selection to both requests:

```json
{"addressId":"11111111-1111-4111-8111-111111111111","productIds":["22222222-2222-4222-8222-222222222222"],"paymentMethod":"COD"}
```

Product IDs must already be in this customer's cart. Omitting `productIds` uses the entire cart. Quotes do not modify the cart; checkout removes only selected items. A selection containing both cart and non-cart IDs returns 409; an entirely absent selection returns 422 (empty cart).

Same payload validation as checkout: addressId required; productIds optionally selects 1–100 cart product UUIDs; couponCode optional; paymentMethod defaults COD. The result always advertises COD only, even if a different valid payment enum was requested. Unsupported payment methods still fail at checkout.

**Success:** 200; `data: {currency:"PKR", paymentMethods:["COD"], addressId, subtotalMinor, discountMinor, deliveryMinor, totalMinor, vendorOrders}`.

Each quote vendorOrders entry contains `{vendorId,vendorName,subtotalMinor,discountMinor,deliveryMinor,totalMinor,items}`; items contain `{productId,name,quantity,unitPriceMinor,images}`. Quote entries are NOT persisted orders and have no order ID/PIN.

Validates the customer's current cart, owned address, stock, vendor approval, service city/zone and coupon. Same calculations as checkout; no stock reservation, coupon consumption, cart clearing or order creation. The quote is advisory, not a price/stock lock. Requote when inputs change; checkout revalidates atomically. Errors include 404 address, 422 empty cart/invalid coupon/unsupported area and 409 unavailable stock.

### PATCH /api/v1/vendor/profile

**Access:** Approved VENDOR.

```json
{"name":"Gulberg Market","description":"Fresh everyday groceries","address":"Main Boulevard, Building A"}
```

At least one field required. name/address trimmed 1–200; description up to 5,000. All three optional individually. Other fields rejected, including status, commissionBps, ownerId, bankDetails, city and zone. Changes are audited; owner account email uses separate account administration, not this route.

**Success:** 200; `data: Vendor`. Never accepts another vendor's ID; derives ownership from session.

For a screen-by-screen implementation status, see [IMPLEMENTATION_AUDIT.md](docs/IMPLEMENTATION_AUDIT.md).

Category filters now include products assigned to descendant categories and explicit imported collection memberships. Catalog category responses include optional image and parentSlug. See [catalog seed instructions](prisma/CATALOG_SEED.md) for importing the original storefront products.
