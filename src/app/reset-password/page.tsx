import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { peekResetToken } from "@/lib/auth-tokens";

export const dynamic = "force-dynamic";
// The token is in the URL: don't leak it to other sites via the Referer header.
export const metadata = { referrer: "no-referrer" as const };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token ?? "";
  const valid = await peekResetToken(token);

  return (
    <AuthShell title="Set a new password">
      {valid ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="card space-y-4 p-6">
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            This reset link is invalid or has expired. Links work once and expire after 30 minutes.
          </p>
          <Link href="/forgot-password" className="btn-primary w-full">
            Request a new link
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
