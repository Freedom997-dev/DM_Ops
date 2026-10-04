// DB-backed login rate limiting / lockout.
//
// Every failed sign-in writes a row to LoginAttempt (see prisma/schema.prisma).
// A sliding window over those rows decides whether an email is currently locked
// out: 5 failures within 15 minutes. Attempts are keyed by the email that was
// typed (recorded even when no such user exists), so an attacker can't use the
// presence/absence of a lockout to discover which emails are real accounts.

import { prisma } from "@/lib/db";

export const MAX_FAILED_ATTEMPTS = 5;
export const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function normalize(email: string): string {
  return email.toLowerCase().trim();
}

export type LockoutStatus =
  | { locked: false }
  | { locked: true; retryAfterMs: number };

export async function getLockoutStatus(email: string): Promise<LockoutStatus> {
  const since = new Date(Date.now() - WINDOW_MS);
  const attempts = await prisma.loginAttempt.findMany({
    where: { email: normalize(email), createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  if (attempts.length < MAX_FAILED_ATTEMPTS) return { locked: false };

  // Once the oldest of the last MAX attempts ages out of the window, the count
  // drops below the threshold and the account unlocks automatically.
  const blocking = attempts[attempts.length - MAX_FAILED_ATTEMPTS];
  const retryAfterMs = blocking.createdAt.getTime() + WINDOW_MS - Date.now();

  if (retryAfterMs <= 0) return { locked: false };
  return { locked: true, retryAfterMs };
}

export async function recordFailedAttempt(
  email: string,
  ip?: string | null,
): Promise<void> {
  await prisma.loginAttempt.create({
    data: { email: normalize(email), ip: ip ?? null },
  });
}

export async function clearFailedAttempts(email: string): Promise<void> {
  await prisma.loginAttempt.deleteMany({ where: { email: normalize(email) } });
}

// Generic sliding-window limiter for unauthenticated, email-sending endpoints
// (forgot password). Hits share the LoginAttempt table under a namespaced key
// such as "pw-reset:<email>" or "pw-reset-ip:<ip>", which never matches a
// plain email, so they don't count towards — or get cleared with — login
// lockouts. Returns false (and records nothing) once the limit is reached.
export async function allowRateLimited(
  key: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  const since = new Date(Date.now() - windowMs);
  const hits = await prisma.loginAttempt.count({
    where: { email: key, createdAt: { gte: since } },
  });
  if (hits >= max) return false;
  await prisma.loginAttempt.create({ data: { email: key } });
  return true;
}

export function retryAfterMinutes(retryAfterMs: number): number {
  return Math.max(1, Math.ceil(retryAfterMs / 60000));
}
