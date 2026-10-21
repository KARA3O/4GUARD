# 4Guard Cleaning & Pest Solutions

Responsive static website with Home, Services, About, Contact, Login, Booking and role-based Booking Dashboard pages. Built with HTML, CSS and vanilla JavaScript; no build step is needed.

## Booking portal

The project includes a secure customer and owner booking portal backed by Cloudflare Worker and D1. Customers must create an account and sign in before a booking can be submitted. The Worker enforces this rule server-side. Customers can view only their own bookings, status and owner notes. The owner account (`guardddmt@gmail.com`) can see and search all bookings, update status, and create a booking on behalf of an existing customer account.

Follow [CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md) to create/update the D1 database, activate the portal, and deploy it free on Cloudflare. After deploying these changes, run the D1 schema command in that guide so the new `reviews` table exists.

## Preview

Open `index.html` in a browser or serve this directory with a static web server. Navigation links connect all four pages. The visual palette follows the supplied logo: navy and green. The header uses a compact vector mark and wordmark; the full supplied logo is shown as a framed brand image on the home and About pages.

## Before publishing

1. Confirm the proposed service categories and remove any that 4Guard does not offer.
2. Add verified contact details to `config.js`. Blank details are intentional until confirmed.
3. Confirm business hours and service areas before adding them to the page.
4. Replace the testimonial placeholder only with genuine approved customer feedback.
5. The photography loads from Unsplash and requires internet access. Confirm image usage rights and replace with authorized assets if needed.

## Reviews and ratings

A customer can submit one rating per completed booking. Reviews are pending until the owner approves them; only approved reviews appear on the public home page and contribute to the average rating.

## Enquiry form

The form validates required fields in the browser. When a verified email is configured, it opens an email draft addressed to 4Guard. If only a WhatsApp number is configured, it opens a WhatsApp draft for the customer to review and send. No data is stored on a server. If neither destination is configured, the form explains that delivery is not set up.

## Files

- `index.html`, `services.html`, `about.html`, `contact.html` — individual pages
- `styles.css` — responsive styles and design system
- `script.js` — mobile navigation, form and contact behavior
- `config.js` — verified contact configuration
- `assets/` — compact vector marks, supplied logo and favicon


## Customer portal navigation and in-app feedback update

The customer dashboard now shows job status and the admin's note, offers a clearly visible separate **Book a service** action, and lets customers send private feedback messages tied to their own booking. Admins can read those messages in the **Customer feedback inbox**.

After updating the project, apply the idempotent D1 schema so all portal tables exist, then deploy:

```bash
npx wrangler d1 execute 4guard-bookings --remote --file=./d1/schema.sql
npx wrangler deploy
```

The feedback inbox is available only to the configured admin account. Customers can only send messages against bookings belonging to their own account.


## Booking rules and admin workflow

- The public **Book a service** action requires a signed-in account. The Worker rejects unauthenticated booking requests even if the browser form is bypassed.
- Admins can use **Book a service** to make a request under their own signed-in account, or use **Create a booking for a customer** in the admin dashboard. The latter accepts only an existing non-admin customer account email and links the booking to that customer.
- The API accepts only the configured service/property options, a real date today or later in South Africa, a location up to 200 characters, and details up to 3,000 characters.
- When changing a booking to **CONFIRMED**, the admin must provide a customer-facing message. Customers see this message with the status in their portal.
- Quote enquiries on the Contact page are separate from bookings: they prepare an email/WhatsApp draft and are not stored in the booking database.

### Access rules
The public company pages do not require an account. Sending a quote/enquiry, submitting a service booking, sending customer feedback, and using the customer/admin portal require sign-in. Public navigation shows `Guest`, `Customer · <name>`, or `Admin · <name>` based on the server-verified session. The Worker remains the authority for access control.
