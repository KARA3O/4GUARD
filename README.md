# 4Guard Cleaning & Pest Solutions

Responsive static website with Home, Services, About, Contact, Login, Booking and role-based Booking Dashboard pages. Built with HTML, CSS and vanilla JavaScript; no build step is needed.

## Booking portal

The project includes a secure customer and owner booking portal backed by Supabase. Customers can create accounts, send booking requests and view their bookings. The owner account (`guardddmt@gmail.com`) can see all bookings, search them by customer email, and update their status or internal notes.

Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md) to activate the database/authentication and host the site free on Netlify.

## Preview

Open `index.html` in a browser or serve this directory with a static web server. Navigation links connect all four pages. The visual palette follows the supplied logo: navy and green. The header uses a compact vector mark and wordmark; the full supplied logo is shown as a framed brand image on the home and About pages.

## Before publishing

1. Confirm the proposed service categories and remove any that 4Guard does not offer.
2. Add verified contact details to `config.js`. Blank details are intentional until confirmed.
3. Confirm business hours and service areas before adding them to the page.
4. Replace the testimonial placeholder only with genuine approved customer feedback.
5. The photography loads from Unsplash and requires internet access. Confirm image usage rights and replace with authorized assets if needed.

## Enquiry form

The form validates required fields in the browser. When a verified email is configured, it opens an email draft addressed to 4Guard. If only a WhatsApp number is configured, it opens a WhatsApp draft for the customer to review and send. No data is stored on a server. If neither destination is configured, the form explains that delivery is not set up.

## Files

- `index.html`, `services.html`, `about.html`, `contact.html` — individual pages
- `styles.css` — responsive styles and design system
- `script.js` — mobile navigation, form and contact behavior
- `config.js` — verified contact configuration
- `assets/` — compact vector marks, supplied logo and favicon
