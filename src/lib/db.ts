import { PrismaClient } from "@prisma/client";

// Append PgBouncer-safe flags to DATABASE_URL at runtime.
// Required when Prisma runs against Supabase's Transaction pooler, otherwise
// queries fail intermittently with code 42P05 "prepared statement already exists".
// Safe against direct Postgres connections too (slight perf cost, no correctness risk).
function withPoolerParams(url: string | undefined): string | undefined {
  if (!url) return url;
  if (url.includes("pgbouncer=")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}pgbouncer=true&connection_limit=1`;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Only override the datasource URL when DATABASE_URL is actually set. Passing
// `{ url: undefined }` explicitly makes the PrismaClient constructor throw,
// which breaks `next build` page-data collection on environments without the
// DB env (e.g. preview deploys). Omitting the override lets Prisma fall back to
// the schema's env("DATABASE_URL") and defers any failure to real query time.
const datasourceUrl = withPoolerParams(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
