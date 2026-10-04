import { cookies } from "next/headers";
import { decode, encode } from "next-auth/jwt";
import { SESSION_MAX_AGE } from "@/lib/auth";

// NextAuth's session cookie name: "__Secure-" prefixed when served over HTTPS.
const SESSION_COOKIES = ["__Secure-next-auth.session-token", "next-auth.session-token"];

/**
 * After a user changes their own password, their sessionVersion is bumped,
 * which signs out every session — including this one. Re-issue *this
 * request's* session cookie with the new version so the device that made the
 * change stays signed in. Done server-side on purpose: a client-triggered
 * session refresh could be replayed by a stale device to undo the sign-out.
 */
export async function keepThisSessionSignedIn(sessionVersion: number): Promise<void> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return;
  const jar = await cookies();
  const name = SESSION_COOKIES.find((n) => jar.get(n));
  if (!name) return;

  const token = await decode({ token: jar.get(name)!.value, secret });
  if (!token) return;

  const value = await encode({
    token: { ...token, sv: sessionVersion },
    secret,
    maxAge: SESSION_MAX_AGE,
  });
  jar.set(name, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: name.startsWith("__Secure-"),
    maxAge: SESSION_MAX_AGE,
  });
}
