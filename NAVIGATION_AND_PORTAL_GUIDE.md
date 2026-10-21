# 4Guard navigation and portal flow

## Public website
- `index.html` is the public home page.
- Public navigation links to Home, Services, About, Contact, Client portal, and Book a service.
- Visitors can browse company information and reviews before signing in.

## Customer and administrator flow
- `login.html` is the sign-in and registration page.
- New customers register and land on `dashboard.html`.
- `guardddmt@gmail.com` lands on the administrator view after successful authentication when the backend identifies the account as admin.
- Customers can review completed bookings from their dashboard.
- Administrators can search bookings, update statuses, and moderate reviews.
- Booking visitors who need to sign in are redirected to the client portal with `?next=booking.html`; after successful sign-in or registration they return to the booking form.
- Sign out returns users to the public home page.

## Cloudflare deployment
From the project root:

```bash
npx wrangler deploy
```

The deployed static assets are in `public/`; `worker.js` is the Cloudflare Worker entry point. Static files in the root and `public/` are kept synchronized in this ZIP for easier local editing.

## Password hashing compatibility
Cloudflare Workers currently rejects the previous PBKDF2 iteration count of 150,000 in this project. The shared password hash/verification helper now uses 100,000 iterations so signup and login use the same supported parameters.

## Public browsing, account-required submissions, and session identity

- Public Home, Services, About, and Contact pages remain accessible without signing in.
- The public navigation displays the current session identity: `Guest`, `Customer · <name>`, or `Admin · <name>`.
- Submitting a quote/enquiry from the Contact page requires an authenticated account. If signed out, the visitor is sent to the sign-in/create-account page before sending; the form is not sent while signed out.
- Submitting a service booking, customer feedback, or other portal messages requires sign-in. The Worker independently enforces authentication on protected API routes; hiding a form is not the only security control.
- After login, booking requests return to the booking page and quote enquiries return to the contact form. Public browsing remains open.
