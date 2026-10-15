# Marketplace operations and central payments

## Money flow

Customer → Barwaqt collection account → vendor settlement.

- Bank/JazzCash/Easypaisa: admin configures platform accounts in Admin → Payments. Customer chooses an enabled method, places an order, transfers the exact amount, and submits the transaction reference. Admin/finance verifies receipt against the real statement. Vendors cannot accept prepaid orders before verification.
- COD: rider collects the exact shipment amount and remits it to the platform through Finance. Prepaid deliveries collect zero COD but still require the customer PIN.
- Settlement: only delivered, reconciled shipments qualify. Vendor commission and refunds reduce payable. Admin records the actual external payout reference. Negative adjustments from post-settlement refunds reduce a future payout.
- Cancelled prepaid shipments require a full refund including allocated delivery charges. The payment remains REFUND_DUE until the external refund is recorded.

These wallet/bank flows are manual transfers, not automated merchant checkout. Account configuration starts disabled, with no seeded destination. Do not enter personal vendor accounts. Automatic wallet gateway confirmation/webhooks require a separate merchant integration. No raw card data is collected. Finance entries record transfers already performed externally; they do not initiate bank payments.

Unverified checkouts reserve stock. Customers may cancel NEW shipments; admin can cancel unpaid orders from Payments to release stock/capacity. No unattended payment-expiry worker is included. If a transfer arrives after cancellation, review its submitted reference and record the required refund.

## Setup

```sh
cd server
npm run db:generate
npm run db:migrate
npm run dev
```

Migrations are additive; catalog images and existing layouts are retained. Each frontend's API_URL must point to the same API.

UPLOAD_DIR defaults to server/uploads. Keep this on persistent storage and back it up with PostgreSQL; multiple API instances need a shared volume. Upload JSON contains raw base64 (no data URL prefix), maximum decoded size 5 MB. PNG/JPEG/WebP images are public; PDF files require owner/admin authentication. The Next.js /api/media/:id routes proxy the same storage for all three frontends. Product and category editors save returned media URLs.

RETURN_WINDOW_DAYS defaults to 14. Full-shipment customer returns support request, approval/rejection, physical receipt, optional restock and recorded external refund. Collection is coordinated by operations; reverse-rider assignment is not automated.

Admin Delivery Slots controls area, future time window and capacity. Booked windows cannot move; cancelled complete checkouts release capacity. Dispatchers and vendors see the booked window. All timestamps are stored as UTC and shown in browser local time.

See complete_api.md and postman/ for endpoints, authentication, payloads and response shapes. Backend integration tests require NODE_ENV=test and a dedicated DATABASE_URL containing barwaqt_test. Never run test fixtures against the application database.
