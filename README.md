# SUNNY SPORT CLUB — Football Field Booking Management

The Sunny Sports Club logo is stored locally at `public/sunny-sport-club.jpg` and is used in the app header, footer, and browser icon. Standard-size PNG icons generated from that JPG are used for Android/iOS PWA installation.

A responsive, bilingual (English and Khmer) booking and admin application for a football field business in Cambodia. Booking prices are displayed in USD and approximate Cambodian riel. Booking times and opening hours are displayed in 12-hour AM/PM format; settings and APIs retain 24-hour time values for reliable scheduling. The language switch is available on both customer and admin pages; the selection is remembered in the browser. The first release uses SQLite for a simple local setup, Prisma migrations, Next.js route handlers, and a server-rendered API boundary for all private actions.

## Requirements

- Node.js 20 LTS (Node 18.18+ is the minimum supported by this Next.js version)
- npm
- VS Code

## Run locally in VS Code

1. Open the `system football` folder in VS Code.
2. In the integrated terminal, run:

   ```powershell
   npm install
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   ```

3. Edit `.env` and replace `SESSION_SECRET`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD` with private values. Generate a session secret in PowerShell with:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Keep `.env` private; it is excluded from Git.
4. Create the local database from the checked-in migration and load sample football fields:

   ```powershell
   npm run db:deploy
   npm run db:seed
   ```

   For schema changes during development, create a new migration with `npm run db:migrate -- --name describe_change`, then commit the generated migration folder.
5. Start the app:

   ```powershell
   npm run dev
   ```

6. Open <http://localhost:3000>. Customers create an account with their name, email address, phone number, and password before booking. Passwords are stored as scrypt hashes. Configure an email and/or SMS provider below to enable password recovery. Administrator sign-in remains at the bottom of the public page; use the values in `.env`.
7. To open the running development app from a phone on the same Wi-Fi, run `npm run dev:network` instead and open `http://<computer-local-IP>:3000` on the phone (for example, `http://192.168.1.4:3000`). Keep the terminal running. If Windows blocks the connection, only allow Node.js/port 3000 on a trusted Private network; public Wi-Fi or guest networks may block device-to-device access. This local HTTP address is for testing the website and does not enable PWA installation; phone installation requires a public HTTPS deployment.
8. Run unit tests and a production build:

   ```powershell
   npm test
   npm run typecheck
   npm run build
   ```

## What is included

- Customer account creation and sign-in with a name, password, email address, and phone number.
- Password recovery sends a short-lived code to the email address or phone number entered; configure SMTP for email and Twilio for phone recovery.
- Authenticated booking form with field, Cambodia-local future date, 30-minute start-time choices, 1–6 hour durations, customer details from the account, notes, and live totals.
- Admin field management supports adding fields, changing each hourly rental rate to cent precision (for example, $20.50/hour), and removing/restoring fields from public booking without deleting historical reservations.
- Booking fees are configurable in Settings in KHR, converted to USD using the configured USD/KHR rate, and included in each saved booking total. The default fee is ៛5,000 per booking. Each booking preserves the fee amount that applied when it was created.
- Public availability checks and a database unique constraint on each field/date/half-hour slot. The reservation and all slot claims are written in one transaction, so overlapping requests cannot both reserve a slot.
- Admin overview, bookings search/filter/pagination, schedule, fields and hourly rates, payment review, customer history, and settings.
- Booking cancellation, rescheduling, failed-payment handling, and manually recorded refunds. Reservations require a 10% deposit of the full booking total; paid revenue tracks verified deposit amounts.
- Customers can review bookings saved in their current browser and cancel unpaid bookings. Clearing customer history removes its access tokens from that browser only; records remain available to administrators and reports.
- Customer booking access uses an unguessable per-booking token; only its one-way hash is stored in the database. Newly created customer reservations are saved in that browser for later review/cancellation.
- The field schedule shows only payment-verified, confirmed bookings. Unpaid reservations remain held to prevent double booking and are reviewed in the Payments section.
- Daily, trailing-seven-day, and month-to-date revenue reports, using Cambodia time (`Asia/Phnom_Penh`).
- HTTP-only signed admin and customer session cookies, password hashing with scrypt, expiring one-use password reset codes, origin checks for mutations, input validation, rate limits, and server-only integration secrets.
- Telegram notifications for new bookings, verified/failed/refunded payments, cancellation, and rescheduling. If Telegram is unavailable, delivery failure is logged and surfaced in the administrator UI rather than undoing a saved booking.
- Tests for time-slot overlap, price calculation, payment state transitions, and Telegram delivery behavior.
- Installable responsive PWA for Android and iOS home screens, as well as normal web access. Booking and admin actions require an internet connection.

## Install on phones and tablets

The same website can be installed as a Progressive Web App (PWA); no separate app-store release is included.

- Android: open the deployed HTTPS website in Chrome and choose **Install app** or **Add to Home screen** from the browser menu.
- iPhone/iPad: open the deployed HTTPS website in Safari, tap **Share**, then **Add to Home Screen**.
- Desktop and mobile browsers can continue to use the website directly.

The PWA uses the same server and database as the website. Keep the app hosted over HTTPS for installation on real devices; bookings, payments, and admin features are online-only.

## ABA Bank / KHQR payment setup

This codebase intentionally runs **manual KHQR mode** until an official ABA or supported KHQR provider merchant account, API credentials, and callback-verification requirements are supplied. Set:

- `KHQR_IMAGE_URL` to the image URL for your valid official merchant KHQR (optional).
- `KHQR_PAYMENT_URL` to your trusted provider-hosted payment link (optional).
- `KHQR_PAYMENT_INSTRUCTIONS` to your customer instructions.

The booking page calculates a 10% deposit of the full booking total, shows it beside the full booking price, and displays a QR code that opens the configured PayWay payment link. The static link may not prefill the deposit amount; customers must confirm the PayWay page shows the exact deposit before paying. The provided link is not a signed payment callback, so a successful redirect cannot verify payment. An administrator must independently verify receipt of the 10% deposit in PayWay before selecting **Verify**; this confirms the booking. The app records the verified deposit as the amount received and does not track a remaining balance. It does not simulate payment success, accept screenshot uploads, or collect banking credentials. Refund status is recorded only after an administrator confirms a refund was actually processed.

To add automatic ABA/provider payments later, implement the provider's documented server-side create-payment and signed callback/verification flows; never put those credentials in browser code. Do not enable automatic confirmation until signature verification and idempotency have been tested against provider documentation/sandbox.

## Customer password recovery email and SMS setup

The recovery flow asks the customer to select email or SMS, sends a server-generated six-digit code, verifies it, and then grants a single-use, short-lived reset authorization. Codes expire in **5 minutes**, are stored only as HMAC hashes, and are limited to five verification attempts. Reset authorizations expire after 10 minutes, are stored as hashes, cannot be reused, and a successful reset increments the account session version to revoke existing customer sessions. Email and SMS requests use the same generic response for registered and unknown contacts.

### Select and configure email delivery

Choose one email provider explicitly; the app never silently falls back. Set `EMAIL_PROVIDER` to `resend`, `smtp`, or `infobip`, then configure the corresponding server-only credentials. `EMAIL_FROM` is the canonical sender setting for Resend and SMTP. Existing provider-specific sender names remain supported (`RESEND_FROM_EMAIL` for Resend and `SMTP_FROM` for SMTP); Infobip email uses `INFOBIP_FROM_EMAIL`.

```dotenv
EMAIL_PROVIDER="resend"
EMAIL_FROM="SUNNY SPORT CLUB <password-reset@mail.your-domain.com>"
RESEND_API_KEY="re_your_private_api_key"
```

For Resend, the implementation calls the Resend HTTP API directly with server-side `fetch`; no Resend SDK dependency is used. It reads `RESEND_API_KEY` and `EMAIL_FROM` (or legacy `RESEND_FROM_EMAIL`). Create an API key, add a domain or subdomain that you own, publish Resend's DNS records, and wait for domain verification. Use a sender address on that verified domain. Do not expect production delivery to work until the sending domain is approved.

For SMTP, use your mail provider's server details and an app-specific password where supported:

```dotenv
EMAIL_PROVIDER="smtp"
EMAIL_FROM="SUNNY SPORT CLUB <password-reset@your-domain.com>"
SMTP_HOST="smtp.your-provider.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="your-smtp-username"
SMTP_PASSWORD="your-private-smtp-password"
```

SMTP also accepts the existing sender variable `SMTP_FROM` if `EMAIL_FROM` is unset. `SMTP_PORT` must be a valid port; `SMTP_SECURE` is optional and defaults to `false`.

For Infobip Email API (which does not require `EMAIL_FROM`):

```dotenv
EMAIL_PROVIDER="infobip"
EMAIL_FROM="SUNNY SPORT CLUB <password-reset@your-domain.com>"
INFOBIP_BASE_URL="eewd32.api.infobip.com"
INFOBIP_API_KEY="your-newly-rotated-private-api-key"
INFOBIP_FROM_EMAIL="password-reset@your-verified-domain.com"
```

In the Infobip portal, confirm that Email API is enabled for the account and that the sender address/domain is verified and approved for sending. The configured base URL must be the account's Infobip API hostname (hostname only, without `https://` or a path). The API key is sent only in a server-side `Authorization: App ...` header and is never placed in browser code or logged. Provider choice is controlled only by `EMAIL_PROVIDER`; credentials for other providers are not used as fallbacks.

The API key previously pasted into chat should be revoked in Infobip and replaced with a fresh key. Do not copy the exposed key into `.env`; enter the replacement directly into the local file or hosting secret manager.

The Forgot Password API writes a server-side diagnostic containing only the selected provider and missing variable names. It never includes values. A configuration failure is also categorized in the server logs as incomplete configuration, provider authentication failure, provider rejection, network failure, timeout, or invalid provider response. Do not share full logs publicly if other application log entries contain personal information.

### Resend domain setup

1. Create a Resend account and API key.
2. Add a domain or dedicated subdomain you own in Resend and publish the DNS records Resend provides. Wait until Resend verifies the domain; public/free email domains cannot be used as sending domains.
3. Use a sender address on that verified domain and set these values in the private server `.env`:

   ```dotenv
   EMAIL_PROVIDER="resend"
   EMAIL_FROM="SUNNY SPORT CLUB <password-reset@mail.your-domain.com>"
   RESEND_API_KEY="re_your_private_api_key"
   ```

4. Restart Next.js. The email credentials and Resend API call remain server-only. Resend charges according to its current account plan and usage.

Official setup: [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction) and [send email API](https://resend.com/docs/api-reference/emails/send-email). SMTP and Infobip are separate explicitly selected alternatives, not automatic fallbacks.

### Cambodian SMS with Infobip

The app uses Infobip's SMS API endpoint `POST /sms/3/messages` (not its Email API), following the [official Infobip SMS Messages API](https://www.infobip.com/docs/api/channels/sms/sms-messages), with the account API hostname and the same API key used for Infobip email if enabled. Cambodian local numbers are normalized to `+855`; the API request uses the international digits without the `+`. Configure:

```dotenv
SMS_PROVIDER="infobip"
INFOBIP_BASE_URL="your-account.api.infobip.com"
INFOBIP_API_KEY="your-private-api-key"
INFOBIP_SENDER="your-approved-sender-id"
```

Obtain the API hostname, API key, and sender identity from your Infobip portal. Confirm SMS is enabled and funded, register/verify the required sender ID or number for Cambodia, and check account destination restrictions and current Cambodia pricing before production. Trial accounts may restrict delivery to verified recipients. The app only reports provider acceptance when Infobip returns an accepted status; acceptance is not a guarantee of handset delivery. SMS may incur charges.

To test before production, use an Infobip-approved/verified test handset that you control, with the account's trial or test restrictions enabled where available. Configure these server-side values in `.env`, select `SMS_PROVIDER="infobip"`, and restart Next.js. Register that same test number on a test customer account, request SMS from **Forgot password?**, then inspect the handset and Infobip delivery report. The API intentionally never returns the OTP to the browser. A real request can incur charges; automated tests mock Infobip and never send SMS. The existing recovery endpoint rate-limits requests to 3 per account/identifier per hour, 10 per IP per hour, and 100 requests per hour globally.

### Optional Twilio SMS alternative

Set `SMS_PROVIDER="twilio"` instead and configure:

```dotenv
SMS_PROVIDER="twilio"
TWILIO_ACCOUNT_SID="AC..."
TWILIO_AUTH_TOKEN="your-private-auth-token"
TWILIO_PHONE_NUMBER="+your-twilio-sender-number"
TWILIO_SMS_ENABLED="false"
```

Keep `TWILIO_SMS_ENABLED` false until you have checked the current Cambodia destination rules, sender/number requirements, account geo-permissions, and carrier pricing in your own Twilio account. Verify a real Cambodian handset end-to-end, then explicitly set `TWILIO_SMS_ENABLED="true"` and restart the app. Trial accounts may restrict recipients. Twilio charges per SMS segment and carrier fees or other charges may apply; prices and delivery rules change.

Check [Twilio's Cambodia SMS guidelines](https://www.twilio.com/guidelines/kh/sms) and [Cambodia SMS pricing](https://www.twilio.com/en-us/sms/pricing/kh) before enabling production traffic. The provider integration can be replaced without changing the OTP verification or reset flow.

### Local setup and testing

```powershell
npm install
Copy-Item .env.example .env
# Set SESSION_SECRET and ADMIN_PASSWORD; select/configure the email and SMS providers you will use.
npm run db:deploy
npm run dev
```

Open <http://localhost:3000>, choose **Forgot password?**, select a recovery method, request the code, verify it, and set a matching new password and confirmation. Test email only with a verified sender and an inbox you control. Test SMS using an opted-in Cambodian handset permitted by your Infobip or Twilio account. Automated tests mock provider HTTP responses and do not send real email/SMS:

```powershell
npm test -- src/app/api/customer/password-recovery.test.ts src/lib/customer-auth.test.ts
npm run typecheck
```

The new Prisma migration adds recovery method, attempt count, OTP verification state, hashed reset authorization, and hashed persistent rate-limit records. Apply it locally and on deployments with:

```powershell
npm run db:deploy
```

For production, deploy behind HTTPS, keep `.env` and `prisma/dev.db` private, set stable high-entropy `SESSION_SECRET`, and store API credentials in the hosting platform's secret manager. Configure the trusted reverse proxy to overwrite `X-Forwarded-For`; the application uses that header for IP-based throttling. Use a managed database with backups and monitoring for multi-instance production deployments; this SQLite project is intended for local/single-instance use. Add provider webhooks/alerts and operational monitoring for email/SMS delivery failures before relying on account recovery at scale.

## Telegram setup

Create a Telegram bot through Telegram's official `@BotFather` and copy its token into the server's `.env` file. Add the bot to the group where booking alerts should appear. Ensure the bot is allowed to send messages (make it a group admin if the group restricts posting).

To find the group chat ID, send a message in the group that mentions the bot, such as `/start@YourBotName`, then inspect the resulting update using Telegram's official Bot API `getUpdates` method from your own trusted computer. The `message.chat.id` value for a group is a negative number (supergroups commonly start with `-100`). If you only have a group invite link such as `https://t.me/+Jnv7eC5sjxAwOGU1`, the bot can only send messages after the group chat ID is resolved or the group username is configured in the environment. Treat the bot token as a password; never paste it into the frontend, screenshots, or public chats.

```dotenv
TELEGRAM_BOT_TOKEN="your-private-bot-token"
TELEGRAM_CHAT_ID="-1001234567890"
```

Restart Next.js after editing `.env`. Tokens are used only in server-side API calls. The Settings page shows whether both values are present and provides a **Send test message to group** button. Booking, payment, cancellation, and rescheduling alerts are sent automatically to the configured chat. A configured token/chat pair still needs the bot to be a member of, and permitted to post in, the target group.

## Database

SQLite is used for local development (`DATABASE_URL="file:./dev.db"`). Prisma schema and the initial migration are in `prisma/`. The seed script safely upserts three sample fields and can be rerun.

The checked-in migration history is SQLite-specific. For PostgreSQL, set the Prisma datasource provider in `prisma/schema.prisma` to `postgresql`, set a private PostgreSQL `DATABASE_URL`, and create a PostgreSQL-specific initial migration against an empty database before deploying it. Do not apply the checked-in SQLite migration to PostgreSQL. Review provider-specific migrations in a non-production environment first.

## Important operational notes

- The `PENDING` state reserves its time slots until an administrator verifies/fails payment or cancels the booking. Failed and cancelled pending bookings release their slots.
- Booking prices and per-field hourly rates are stored in cents. The KHR conversion is a configurable reference rate in Settings, not an exchange-rate service; the booking fee is configured in KHR and converted using that rate.
- Do not expose `.env`, database files, or the admin interface to the public internet without HTTPS, backups, operational monitoring, and a production-grade database/deployment setup.
- The current single-admin login is suitable for a controlled MVP. Add persisted admin accounts, roles, audit history, and managed password resets before operating multiple staff accounts.
- The interface provides English and Khmer UI with USD and KHR prices. Customer-provided names, notes, and any merchant payment instructions are shown as entered.
