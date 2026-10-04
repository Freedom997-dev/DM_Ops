"use server";

// Self-service password flows.
//   • Forgot password (signed out): email a one-time reset link.
//   • Change password (signed in): email a 6-digit code, then set a new password.
// Both bump User.sessionVersion, which signs the user out on other devices.

import { z } from "zod";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { validatePassword } from "@/lib/password";
import { allowRateLimited, clearFailedAttempts } from "@/lib/login-attempts";
import { sendEmail, emails, appUrl } from "@/lib/email";
import { keepThisSessionSignedIn } from "@/lib/session-refresh";
import {
  issueToken,
  consumeResetToken,
  consumeChangeCode,
  recentTokenCount,
  RESET_TOKEN_MINUTES,
  CHANGE_CODE_MINUTES,
} from "@/lib/auth-tokens";
import type { ActionState } from "./rooms";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL = 3;
const MAX_PER_IP = 10;

// Same reply whether or not the account exists, so the form can't be used to
// discover which emails are registered.
const SENT_MESSAGE =
  "If that email belongs to an active account, we've sent a link to reset the password. Check your inbox (and spam folder).";

async function clientIp(): Promise<string> {
  const fwd = (await headers()).get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

function checkNewPassword(formData: FormData): { ok: true; password: string } | { ok: false; error: string } {
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  const pw = validatePassword(password);
  if (!pw.ok) return pw;
  if (password !== confirm) return { ok: false, error: "The two passwords don't match." };
  return { ok: true, password };
}

async function setPassword(userId: string, password: string) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await bcrypt.hash(password, 12),
      sessionVersion: { increment: 1 },
    },
  });
}

// ---------------------------------------------------------------------------
// Forgot password (signed out)
// ---------------------------------------------------------------------------

export async function requestPasswordReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!parsed.success) return { ok: false, error: "Enter a valid email." };
  const email = parsed.data;

  const ip = await clientIp();
  const allowed =
    (await allowRateLimited(`pw-reset-ip:${ip}`, MAX_PER_IP, WINDOW_MS)) &&
    (await allowRateLimited(`pw-reset:${email}`, MAX_PER_EMAIL, WINDOW_MS));
  if (!allowed) {
    return { ok: false, error: "Too many reset requests. Please wait 15 minutes and try again." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (user?.active) {
    const token = await issueToken(user.id, "PASSWORD_RESET");
    const link = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    await sendEmail({ to: user.email, ...emails.passwordResetLink(user.name, link, RESET_TOKEN_MINUTES) });
    await logAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "User",
      entityId: user.id,
      details: { passwordResetRequested: true, ip },
    });
  }
  return { ok: true, message: SENT_MESSAGE };
}

export async function completePasswordReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Validate the new password first, so a typo doesn't use up the link.
  const pw = checkNewPassword(formData);
  if (!pw.ok) return pw;

  const consumed = await consumeResetToken(String(formData.get("token") || ""));
  if (!consumed.ok) return consumed;

  const target = await prisma.user.findUnique({ where: { id: consumed.userId } });
  if (!target?.active) {
    return { ok: false, error: "This reset link is invalid or has expired. Request a new one." };
  }

  const user = await setPassword(target.id, pw.password);
  await clearFailedAttempts(user.email);
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "User",
    entityId: user.id,
    details: { passwordReset: "self (email link)" },
  });
  await sendEmail({ to: user.email, ...emails.passwordChanged(user.name) });
  redirect("/login?reset=1");
}

// ---------------------------------------------------------------------------
// Change password (signed in, verified by emailed code)
// ---------------------------------------------------------------------------

export async function sendPasswordChangeCode(): Promise<ActionState> {
  const me = await requireUser();
  if ((await recentTokenCount(me.id, "PASSWORD_CHANGE_CODE", WINDOW_MS)) >= MAX_PER_EMAIL) {
    return { ok: false, error: "Too many codes requested. Please wait 15 minutes and try again." };
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  const code = await issueToken(user.id, "PASSWORD_CHANGE_CODE");
  const sent = await sendEmail({ to: user.email, ...emails.passwordChangeCode(user.name, code, CHANGE_CODE_MINUTES) });
  if (!sent) return { ok: false, error: "We couldn't send the email. Try again, or ask a manager to reset your password." };
  return { ok: true, message: `We sent a 6-digit code to ${user.email}. It expires in ${CHANGE_CODE_MINUTES} minutes.` };
}

export async function changePasswordWithCode(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireUser();
  const code = String(formData.get("code") || "").trim();
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "Enter the 6-digit code from the email." };

  const pw = checkNewPassword(formData);
  if (!pw.ok) return pw;

  const consumed = await consumeChangeCode(me.id, code);
  if (!consumed.ok) return consumed;

  const user = await setPassword(me.id, pw.password);
  await keepThisSessionSignedIn(user.sessionVersion);
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "User",
    entityId: user.id,
    details: { passwordChanged: "self (email code)" },
  });
  await sendEmail({ to: user.email, ...emails.passwordChanged(user.name) });
  return { ok: true, message: "Password changed. You've been signed out on other devices." };
}
