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

## 2. Add the owner email

For local development, copy `.dev.vars.example` to `.dev.vars`.

For the deployed Worker, set the variable in Cloudflare:

```powershell
npx wrangler secret put ADMIN_EMAIL
```

When prompted, enter:

```text
guardddmt@gmail.com
```

The account registered with this exact email receives the admin view: all bookings, search by customer email, and booking status/note updates.

## 3. Create the database tables

Run the schema against D1:

```powershell
npx wrangler d1 execute 4guard-bookings --remote --file=./d1/schema.sql
```

## 4. Test locally

```powershell
npx wrangler dev
```

Open the local address shown in the terminal. Create a customer account, make a booking, then create/sign in with the owner email to test the admin dashboard.

## 5. Deploy free to Cloudflare

```powershell
npx wrangler deploy
```

Cloudflare returns a public `workers.dev` URL. You can attach a custom domain later in the Cloudflare dashboard.

## Security model

- Passwords are salted and hashed with Web Crypto PBKDF2 before storage.
- Login sessions are stored as hashes in D1 and delivered in `HttpOnly`, `Secure`, `SameSite=Lax` cookies.
- The browser talks only to `/api/*`; it never receives a D1 credential.
- The Worker checks `ADMIN_EMAIL` server-side before allowing booking searches or updates.

## Important files

- `worker.js` — API, authentication, and D1 access
- `d1/schema.sql` — database tables and indexes
- `wrangler.toml` — Cloudflare Worker and D1 binding configuration
- `.dev.vars.example` — local environment-variable template
- `portal.js` — browser UI that calls the Worker API

Do not commit `.dev.vars` or any Cloudflare API tokens. The Worker only uploads the `public/` directory as website assets; source, documentation, D1 schema, and Git history stay out of the public deployment.
