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

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: { url: withPoolerParams(process.env.DATABASE_URL) },
    },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
