# Deploying Divya Motel online

This app runs on Postgres and Supabase Storage. The recommended path is **Vercel** (hosting) + **Supabase** (Postgres + Storage). Total cost: $0 to start.

> You only have to do this once. After that, you push changes and it updates.

---

## 1. Create a Supabase project

1. Sign up at https://supabase.com (free tier).
2. Create a project. Pick a region close to where staff use the app.
3. From **Settings → Database → Connection string**, copy the **Transaction pooler** URL (the host contains `pooler.supabase.com`).
4. From **Settings → API**, copy the **Project URL** and the **service_role** secret key.
5. Under **Storage → New bucket**, create a bucket named `inspection-photos`. Leave **Public bucket** OFF.

## 2. Push the code to GitHub

```bash
git init
git add .
git commit -m "Divya Motel room condition app"
# create a repo on github.com, then:
git remote add origin https://github.com/<you>/divya-motel.git
git push -u origin main
```

## 3. Deploy on Vercel

1. Sign up at https://vercel.com and **Import** the GitHub repo.
2. Add these **Environment Variables** in the Vercel project settings:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Supabase Transaction pooler URL |
   | `NEXTAUTH_SECRET` | a fresh secret — run `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
   | `NEXTAUTH_URL` | your live URL, e.g. `https://divya-motel.vercel.app` |
   | `SUPABASE_URL` | from step 1.4 |
   | `SUPABASE_SERVICE_ROLE_KEY` | from step 1.4 (**server-only**, never expose) |
   | `SEED_ADMIN_EMAIL` | admin login email |
   | `SEED_ADMIN_PASSWORD` | strong admin password |

3. Click **Deploy**.

## 4. Initialise the live database

After the first deploy, create the tables and seed the checklist/admin. Run locally with `DATABASE_URL` temporarily set to the Supabase string:

```bash
npx prisma db push       # create tables in Supabase Postgres
npm run db:seed          # admin + checklist + sample rooms
```

(or run these from the Supabase SQL console / a Vercel build step).

## 5. Done

Visit your Vercel URL on any phone, sign in as the admin, and start adding your real rooms and staff. Delete the sample rooms (101–203) from the Rooms page.

---

### Security checklist for production

- [ ] Set a **new** `NEXTAUTH_SECRET` (never reuse the dev one).
- [ ] Change the admin password from the seeded default.
- [ ] Use a strong `SEED_ADMIN_PASSWORD`.
- [ ] Confirm the `inspection-photos` bucket is **private** (no public read policy).
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is only referenced from server-side code (`src/lib/storage.ts`).
- [ ] Vercel serves over HTTPS automatically — keep it on.
- [ ] Give each staff member their own account (no shared logins) so the Activity log stays meaningful.
