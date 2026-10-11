# Authentication setup

The storefront and vendor portal now use the backend for password login, signup (customers only), logout, account profile updates, social authentication, and password reset. Demo OTP/password acceptance has been removed. Vendor dashboard access requires a valid vendor session. Dashboard order/product data is still the existing preview; this change does not connect all commerce screens.

## Local services

- API: `cd server && npm run dev` (port 4000).
- Storefront: `cd web && npm run dev` (port 3000).
- Vendor: `cd vendor_web && npm run dev` (port 3001).
- Both Next.js servers use server-only `API_URL`, default `http://localhost:4000/api/v1`.
- Database migration: `cd server && npm run db:generate && npm run db:migrate`.

Next.js proxies `/api/auth/*` to the backend and stores access/refresh tokens in HTTP-only, SameSite=Lax cookies. Separate customer/vendor cookie names avoid mixing sessions on localhost. Production requires HTTPS for Secure cookies. Mutating proxy requests require a same-origin Origin header. Secrets and refresh tokens are never returned to frontend JavaScript.

## Password-reset email

Set these in **server/.env**, not in public frontend variables:

```dotenv
WEB_URL=http://localhost:3000
VENDOR_WEB_URL=http://localhost:3001
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM=Barwaqt <no-reply@your-verified-domain.example>
```

Use port 465 with SMTP_SECURE=true when required by your email service. With Gmail, use an app password where supported, not your normal account password. Configure the sender/domain in your email provider. Restart the API after editing .env (Nodemon watches it).

Forgot-password accepts an email address. It returns the same confirmation for an existing eligible account and an unknown email. It sends a 20-minute reset link only for matching customer/vendor accounts. Tokens are stored hashed, cannot be reused, and a successful reset revokes every existing session and outstanding reset token for that user. Reset tokens use URL fragments so they are not sent in page requests or Referer headers. Requesting a reset never returns a token in the API response.

If SMTP is not configured, the API responds with a clear 503 error; it never claims an email was sent. A local SMTP capture server is used in tests, not a live recipient.

## Google

1. In Google Cloud, configure OAuth consent and create a **Web application** client ID.
2. Add the exact origins to **Authorized JavaScript origins**: `http://localhost:3000` and `http://localhost:3001`, plus your deployed HTTPS origins. Add test users if your consent app is in testing mode.
3. Set `GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com` in server/.env and restart the API.
4. Reopen the sign-in form. The official Google button appears when configured.

This uses Google Identity Services ID-token mode; no Google client secret is needed. The backend verifies signature, issuer, audience, expiry, verified email, and the one-time nonce before creating a Barwaqt session. New social registrations are CUSTOMER only.

Existing users must first log in with their password and explicitly link their matching-email Google identity. Storefront: Profile → Account & sign-in providers. Vendor: Settings → Link a sign-in provider. Email matching alone never silently links an account. Administrator-created vendors cannot be bypassed through social signup.

Reference: [Google setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [server-side verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Apple

Set `APPLE_CLIENT_ID` to your Apple Services ID and `APPLE_REDIRECT_URI` to the registered return URL. Configure Sign in with Apple in the Apple Developer account, register/verify your web domain and HTTPS return URL. Apple generally requires a real HTTPS domain rather than plain localhost; use a registered development domain for testing. The frontend uses Apple's official popup library; the backend validates its ID token against Apple's published signing keys, issuer, audience, verified email and one-time nonce.

Existing-account linking requires the same email, so an Apple private-relay email will not match a vendor's registered address. Use the registered-email identity or continue with password login. A provider cannot be linked to two accounts. Apple credentials remain optional: an unconfigured button is visibly unavailable rather than pretending to sign in.

## API additions

| Endpoint | Input | Result |
|---|---|---|
| GET /api/v1/auth/providers | None | Public client IDs, Apple return URL, email availability; no secrets |
| POST /api/v1/auth/forgot-password | `{email,portal:"customer"|"vendor"}` | Generic email confirmation |
| POST /api/v1/auth/reset-password | `{token,newPassword}` | Changes password and revokes sessions |
| POST /api/v1/auth/challenge | `{provider:"google"|"apple"}` | Five-minute nonce |
| POST /api/v1/auth/social | `{provider,credential,nonce,portal}` | Verified provider session |
| POST /api/v1/auth/link-provider | Same as social + Bearer session | Explicitly links matching-email provider |

The application never accepts a frontend-decoded social identity as proof. New local accounts have no verified-email badge; SMS/OTP authentication and email-verification signup are not implemented here.

## Verification limits

Automated tests cover actual local SMTP delivery, reset expiry/reuse, session revocation, role restrictions, duplicate-provider protection and nonce handling. Google verification is mocked at the official library boundary in those tests; a real Google/Apple login and external email delivery require your credentials and consent screens. No live-provider success is claimed without that configuration.
