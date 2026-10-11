# REST API reference

Base path `/api/v1`. JSON responses use `{ "data": ... }`. Failures use `{ "error": { "message": "...", "details": [...] }, "requestId": "..." }`. Validation failures are 422; authentication 401; authorization 403; missing resources 404; state conflicts 409. Online checkout is intentionally 503 until a real payment integration is configured.

Protected endpoints require `Authorization: Bearer <accessToken>`. IDs are UUIDs. All amounts are integer PKR minor units (paisa). Listings that accept query pagination use `page=1&limit=20`, maximum limit 100. Read request schemas in `src/validators` for authoritative field limits.

## Auth

| Method | Path | Access / body |
|---|---|---|
| POST | /auth/register | Public; `{email,password,firstName,lastName?,phone?}`; customer only |
| POST | /auth/login | Public; `{identity,password}` (identity = email or phone) |
| POST | /auth/refresh | Public; `{refreshToken}`; rotates refresh token |
| GET | /auth/me | Any authenticated user |
| POST | /auth/logout | Any authenticated user; revokes current session |
| POST | /auth/change-password | `{currentPassword,newPassword}`; revokes all sessions |

Register/login return `{accessToken,refreshToken,expiresIn,user}`. Passwords require 12–72 characters. Public registration rejects role injection.

## Administrator

| Method | Path | Body / purpose |
|---|---|---|
| POST | /admin/vendors | Creates VENDOR user and approved vendor atomically |
| GET | /admin/vendors | Paginated vendor/owner list |
| PATCH | /admin/vendors/:id | `{status?:"APPROVED"|"SUSPENDED",commissionBps?:1000}` |
| POST | /admin/staff | `{email,password,firstName,lastName?,phone?,role:"RIDER"|"DISPATCHER"|"FINANCE"}` |
| POST | /admin/categories | `{name,slug}` |
| POST | /admin/coupons | `{code,percentBps,maxDiscountMinor,minSubtotalMinor?,maxUses,expiresAt}` |
| GET | /admin/reports | Aggregate orders, delivered sales, commissions, refunds and COD |
| GET | /admin/audit-logs | Most recent 100 administrative/financial/order actions |

All these routes require ADMIN. Vendor creation example:

```json
{
  "email": "vendor@example.com",
  "password": "use-a-unique-strong-password",
  "phone": "+923001234567",
  "firstName": "Tariq",
  "lastName": "Mehmood",
  "name": "Sonex Cookware",
  "slug": "sonex-cookware",
  "businessType": "Retail",
  "description": "Kitchen and cookware",
  "city": "Mardan",
  "zone": "Central",
  "address": "Main Market Road",
  "commissionBps": 1000
}
```

1000 basis points = 10%. Vendor suspension removes products from public browsing/checkout and blocks management actions. Existing order history remains readable.

## Catalog and vendor product management

| Method | Path | Access |
|---|---|---|
| GET | /catalog/categories | Public |
| GET | /catalog/products | Public; page, limit, search, categoryId, vendorId, city, zone |
| GET | /catalog/products/:id | Public; active approved product |
| GET | /vendor/profile | Approved vendor |
| GET | /vendor/dashboard | Approved vendor summary |
| GET | /vendor/products | Vendor-owned products; page, limit |
| POST | /vendor/products | Approved vendor |
| PATCH | /vendor/products/:id | Owner; partial product body (set active=false to archive) |
| GET | /vendor/settlements | Owner's settlement ledger |

Product body: `{name,slug,categoryId,description?,priceMinor,stock,images?:string[],attributes?:{[key]:string},active?:boolean}`. Vendor ID always comes from the authenticated account. Images accept HTTPS URLs or single-slash local paths; upload/storage service is not connected.

## Customer

| Method | Path | Body / purpose |
|---|---|---|
| PATCH | /customer/profile | `{firstName?,lastName?,phone?,profile?:{birthday?,gender?,nationality?,tourist?}}` |
| GET / POST | /customer/addresses | List / create |
| PUT / DELETE | /customer/addresses/:id | Replace / remove own address |
| GET | /customer/cart | Own items, products and vendors |
| PUT | /customer/cart/:productId | `{quantity:0..99}`; zero removes item |
| GET | /customer/wishlist | Own favourites |
| PUT / DELETE | /customer/wishlist/:productId | Add / remove favourite |
| PUT | /customer/reviews/:productId | `{rating:1..5,comment}`; delivered purchasers only |

Address body: `{kind?:"Home"|"Work"|"Other",firstName,lastName?,phone,city,zone,street,building?,apartment?,directions?,latitude?,longitude?}`. All require CUSTOMER and enforce ownership.

## Checkout and orders

```http
POST /api/v1/orders/checkout
Authorization: Bearer <customer-access-token>
Idempotency-Key: checkout-unique-attempt-001
Content-Type: application/json

{"addressId":"<uuid>","paymentMethod":"COD","couponCode":"WELCOME10"}
```

Omit couponCode if none; coupons must first be created by an administrator. Returns the parent order and separate vendorOrders/items. Checkout consumes the current cart. Repeating the same key/body returns the existing order; reusing it with different body returns 409. Insufficient stock rolls back the entire checkout.

| Method | Path | Purpose |
|---|---|---|
| GET | /orders | Customer: own parent orders. Vendor/rider: scoped child orders. Admin/dispatcher/finance: all child orders. Supports pagination; child lists support status. |
| GET | /orders/:id | Customer passes parent ID; other roles pass child ID |
| POST | /orders/:vendorOrderId/actions | `{action,reason?,pin?,cashCollectedMinor?}` |
| POST | /orders/:vendorOrderId/assign | ADMIN/DISPATCHER; `{riderId}` |
| POST | /orders/:vendorOrderId/reset-pin | ADMIN/DISPATCHER; customer receives new PIN notification |
| PATCH | /orders/:vendorOrderId/location | Assigned RIDER; `{latitude,longitude}` while assigned/in transit |

Actions:

| Action | Actor | From → To |
|---|---|---|
| accept | Owning vendor | NEW → PREPARING |
| reject | Owning vendor; reason required | NEW → CANCELLED |
| ready | Owning vendor | PREPARING → READY |
| cancel | Owning customer or admin | NEW → CANCELLED |
| pickup | Assigned rider | ASSIGNED → PICKED_UP |
| deliver | Assigned rider; PIN and exact cashCollectedMinor | PICKED_UP → DELIVERED |
| fail | Assigned rider; reason required | ASSIGNED/PICKED_UP → FAILED |
| retry | Admin/dispatcher | FAILED → ASSIGNED (same rider) |
| return | Admin/dispatcher; reason required | FAILED → RETURNED |

Delivery PIN attempts are persisted even when verification fails. After five wrong attempts, dispatch must issue a fresh PIN. Order status events provide polling-based tracking; GPS is stored on the vendor order with locationAt. No WebSocket/SMS delivery is implied.

## Riders, finance and notifications

| Method | Path | Access / body |
|---|---|---|
| GET | /rider/shifts | RIDER own shifts; ADMIN/DISPATCHER all; latest 100 with workedSeconds |
| POST | /rider/shifts | RIDER; `{action:"start"|"break"|"resume"|"end"}` |
| POST | /finance/remittances | ADMIN/FINANCE; `{riderId,amountMinor,reference}`; record cash actually received |
| GET | /finance/settlements | ADMIN/FINANCE; latest 100 |
| POST | /finance/settlements | ADMIN/FINANCE; `{vendorId}`; reserve all eligible un-settled deliveries |
| PATCH | /finance/settlements/:id | ADMIN/FINANCE; `{status:"PROCESSED"|"PAID",reference?}`; paid requires reference |
| POST | /finance/orders/:id/refunds | ADMIN/FINANCE; child ID; `{amountMinor,reason,reference}`; record an external refund |
| GET | /notifications | Any role, own latest 100 notifications |
| PATCH | /notifications/:id/read | Any role, own notification only |

Settlements and refunds require reconciled cash. These record externally completed financial operations and do not connect to banking APIs. PIN notification content is visible only to the order's customer.
