# Deploying Divya Motel online

This app runs on SQLite locally. To host it online so staff can reach it from
any phone, you switch the database to **Postgres** and deploy. The recommended
free-tier path is **Vercel** (hosting) + **Neon** (Postgres). Total cost: $0 to
start.

> You only have to do this once. After that, you push changes and it updates.

---

## 1. Create a hosted Postgres database (Neon)

1. Sign up at https://neon.tech (free tier).
2. Create a project → copy the **connection string** (looks like
   `postgresql://user:pass@host/dbname?sslmode=require`).

## 2. Point the app at Postgres

In `prisma/schema.prisma`, change the datasource provider:

```prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}
```

## 3. Push the code to GitHub

```bash
git init
git add .
git commit -m "Divya Motel room condition app"
# create a repo on github.com, then:
git remote add origin https://github.com/<you>/divya-motel.git
git push -u origin main
```

## 4. Deploy on Vercel

1. Sign up at https://vercel.com and **Import** the GitHub repo.
2. Add these **Environment Variables** in the Vercel project settings:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | your Neon connection string |
   | `NEXTAUTH_SECRET` | a fresh secret — run `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
   | `NEXTAUTH_URL` | your live URL, e.g. `https://divya-motel.vercel.app` |
   | `SEED_ADMIN_EMAIL` | admin login email |
   | `SEED_ADMIN_PASSWORD` | strong admin password |

3. Click **Deploy**.

## 5. Initialise the live database

After the first deploy, create the tables and seed the checklist/admin. Run
locally with `DATABASE_URL` temporarily set to the Neon string:

```bash
npx prisma db push       # create tables in Postgres
npm run db:seed          # admin + checklist + sample rooms
```

(or run these from the Neon SQL console / a Vercel build step).

## 6. Done

Visit your Vercel URL on any phone, sign in as the admin, and start adding your
real rooms and staff. Delete the sample rooms (101–203) from the Rooms page.

---

### Security checklist for production

- [ ] Set a **new** `NEXTAUTH_SECRET` (never reuse the dev one).
- [ ] Change the admin password from the seeded default.
- [ ] Use a strong `SEED_ADMIN_PASSWORD`.
- [ ] Vercel serves over HTTPS automatically — keep it on.
- [ ] Give each staff member their own account (no shared logins) so the
      Activity log stays meaningful.
