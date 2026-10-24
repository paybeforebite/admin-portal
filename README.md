# PayBeforeBite Admin Portal

Standalone static admin UI for PayBeforeBite platform administrators.

## Access model

- There is no public sign-up page. Sign-in uses Supabase Auth password authentication.
- An authenticated account is admitted only when its user ID has an active row in `public.platform_admins`.
- The browser guard is a user-experience layer. Privileged operations must independently validate the bearer token and active platform-admin row in their Supabase Edge Functions.
- Never place a Supabase service-role or secret key in frontend files. `supabase-config.js` must contain only the project URL and publishable/anon key.
- Keep RLS enabled and review the live Supabase policies before production use. Do not rely on frontend checks to protect data.

## Configuration

1. Copy `supabase-config.example.js` to `supabase-config.js` and set the Supabase project URL and publishable key.
2. In Supabase Auth, set the production site URL to `https://admin.paybeforebite.com` and add only the required redirect URLs.
3. Deploy this static site to the intended admin domain.
4. Add platform administrators through a trusted administrative process. Do not expose self-service admin creation.
5. Deploy the Edge Functions in `supabase/functions` and configure their Supabase secrets in the Supabase project.
6. Owner invitation emails intentionally redirect to the POS application at `https://app.paybeforebite.com/update-password.html`. Add that URL to the Supabase Auth allow-list for the POS flow.

## CORS

The Edge Functions allow browser requests from `https://admin.paybeforebite.com` and the local development origins `http://localhost:5500` and `http://127.0.0.1:5500`. Update the allow-list deliberately if the production host or development port changes.

## Validation checklist

- [ ] A logged-out visitor is redirected to the sign-in page when opening a protected page.
- [ ] A restaurant owner/cashier cannot access any admin page or invoke admin Edge Functions.
- [ ] An inactive platform administrator is denied.
- [ ] An active platform administrator can sign in and use authorized features.
- [ ] Requests from unapproved browser origins do not receive permissive CORS headers.
- [ ] Live RLS policies, grants, and Edge Function secrets have been reviewed.
- [ ] Owner activation redirects to the deployed POS domain.

## Scope note

The SQL schema file is a reference snapshot of the shared Supabase database, not an instruction to re-run the entire schema during an admin portal deployment. Manage canonical schema/migrations in the dedicated SQL repository and apply only reviewed migrations.
