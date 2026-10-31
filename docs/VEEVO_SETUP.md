# Veevo SMS authentication and marketing

The server sends SMS through `POST https://api.veevotech.com/v3/sendsms` and WhatsApp templates through `POST https://wa-api.veevotech.com/wa/v1/send_message`.
Provider references: [SMS](https://www.veevotech.com/api-docs/sms), [WhatsApp](https://www.veevotech.com/api-docs/whatsapp).

## Configuration

Add these to the **API server's** `.env` (never to a frontend or `NEXT_PUBLIC_*` variable):

```dotenv
VEEVO_SMS_API_KEY=dummy_replace_with_veevo_sms_key
VEEVO_SMS_SENDER=
VEEVO_WHATSAPP_API_KEY=dummy_replace_with_veevo_whatsapp_hash
```

Dummy/empty keys disable sending and return a configuration error; they do not simulate a successful OTP. Replace the SMS key and WhatsApp hash with the credentials from the respective Veevo services. Leave the sender empty to use Veevo's default, or specify your approved sender ID. WhatsApp campaigns currently support approved text-only templates, one optional header variable and ordered body variables. The same variables apply to each recipient. SMS login never uses WhatsApp.

Deploy the API migration `20261029120000_phone_otp_marketing` before the updated frontends. The existing server deployment script runs migrations automatically. For a manual/local installation:

```bash
npm run db:generate
npm run db:migrate
```

Restart the API after changing its environment (`pm2 restart barwaqt-api --update-env` on the current VPS). The campaign worker starts with `npm start` / `src/server.js`; no separate worker process is needed. Keep the API process running to process queued campaigns.

## Authentication

- Email/password signup and login continue to work.
- Customer phone signup uses `/auth/phone-signup`, then `/auth/phone-verify`. No email is required. The account is created only after successful SMS verification.
- Customer and admin-registered vendor phone login uses `/auth/phone-login`, then `/auth/phone-verify`. This is passwordless SMS login; the signup password remains usable for password/account-management flows.
- Admin and rider accounts cannot use these public SMS endpoints.
- Pending codes are scoped to a random challenge ID and phone, HMAC-hashed, expire after five minutes, and allow five guesses. Each phone can request one code per minute and five codes per hour across signup/login/resends. Existing per-action IP rate limits also apply. Resending replaces the challenge and invalidates the old code.
- `03001234567`, `923001234567`, and `+923001234567` normalize to `+923001234567`. Legacy variants are supported, but conflicting existing accounts require support to resolve them.
- `User.email` is nullable for phone accounts. `phoneVerifiedAt` tracks proof of phone ownership. Frontends should display `email ?? phone` as the account identity. Phone-only accounts cannot replace their login number from the ordinary profile form.
- SMS failure never creates an active account or a usable verification challenge. Unknown/disabled/wrong-role login requests return the generic challenge response without sending SMS.

## Admin campaigns

In Admin → Marketing, enter a campaign name, recipient numbers (one per line), and choose SMS, WhatsApp, or both. Maximum 100 recipients; duplicates are removed. For WhatsApp, use the approved template ID from Veevo. Admin must click **Send campaign**; merely opening the page sends nothing.

Campaign creation uses an `Idempotency-Key` so retrying the same request does not send twice. A durable database queue records one message per recipient/channel. Statuses:

- `QUEUED`: waiting for the worker.
- `SENDING`: claimed by a worker.
- `ACCEPTED`: Veevo acknowledged the submission; not proof of handset delivery.
- `FAILED`: not configured at dispatch time.
- `UNKNOWN`: timeout, rejection, malformed response, or interrupted send; check the provider portal before sending again.

There are no automatic retries of uncertain messages. Accepted messages are not automatically re-sent on process restart. This implementation does not ingest delivery webhooks or claim delivery/read confirmation; use the Veevo portal for that information.

## Verification

Automated tests mock provider calls; no real SMS/WhatsApp messages are sent by the test suite. A final live test requires real Veevo credentials, balance, approved sender/template and a recipient you control. This remains a deployment step; dummy credentials cannot verify live delivery.
