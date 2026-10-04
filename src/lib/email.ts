// Outgoing email (password reset links, change codes, security notices).
//
// Sends through Resend when RESEND_API_KEY is set. Without it (local dev) the
// message is printed to the server console instead, so every flow can be
// exercised without an email account.

import { Resend } from "resend";

const APP_NAME = "Divya Motel Operations";

type Email = { to: string; subject: string; text: string };

let client: Resend | null = null;

export async function sendEmail({ to, subject, text }: Email): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`\n[email] (RESEND_API_KEY not set — not sent)\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return true;
  }
  client ??= new Resend(key);
  const { error } = await client.emails.send({
    from: process.env.EMAIL_FROM || `Divya Motel <onboarding@resend.dev>`,
    to,
    subject,
    text,
  });
  if (error) {
    // Never include the message body: it may contain a reset link or code.
    console.error(`[email] Send failed (${subject}):`, error.message);
    return false;
  }
  return true;
}

// Base URL for links in emails. Taken from configuration, never from the
// request's Host header, so a forged Host can't redirect reset links.
export function appUrl(): string {
  const url = process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3001";
  return url.replace(/\/+$/, "");
}

const footer = `\n\nIf you didn't expect this email, contact your manager.\n— ${APP_NAME}`;

export const emails = {
  passwordResetLink: (name: string, link: string, minutes: number): Omit<Email, "to"> => ({
    subject: "Reset your password",
    text:
      `Hi ${name},\n\nUse this link to set a new password. It works once and expires in ${minutes} minutes:\n\n${link}` +
      `\n\nIf you didn't ask for this, ignore this email — your password stays the same.` +
      footer,
  }),
  passwordChangeCode: (name: string, code: string, minutes: number): Omit<Email, "to"> => ({
    subject: `Your verification code: ${code}`,
    text:
      `Hi ${name},\n\nYour code to change your password is:\n\n    ${code}\n\nIt expires in ${minutes} minutes.` +
      footer,
  }),
  passwordChanged: (name: string): Omit<Email, "to"> => ({
    subject: "Your password was changed",
    text:
      `Hi ${name},\n\nThe password for your account was just changed, and you've been signed out on other devices.` +
      footer,
  }),
  emailChangedOld: (name: string, newEmail: string): Omit<Email, "to"> => ({
    subject: "Your sign-in email was changed",
    text:
      `Hi ${name},\n\nAn administrator changed the email you sign in with to ${newEmail}. This address will no longer work for signing in.` +
      footer,
  }),
  emailChangedNew: (name: string, oldEmail: string): Omit<Email, "to"> => ({
    subject: "This is now your sign-in email",
    text:
      `Hi ${name},\n\nAn administrator changed the email you sign in with from ${oldEmail} to this address. Your password hasn't changed.\n\nSign in at ${appUrl()}/login` +
      footer,
  }),
};
