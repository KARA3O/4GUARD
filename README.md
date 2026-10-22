# 4Guard Cleaning & Pest Solutions — website and booking portal

Pest control, fumigation and cleaning website with online booking, customer accounts and an owner portal.
Runs entirely on Cloudflare (Workers + Static Assets + D1).

**Designed and developed by Neuropulse Inc.**

- 📐 How it was planned: open [`docs/index.html`](docs/index.html) in a browser, or read [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md)
- 🖼️ Diagrams: [`docs/diagrams/`](docs/diagrams) (architecture, pages, database, booking lifecycle, booking flow, security)

---

## What's in it

**Public website**: Home (with a "What do you need help with?" picker), Pest control, Cleaning, About, Contact.

**Booking** (`/booking`) in four steps: service → property → date and contact → check and send.
Visitors without an account create one (or log in) inside the last step without losing their answers.
Links like `/booking?service=termites` or `/booking?category=cleaning` pre-fill the form.

**Customer account** (`/dashboard`): bookings with reference number, status timeline, confirmed date and the note from 4Guard;
messages with 4Guard; cancel an upcoming booking; review completed jobs; update details and password.

**Owner portal** (same page, signed in as `ADMIN_EMAIL`): counts of waiting/today/confirmed/completed/cancelled jobs,
search and filters, confirm with date, time of day and a note to the customer, message customers, publish or hide reviews,
book on behalf of a phone customer, and create a temporary password for a customer who forgot theirs.

## Project structure

```text
public/        Website (HTML, CSS, JS, images, fonts) — served as static files
src/           Worker API: index.js (routes), lib/ (http, auth), routes/ (auth, bookings, messages, reviews, health)
migrations/    D1 database migrations, applied in order
docs/          System design page, diagrams and screenshots
wrangler.toml  Cloudflare configuration
```

Full annotated tree: [`docs/SYSTEM_DESIGN.md` §9](docs/SYSTEM_DESIGN.md#9-project-structure).

## Before launch: business details

Edit **`public/assets/js/config.js`**: phone, WhatsApp, business hours and service areas. Anything left blank is hidden on the site.

Confirm the services in **`public/assets/js/catalog.js`**. The booking form and the API both read this file, so removing a service
there removes it everywhere.

## Run it on your computer

Requirements: Node.js 20 or newer.

```bash
npm install
cp .dev.vars.example .dev.vars        # then put a private value in ADMIN_SETUP_KEY
npm run db:migrate:local              # creates the local database
npm run dev                           # opens http://localhost:8787
```

Create the owner account at `/login` → *Create account* with the `ADMIN_EMAIL` address and the `ADMIN_SETUP_KEY` from `.dev.vars`.

## Deploy / upgrade the live site

The database (`4guard-bookings`, id in `wrangler.toml`) already exists from the first version.

```bash
npx wrangler login
npm run db:migrate:remote             # adds the new columns and tables; existing accounts and bookings are kept
npx wrangler secret put ADMIN_EMAIL   # guardddmt@gmail.com (skip if already set)
npx wrangler secret put ADMIN_SETUP_KEY   # skip if already set
npm run deploy
```

Then open `https://<your-site>/api/health` — it should say `"schema":"ready"`.

> **Upgrading from version 1:** existing accounts keep working with the same passwords, existing bookings get a
> reference number automatically, and old `services.html` links redirect to `/pest-control`.
> The old `d1/schema.sql` is replaced by `migrations/` — use `npm run db:migrate:remote` from now on.

## Owner guide

| To do this | Go to |
|---|---|
| See new requests | Owner portal → **Bookings** → *Waiting for you* |
| Confirm a job | Open the booking → **Confirm or update** → status *Confirmed*, date, time of day and a note (for example how to prepare) → **Save changes** |
| Mark a job done | **Update booking** → status *Completed*. The customer can then review it |
| Reply to a customer | **Messages**, or **Message customer** on the booking |
| Publish a review | **Reviews** → **Publish on website** |
| Book for someone who phoned | **Book for a customer** (they need an account first) |
| Customer forgot their password | **My details** → *Customer forgot their password* → give them the temporary password |

## Security summary

Salted PBKDF2 password hashes · HttpOnly session cookies (only hashes stored) · server-side checks on every owner action ·
customers only ever see their own data · 8 wrong passwords locks an email for 15 minutes · origin check on every change ·
Content-Security-Policy and other headers in `public/_headers`. Never commit `.dev.vars` or Cloudflare tokens.

## Credits

Website and booking portal designed and developed by **Neuropulse Inc.**
Typeface: [Archivo](https://github.com/Omnibus-Type/Archivo) (SIL Open Font License, see `public/assets/fonts/OFL-Archivo.txt`).
Icons drawn for this project.
