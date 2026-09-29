// Provisions the database at deploy time — but ONLY for production deploys.
//
// Vercel runs `npm run build:deploy` for every deploy (production AND preview).
// Preview deploys (feature branches) must NOT run `prisma db push` / `seed`
// against the live production Supabase database, and they don't carry the
// production DB env vars anyway. So we gate the provisioning on VERCEL_ENV.
//
//   VERCEL_ENV=production  -> push schema, seed, ensure storage bucket
//   anything else          -> skip; the build continues with `next build`
//
// Runs during `vercel build` on Linux; kept dependency-free (Node built-ins).
import { execSync } from "node:child_process";

const env = process.env.VERCEL_ENV ?? "unset";

if (env !== "production") {
  console.log(`[provision-db] VERCEL_ENV=${env} — skipping DB provisioning (production only).`);
  process.exit(0);
}

console.log("[provision-db] Production deploy — provisioning database…");
try {
  execSync("prisma db push && prisma db seed && tsx scripts/ensure-storage-bucket.ts", {
    stdio: "inherit",
  });
} catch (err) {
  console.error("[provision-db] Provisioning failed.");
  process.exit(1);
}
