# 4Guard booking portal setup and free hosting

## Recommended database: Supabase Postgres

Supabase is recommended because its free tier provides a hosted PostgreSQL database, secure email/password authentication, and row-level security. The website stays static, so it can be hosted free on Netlify or GitHub Pages while Supabase safely stores the bookings.

## 1. Create the database

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, create a new query, paste the full contents of `supabase/schema.sql`, then click **Run**.
3. Open **Authentication → Providers → Email** and keep Email enabled. For initial testing, you may disable email confirmation; enable it before public launch.
4. Open **Project Settings → API**. Copy the **Project URL** and the **anon public** key.
5. In `config.js`, paste them into `supabaseUrl` and `supabaseAnonKey`. Never use or publish the `service_role` key.

The configured owner/admin email is `guardddmt@gmail.com`. Create and confirm an account using that exact address. It alone can search every booking and change status or admin notes.

## 2. Test locally

Open the project folder in VS Code and use the **Live Server** extension, or run:

```powershell
cd D:\4GUARD
npx serve .
```

Open the local URL printed in the terminal. Create a customer account, submit a booking, then sign in as the owner email to test the admin dashboard.

## 3. Host for free with Netlify

1. Create a free account at [netlify.com](https://www.netlify.com).
2. Drag the whole 4GUARD project folder onto Netlify’s **Add new site → Deploy manually** area, or connect its GitHub repository.
3. No build command is required. Publish directory is the project root (`.`).
4. Netlify provides a free `*.netlify.app` address. Add a custom domain later if needed.

After deployment, return to Supabase **Authentication → URL Configuration** and add the Netlify URL under **Site URL** and **Redirect URLs**, especially if email confirmation is enabled.

## Security notes

- `config.js` deliberately contains only public Supabase values. The anon key is restricted by the policies in `supabase/schema.sql`.
- Never commit a Supabase `service_role` key or database password.
- If the ownership email changes, replace `guardddmt@gmail.com` in both `config.js` and the owner policy in `supabase/schema.sql`, then re-run the policy statement in Supabase.
