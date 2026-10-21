# 4GUARD Cloudflare Worker + D1 setup

This project uses Cloudflare only: static website hosting through Workers Assets, a Worker API for secure login and booking logic, and D1 for the SQL database.

## Before you begin

Install Node.js (current LTS) and create a free Cloudflare account. Then sign in from the project folder:

```powershell
cd D:\4GUARD
npx wrangler login
```

## 1. Create the D1 database

```powershell
npx wrangler d1 create 4guard-bookings
```

Cloudflare prints a `database_id`. Open `wrangler.toml` and replace:

```toml
database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"
```

with that value. For the database already created in this project, the value is `caec0b2f-b98e-4769-a4c3-fef174302eca`.

## 2. Configure the owner account

For local development, copy `.dev.vars.example` to `.dev.vars` and replace the example `ADMIN_SETUP_KEY` with a private random phrase.

For the deployed Worker, set both secrets in Cloudflare:

```powershell
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put ADMIN_SETUP_KEY
```

When prompted for `ADMIN_EMAIL`, enter `guardddmt@gmail.com`. When prompted for `ADMIN_SETUP_KEY`, enter a long random secret phrase and keep it private. Use the same key in the owner setup field when creating the first owner account. This prevents someone else from claiming the public owner email before the real owner. Other customers can register without the setup key.

The account registered with the configured owner email receives the admin view: all bookings, search by customer email, status/note updates, create bookings for registered customers, and review moderation. The Worker defaults to `guardddmt@gmail.com` if `ADMIN_EMAIL` is missing, but setting the Cloudflare secret is recommended.

## 3. Create or update the database tables

Run this command after every schema update. It is safe to re-run because the SQL uses `create table/index if not exists`; it creates the reviews table required by the customer review feature.

Run the schema against D1:

```powershell
npx wrangler d1 execute 4guard-bookings --remote --file=./d1/schema.sql
```

## 4. Test locally

```powershell
npx wrangler dev
```

Open the local address shown in the terminal. Create a customer account, make a booking, sign in with `guardddmt@gmail.com` to verify the admin dashboard, test a booking while signed out (it must be rejected), then sign in as a customer and create a booking. As admin, create a booking for that registered customer, confirm it with a message, and verify the customer sees the status/note. Mark a test booking as `COMPLETED`, then sign back in as that customer to submit a review. Approve it in the admin dashboard to publish it on the home page. Check `/api/health` if login or database requests fail.

## 5. Deploy free to Cloudflare

```powershell
npx wrangler deploy
```

Cloudflare returns a public `workers.dev` URL. You can attach a custom domain later in the Cloudflare dashboard.

## Security model

- Passwords are salted and hashed with Web Crypto PBKDF2 before storage.
- Login sessions are stored as hashes in D1 and delivered in `HttpOnly`, `Secure`, `SameSite=Lax` cookies.
- The browser talks only to `/api/*`; it never receives a D1 credential.
- The Worker checks the configured owner email server-side before allowing booking searches, booking updates, and review moderation. Other registered emails are customer accounts.
- Customers can review only their own completed bookings, and each booking can be reviewed once. Reviews require owner approval before appearing publicly.

## Important files

- `worker.js` — API, authentication, and D1 access
- `d1/schema.sql` — database tables and indexes
- `wrangler.toml` — Cloudflare Worker and D1 binding configuration
- `.dev.vars.example` — local environment-variable template
- `portal.js` — browser UI that calls the Worker API

Do not commit `.dev.vars` or any Cloudflare API tokens. The Worker only uploads the `public/` directory as website assets; source, documentation, D1 schema, and Git history stay out of the public deployment.


## Customer portal navigation and in-app feedback update

The customer dashboard now shows job status and the admin's note, offers a clearly visible separate **Book a service** action, and lets customers send private feedback messages tied to their own booking. Admins can read those messages in the **Customer feedback inbox**.

After updating the project, apply the idempotent D1 schema so the `customer_feedback` table exists, then deploy:

```bash
npx wrangler d1 execute 4guard-bookings --remote --file=./d1/schema.sql
npx wrangler deploy
```

The feedback inbox is available only to the configured admin account. Customers can only send messages against bookings belonging to their own account.


### Booking and admin behavior

- `POST /api/bookings` requires an authenticated session; customer identity is taken from the session, never from browser-submitted name/email values.
- `POST /api/admin/bookings` is owner-only and can assign a booking only to an existing non-admin account.
- The server validates service/property values, date, location and details; the browser's required fields are not treated as a security boundary.
- Setting status to `CONFIRMED` requires a non-empty admin message, which is shown in the customer's portal.

## Production launch checklist

- Keep `.dev.vars` private and out of Git. `.gitignore` excludes it; never commit Cloudflare API tokens or real setup secrets.
- Use a long, unique `ADMIN_SETUP_KEY`. It is only for initial owner-account registration; it is not the owner's login password.
- Verify the owner's account email exactly matches the configured `ADMIN_EMAIL`, then test sign-in and the admin-only API routes.
- Apply `d1/schema.sql` and verify `https://YOUR-WORKER-URL/api/health` reports `"schema":"ready"`.
- Test in a private browser window: booking while signed out must redirect to sign-in; direct unauthenticated `POST /api/bookings` must return `401`.
- Test the owner-only create-booking action with a registered customer email and an unregistered email. Only the registered customer should receive a booking in their portal.
- Confirm a booking with an admin note and verify that the customer sees both `CONFIRMED` and the note. Confirmation without a note should be rejected.
- Confirm contact details, service categories, service areas, business hours, and actual photography/usage rights with the business owner before public launch.
