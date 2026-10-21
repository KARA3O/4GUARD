# 4Guard login fix — deploy checklist

The source has been updated, but the live Cloudflare website will not change until you deploy it.

## Deploy the fixed version

Open PowerShell in the extracted `4GUARD` project folder:

```powershell
npx wrangler login
npx wrangler d1 execute 4guard-bookings --remote --file=./d1/schema.sql
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put ADMIN_SETUP_KEY
```

When prompted for `ADMIN_EMAIL`, enter `guardddmt@gmail.com`. For `ADMIN_SETUP_KEY`, enter a long random secret phrase and keep it private. Enter the same key in the owner registration form if the owner account does not already exist. Regular customers do not need this key.

Then deploy:

```powershell
npx wrangler deploy
```

If Wrangler says the D1 database does not exist or the binding is wrong, check the `database_id` and `database_name` in `wrangler.toml` against the database in your Cloudflare dashboard. Do not create a second database unless the existing one is genuinely missing.

## Verify the fix

1. Open `https://YOUR-LIVE-DOMAIN/api/health`. It should return JSON with `"ok": true` and `"schema": "ready"`.
2. Open the login page and register `guardddmt@gmail.com` if that email does not already have an account. Registration signs the account in automatically.
3. Other email addresses receive customer access. Admin status is checked by the Worker, not by a browser setting. First-time owner registration also requires the private setup key to prevent someone else from claiming the public owner email.
4. If `guardddmt@gmail.com` already has an account, sign in with its existing password. Registering it again is not possible. The project does not include an email-based password reset service, so do not expose or share account passwords.
5. To test reviews, sign in as a customer, submit a booking, sign in as the owner and mark it `COMPLETED`, then sign back in as the customer and submit a rating. Approve the review from the owner dashboard to publish it on the home page.

## What changed

- Account registration creates a session immediately.
- Password validation in the form matches the API's eight-character minimum.
- `guardddmt@gmail.com` receives owner/admin tools by default; `ADMIN_EMAIL` remains configurable. First-time owner registration requires the private `ADMIN_SETUP_KEY`.
- Added an API health endpoint to help identify a missing/incomplete D1 schema.
- Customers can review their own completed bookings once.
- Owner approval/rejection controls keep public reviews moderated.
- The home page displays approved reviews and the average rating.
