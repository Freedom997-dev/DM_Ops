"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { requestPasswordReset } from "@/lib/actions/password-reset";
import type { ActionState } from "@/lib/actions/rooms";

const EMPTY: ActionState = { ok: false };

export default function ForgotPasswordPage() {
  const [state, formAction] = useActionState(requestPasswordReset, EMPTY);

  return (
    <AuthShell title="Reset your password">
      <div className="card space-y-4 p-6">
        {state.ok ? (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message}</p>
        ) : (
          <form action={formAction} className="space-y-4">
            <p className="text-sm text-slate-600">
              Enter the email you sign in with. We&apos;ll send you a link to set a new password.
            </p>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                autoFocus
                className="input"
                placeholder="you@divyamotel.com"
              />
            </div>
            {state.error && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
            )}
            <SubmitButton className="btn-primary w-full" pendingText="Sending…">
              <Mail className="h-4 w-4" />
              Send reset link
            </SubmitButton>
          </form>
        )}
        <Link href="/login" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}
