import "next-auth";
import "next-auth/jwt";

// The auth token/session only identifies the user. Roles and permissions are
// resolved from the DB per request (see src/lib/session.ts), never stored in
// the JWT, so permission changes take effect without re-login.

declare module "next-auth" {
  interface User {
    id: string;
  }
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
  }
}
