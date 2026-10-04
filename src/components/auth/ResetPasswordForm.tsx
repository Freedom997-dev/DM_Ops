"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { NewPasswordFields } from "@/components/auth/NewPasswordFields";
import { completePasswordReset } from "@/lib/actions/password-reset";
import type { ActionState } from "@/lib/actions/rooms";

const EMPTY: ActionState = { ok: false };

// On success the action redirects to /login?reset=1.
export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(completePasswordReset, EMPTY);

  return (
    <form action={formAction} className="card space-y-4 p-6">
      <input type="hidden" name="token" value={token} />
      <NewPasswordFields />
      {state.error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      <SubmitButton className="btn-primary w-full" pendingText="Saving…">
        <Check className="h-4 w-4" />
        Set new password
      </SubmitButton>
    </form>
  );
}
