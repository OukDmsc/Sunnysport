# Sunny Sport Club — Vanilla JavaScript parallel app

This is a standalone, additive Express + vanilla HTML/CSS/JavaScript replacement project. It does not modify or replace the existing Next.js application. The Prisma schema here mirrors the current schema so the generated JavaScript client can connect to the existing SQLite database; this project does **not** run migrations, generate seeds, or alter the database schema automatically.

## Setup

1. Keep the existing root app and its `.env` untouched. In this directory, copy `.env.example` to `.env` and privately configure its placeholders. Do not copy the existing root `.env` or paste credentials into source code.
2. Keep `DATABASE_URL="file:../../prisma/dev.db"` to use the current database from `vanilla-js/prisma/schema.prisma`. The database path is relative to that schema. Back up the database before any production use.
3. Configure `SESSION_SECRET` to a private random value of at least 32 characters and set `ADMIN_USERNAME` / `ADMIN_PASSWORD`. These are separate settings for this app. Never reuse sample placeholders.
4. Install standalone dependencies and generate the JS Prisma client:

   ```powershell
   cd "D:\system sunny booking\system football\vanilla-js"
   npm install
   npm run db:generate
   npm test
   npm run dev
   ```

   The default port is 3001 (override with `PORT`). Open `http://localhost:3001`. `npm start` starts without watch mode. The root Next.js app remains on its original setup/port.

`npm run db:generate` only generates client code using the mirrored schema; do not run `prisma migrate`, `db push`, or seed commands against the shared database as part of this parallel migration.

## Provider configuration

Recovery providers are opt-in and selected only by server environment values:

- Email: set `EMAIL_PROVIDER=resend`, `smtp`, or `infobip` and provide the matching sender/credentials (`RESEND_API_KEY` + `EMAIL_FROM`; SMTP host/from and optional auth; or Infobip API key, base host, and sender address).
- SMS: set `SMS_PROVIDER=infobip` and configure `INFOBIP_BASE_URL`, `INFOBIP_API_KEY`, and `INFOBIP_SMS_SENDER`, or explicitly select `twilio` and supply its server credentials and sender number.
- Recovery uses the existing database challenge tables, HMAC-hashed one-time codes, attempt/expiry limits, and reset-token hashing. Codes are not returned from server APIs or written to application logs. Provider credentials and API keys must only be stored in a private environment file or secret manager.
- No email, SMS, or Telegram messages are sent by the test suite. Tests replace outbound HTTP with mocks. Do not perform live delivery tests without explicit authorization, approved sender configuration, and an opted-in recipient.
- Payments remain manual KHQR. The app does not collect card payments or mark payments paid automatically.

## Current port status

| Area | Status |
|---|---|
| Standalone Express server and static vanilla frontend | Implemented |
| Existing Prisma SQLite models and database URL | Compatible mirrored schema; no migration or schema operation is performed |
| Customer registration, login/logout, session check | Implemented with scrypt password hashes and signed HTTP-only cookie sessions |
| Password recovery | Implemented (email/SMS provider configuration required); codes are hashed, rate-limited, expiring, and single-use |
| Public fields, public settings, slot availability | Implemented |
| Customer booking, unique slot claims, booking history and unpaid cancellation | Implemented; database unique slot constraint and transactional create are retained |
| Admin sign-in/session/logout | Implemented with signed HTTP-only cookie, origin checking, and process-local login throttling |
| Admin booking management, cancel/reschedule, payment review/refund, schedule | Implemented |
| Fields, settings, reports, customer list, Telegram test | Implemented |
| Manual KHQR instructions/link/image | Implemented when configured; QR image generation is not included |
| English / Khmer | Language toggle and core navigation headings are translated; the full source app's translation catalog is not completely ported |
| Original visual fidelity and PWA/offline installation | Not ported; this replacement uses its own responsive layout and no service worker |
| API semantics / notifications | Main existing application routes are represented. Telegram notifications are best-effort; automated route-level regression coverage against the Next.js app is not yet complete |

This is a parallel migration foundation, not a claim of pixel-perfect or fully regression-certified replacement. Review the matrix before directing customers to this app.

The current Prisma 6 CLI dependency reports a high-severity transitive advisory in `npm audit`; npm's suggested automatic fix crosses a major Prisma version and is not applied because that would change the existing schema/runtime compatibility. Re-evaluate the Prisma major upgrade separately before production use.

## Safety and operations

- Mutating API endpoints enforce same-origin checks. Authentication cookies are `HttpOnly`, `SameSite=Strict`, and `Secure` in production.
- The default development server is intended for local validation. For internet use, add HTTPS, a reverse proxy with carefully configured trusted proxy handling, monitoring, backups, and security review first.
- Keep `.env` private; never commit it. Provider delivery is not contacted during setup, build, or tests.
