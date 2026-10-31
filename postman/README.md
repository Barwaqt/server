# Barwaqt Postman / mobile integration

## Import and configure

1. Import `Barwaqt.postman_collection.json` and `Barwaqt.local.postman_environment.json` into Postman.
2. Select the imported environment. `baseUrl` is the server origin, initially `http://localhost:4000` (do not append `/api/v1`; requests include it).
3. Duplicate the environment for Customer, Vendor, Admin, Rider, Dispatcher and Finance as needed. Set email/password for that account in its environment. No real credentials are bundled. Vendors/staff must first be created by an admin; use the server seed instructions to bootstrap the admin.
4. Send Auth → POST /api/v1/auth/login. A successful response saves accessToken and refreshToken. Protected requests use the selected environment's accessToken. Public requests explicitly use No Auth.
5. Read each request's Description for allowed roles, fields, responses and business rules. `../complete_api.md` is the full contract.

This is an integration reference, **not a sequential Run All test suite**. Requests create, update, cancel and financially record data. Choose requests deliberately on a development server. Success checks expect 2xx; intentionally invalid/unauthorized calls will fail those checks as expected. No requests have been sent merely by generating these files.

## Resource variables

| Variable | Meaning / source |
|---|---|
| accessToken, refreshToken | Captured by successful login/register/social/refresh |
| addressId | Captured when the customer creates an address |
| categoryId | Captured when the admin creates a category |
| vendorId | Captured when the admin creates a vendor; vendor business UUID, not owner user UUID |
| productId | Captured when the vendor creates a product |
| riderId | Captured when the admin creates staff with role RIDER |
| customerOrderId | Parent checkout order UUID, automatically captured |
| vendorOrderId | First child UUID from checkout; select the correct child for each vendor; used by all order actions |
| settlementId | Captured when finance creates a settlement |
| notificationId | Copy from authenticated GET /notifications |
| idempotencyKey | Generated before checkout if empty; retain for retries; clear or replace before a NEW purchase |
| proofImage | `/api/media/<upload UUID>` of the drop-off photo the rider uploaded before confirming delivery |
| cashCollectedMinor | Set to the exact child order totalMinor, numeric integer paisa |
| provider, credential, nonce | google/apple, SDK-issued signed ID token, captured challenge nonce |
| resetToken | Token from reset email URL fragment; never a login token |
| portal | customer or vendor |

Variables belong to each selected environment. When switching roles, copy only necessary resource IDs between environments; never copy another role's token. Before POST /admin/vendors or /admin/staff, edit the example credentials, phone and unique slug/email. Other example JSON bodies are editable samples too; unique references and slugs must change when creating a new record.

## Typical commerce sequence

1. Admin: create category → vendor → rider.
2. Vendor: login → create product with real categoryId, priceMinor, stock, image URLs.
3. Customer: register/login → browse catalog → create address matching vendor city/zone → PUT cart product quantity → POST quote → POST checkout.
4. Vendor: accept → ready using its child order ID.
5. Rider: start shift. Admin/dispatch: assign that rider. Rider: pickup → POST /uploads (IMAGE) → deliver with that `/api/media/<id>` URL as proofImage and exact COD amount.
6. Finance/admin: record remittance → create settlement → mark processed → mark paid with actual reference.

For two vendors, repeat vendor preparation/dispatch/delivery per child. Refunds must be recorded after reconciliation and before settlement. Finance endpoints record actual external money movement; they do not initiate payment-provider transfers.

GET /orders/:id has separate customer-parent and staff/vendor-child examples. Generic order action uses `accept`; named variants show all other actions. Rider shift variants cover start/break/resume/end. Default settlement PATCH illustrates PAID; run the PROCESSED variant first. All constraints remain enforced by the server.

## Mobile implementation notes

- Call the Node API directly, not the Next.js `/api/auth` cookie proxy. Use `Authorization: Bearer <accessToken>` and JSON bodies.
- Store tokens in the operating system's protected credential store. On expiry, serialize refresh requests, replace both tokens, then retry the original request once. If refresh fails, clear credentials and require login. Avoid concurrent reuse of a rotated refresh token.
- `expiresIn` is seconds. Logout clears the local session and revokes it server-side. Password reset/change revokes all sessions.
- Handle 204 without attempting JSON parsing. Other successes normally use `data`; system endpoints are unwrapped. Errors normally use `error.message`, optional `error.details`, and requestId. Rate-limit responses may be plain text.
- Prices are PKR integer paisa. Do not calculate payable totals on the device: use quote and the final checkout response. A quote is not a stock/price reservation.
- A physical phone's localhost refers to the phone, not your computer. Use the development computer's reachable LAN address. Android Emulator commonly reaches the host at `10.0.2.2`; use a reachable configured host for other environments. Production must use your HTTPS API URL. Configure development networking/platform policies as necessary.
- Google/Apple credential is a provider SDK ID token with the server challenge nonce. An OAuth access token or arbitrary placeholder will fail. Provider console configuration is required; this collection cannot simulate provider sign-in.
- Missing functionality is documented in `../docs/IMPLEMENTATION_AUDIT.md`. This collection covers existing endpoints; it does not implement online payments, gift cards, warehouse management or UI integration.

## Companion documentation

- [Complete API contract](../complete_api.md)
- [Authentication provider setup](../docs/AUTH_SETUP.md)
- [Current implementation gaps](../docs/IMPLEMENTATION_AUDIT.md)

## Operations requests

The “Marketplace and operations additions” folder covers new management, scheduling, returns and uploads. Set `resourceId` to the resource UUID required by the request path (category, coupon, slot, return or upload). Copy IDs from successful creation responses. Replace illustrative UUIDs in JSON bodies with real records. The main API reference explains which IDs belong to parent orders versus vendor shipments.

For scheduled checkout, add the same `deliverySlotId` to quote and checkout. For returns, create as CUSTOMER, approve/receive as ADMIN or DISPATCHER, and record the completed external refund as ADMIN or FINANCE. Upload data is base64 without a data URL prefix. Binary image download is public; PDF download needs the owner's/admin bearer token. Finance requests record externally completed payments; they do not transfer money.
