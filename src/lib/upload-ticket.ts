import { createHmac, timingSafeEqual } from "crypto";

// Signed, expiring tickets for direct-to-storage uploads.
//
// When the server hands the browser an upload URL it also issues a ticket that
// binds the storage path to a scope (e.g. a housekeeping task id). On submit the
// browser sends back {storagePath, ticket}; verifying the ticket proves the
// server chose that path for that task, so a client can't attach someone
// else's file or an arbitrary object in the bucket.

const TICKET_TTL_MS = 3 * 60 * 60 * 1000; // 3 h — longer than Supabase's 2 h signed-upload window

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET is not set");
  return s;
}

function mac(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function signUploadTicket(scope: string, storagePath: string): string {
  const exp = Date.now() + TICKET_TTL_MS;
  return `${exp}.${mac(`${scope}|${storagePath}|${exp}`)}`;
}

export function verifyUploadTicket(scope: string, storagePath: string, ticket: string): boolean {
  const [expStr, sig] = ticket.split(".");
  const exp = Number(expStr);
  if (!sig || !Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = Buffer.from(mac(`${scope}|${storagePath}|${exp}`));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
