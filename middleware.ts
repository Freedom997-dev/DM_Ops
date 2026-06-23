import { withAuth } from "next-auth/middleware";

// Protects the application routes. Unauthenticated users are redirected to
// /login. (Admin-only checks are enforced again server-side per page.)
export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: ["/dashboard/:path*", "/rooms/:path*", "/inspect/:path*", "/admin/:path*"],
};
