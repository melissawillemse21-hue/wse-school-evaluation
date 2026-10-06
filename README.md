# WSE School Evaluation — Production Starter

This version moves the prototype from browser-only localStorage to **Supabase Auth + Postgres + Row Level Security**.

## What it provides

- Multiple schools in one application.
- Secure school-level data isolation through Postgres RLS.
- One school administrator with multiple assessment users.
- Administrators assign users to specific assessment areas.
- Individual users sign in with their own email/password.
- Shared school assessments: an assessor's saved work is visible to authorised school users.
- Assessment completion percentage and explicit save confirmation.
- Ratings 1–5.
- Ratings 1–3 show one improvement workspace.
- Three selectable improvement suggestions per assessment item, with possible recommendations.
- Space for the school's own improvement.
- Finding, recommendation, action, responsible person, priority, target date, budget, status and progress.
- School-wide improvement-plan and assessment-history views.

## Important

This is now a **production architecture starter**, but it is not connected to your Supabase project yet. You must create the Supabase project and put its URL/anon key into `config.js`.

### Setup

1. Create a Supabase project.
2. In SQL Editor, run:
   - `supabase/schema.sql`
   - `supabase/seed_assessments.sql`
3. Deploy both Edge Functions:
   - `supabase/functions/create-school/index.ts`
   - `supabase/functions/create-team-user/index.ts`
4. Copy `config.example.js` to `config.js`.
5. Put your Supabase project URL and anon key in `config.js`.
6. Run:
   ```bash
   npm install
   npm run dev
   ```
7. For production:
   ```bash
   npm run build
   ```
   Deploy the generated `dist` folder to a static host such as Vercel, Netlify or Cloudflare Pages.

### Supabase Edge Function secrets

The `create-school` and `create-team-user` functions need the normal Supabase function environment variables:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Do **not** put the service-role key in the browser or in `config.js`.

## First administrator

Use the **Create school administrator** flow in the application. The administrator creates the school and then uses **School Users** to add assessors and assign assessment areas.

## Source content

The nine assessment areas and their numbered items come from the current WSE prototype built from the supplied Google Forms. The app keeps the source improvement selections where they exist. The additional suggestion slots are explicitly app-generated and should be reviewed by the school before production rollout.

## Production hardening still recommended

Before public rollout, add:
- email verification/password reset,
- organisation/school approval workflow,
- audit log,
- automated backups,
- export to Excel/PDF,
- admin ability to deactivate users,
- stronger role permissions for school-wide reporting,
- HTTPS-only hosting and a custom domain.
