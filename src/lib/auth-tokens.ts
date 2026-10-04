// One-time secrets for the password flows (see AuthToken in prisma/schema.prisma).
//
//   PASSWORD_RESET        — long random token in an emailed link; 30 min.
//   PASSWORD_CHANGE_CODE  — 6-digit code for a signed-in user; 10 min, 5 tries.
//
// Only a SHA-256 hash is stored. Issuing a new secret invalidates the user's
// earlier unused ones of the same purpose. Rows are kept (not deleted) so the
// same table can drive per-user rate limits; old rows are purged by
// purgeExpiredAuthTokens() from the nightly cron.

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

export type TokenPurpose = "PASSWORD_RESET" | "PASSWORD_CHANGE_CODE";

export const RESET_TOKEN_MINUTES = 30;
export const CHANGE_CODE_MINUTES = 10;
export const CHANGE_CODE_MAX_ATTEMPTS = 5;

const MINUTES: Record<TokenPurpose, number> = {
  PASSWORD_RESET: RESET_TOKEN_MINUTES,
  PASSWORD_CHANGE_CODE: CHANGE_CODE_MINUTES,
};

// Codes are hashed with the user id: a 6-digit space is tiny, so the hash must
// be unique per user (tokenHash is @unique) and useless without the user.
function hashSecret(secret: string, userId?: string): string {
  return createHash("sha256").update(userId ? `${userId}:${secret}` : secret).digest("hex");
}

export async function issueToken(userId: string, purpose: TokenPurpose): Promise<string> {
  const secret =
    purpose === "PASSWORD_RESET"
      ? randomBytes(32).toString("base64url")
      : String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = new Date();

  await prisma.$transaction([
    prisma.authToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.authToken.create({
      data: {
        userId,
        purpose,
        tokenHash: hashSecret(secret, purpose === "PASSWORD_CHANGE_CODE" ? userId : undefined),
        expiresAt: new Date(now.getTime() + MINUTES[purpose] * 60_000),
      },
    }),
  ]);
  return secret;
}

/** How many secrets of this purpose the user was sent within the window. */
export async function recentTokenCount(
  userId: string,
  purpose: TokenPurpose,
  windowMs: number,
): Promise<number> {
  return prisma.authToken.count({
    where: { userId, purpose, createdAt: { gte: new Date(Date.now() - windowMs) } },
  });
}

// Marks a token used only if it still is unused — two concurrent submits of
// the same link can't both succeed.
async function markUsed(id: string): Promise<boolean> {
  const { count } = await prisma.authToken.updateMany({
    where: { id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1;
}

type Consumed = { ok: true; userId: string } | { ok: false; error: string };

const INVALID_LINK = "This reset link is invalid or has expired. Request a new one.";

/** Look up a reset link's token without using it up (to render the form). */
export async function peekResetToken(raw: string): Promise<boolean> {
  if (!raw) return false;
  const t = await prisma.authToken.findUnique({ where: { tokenHash: hashSecret(raw) } });
  return !!t && t.purpose === "PASSWORD_RESET" && !t.usedAt && t.expiresAt > new Date();
}

export async function consumeResetToken(raw: string): Promise<Consumed> {
  if (!raw) return { ok: false, error: INVALID_LINK };
  const t = await prisma.authToken.findUnique({ where: { tokenHash: hashSecret(raw) } });
  if (!t || t.purpose !== "PASSWORD_RESET" || t.usedAt || t.expiresAt <= new Date()) {
    return { ok: false, error: INVALID_LINK };
  }
  if (!(await markUsed(t.id))) return { ok: false, error: INVALID_LINK };
  return { ok: true, userId: t.userId };
}

export async function consumeChangeCode(userId: string, code: string): Promise<Consumed> {
  const t = await prisma.authToken.findFirst({
    where: { userId, purpose: "PASSWORD_CHANGE_CODE", usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!t || t.expiresAt <= new Date()) {
    return { ok: false, error: "That code has expired. Send a new one." };
  }
  if (t.attempts >= CHANGE_CODE_MAX_ATTEMPTS) {
    return { ok: false, error: "Too many wrong codes. Send a new one." };
  }

  const expected = Buffer.from(t.tokenHash, "hex");
  const actual = Buffer.from(hashSecret(code.trim(), userId), "hex");
  if (!timingSafeEqual(expected, actual)) {
    const { attempts } = await prisma.authToken.update({
      where: { id: t.id },
      data: { attempts: { increment: 1 } },
    });
    const left = CHANGE_CODE_MAX_ATTEMPTS - attempts;
    return {
      ok: false,
      error: left > 0
        ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.`
        : "Too many wrong codes. Send a new one.",
    };
  }

  if (!(await markUsed(t.id))) return { ok: false, error: "That code was already used. Send a new one." };
  return { ok: true, userId };
}

/** Delete tokens that expired more than a day ago (called by the nightly cron). */
export async function purgeExpiredAuthTokens(): Promise<number> {
  const { count } = await prisma.authToken.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  return count;
}
