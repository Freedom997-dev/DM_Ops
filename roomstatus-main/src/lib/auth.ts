import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import {
  getLockoutStatus,
  recordFailedAttempt,
  clearFailedAttempts,
} from "@/lib/login-attempts";

// Thrown by authorize() when an email is temporarily locked out. The login page
// keys off this exact string to show a distinct message.
export const LOCKED_OUT_ERROR = "TOO_MANY_ATTEMPTS";

function clientIpFrom(headers: unknown): string | null {
  const fwd = (headers as Record<string, string | undefined> | undefined)?.[
    "x-forwarded-for"
  ];
  return typeof fwd === "string" ? fwd.split(",")[0]!.trim() : null;
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7, // 7 days (was NextAuth's 30-day default)
  },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email.toLowerCase().trim();
        const ip = clientIpFrom(req?.headers);

        // Refuse before doing any password work if this email is locked out.
        const lockout = await getLockoutStatus(email);
        if (lockout.locked) throw new Error(LOCKED_OUT_ERROR);

        const user = await prisma.user.findUnique({ where: { email } });

        // Short-circuits so bcrypt only runs for a real, active user; a missing
        // or inactive account fails identically (no user enumeration).
        const valid =
          !!user &&
          user.active &&
          (await bcrypt.compare(credentials.password, user.passwordHash));

        if (!valid) {
          await recordFailedAttempt(email, ip);
          return null;
        }

        await clearFailedAttempts(email);

        // Roles/permissions are resolved per request in src/lib/session.ts, so
        // the token only needs to identify the user.
        return {
          id: user.id,
          name: user.name,
          email: user.email,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
