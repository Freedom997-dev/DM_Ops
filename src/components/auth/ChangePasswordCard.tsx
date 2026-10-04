"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Check, KeyRound, Loader2, Mail } from "lucide-react";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { NewPasswordFields } from "@/components/auth/NewPasswordFields";
import { useToast } from "@/components/Toast";
import { sendPasswordChangeCode, changePasswordWithCode } from "@/lib/actions/password-reset";
import type { ActionState } from "@/lib/actions/rooms";

const EMPTY: ActionState = { ok: false };

// Two steps: email a 6-digit code to the signed-in user, then enter it with
// the new password.
export function ChangePasswordCard({ email }: { email: string }) {
  const toast = useToast();
  const [codeSent, setCodeSent] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const [state, formAction] = useActionState(changePasswordWithCode, EMPTY);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast.show(state.message ?? "Password changed.");
      formRef.current?.reset();
      setCodeSent(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function sendCode() {
    setSendError(null);
    startSending(async () => {
      const res = await sendPasswordChangeCode();
      if (res.ok) setCodeSent(res.message ?? "Code sent.");
      else setSendError(res.error ?? "Could not send the code.");
    });
  }

  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-brand-600" />
        <h2 className="text-lg font-bold text-slate-900">Change password</h2>
      </div>

      {!codeSent ? (
        <>
          <p className="text-sm text-slate-600">
            To confirm it&apos;s you, we&apos;ll email a 6-digit code to <span className="font-medium">{email}</span>.
          </p>
          {sendError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{sendError}</p>}
          <button type="button" onClick={sendCode} disabled={sending} className="btn-primary">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Email me a code
          </button>
        </>
      ) : (
        <form ref={formRef} action={formAction} className="space-y-4">
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{codeSent}</p>
          <div>
            <label className="label" htmlFor="code">Verification code</label>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              autoFocus
              className="input tracking-[0.4em]"
              placeholder="000000"
            />
          </div>
          <NewPasswordFields />
          {state.error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
          <div className="flex flex-wrap gap-2">
            <SubmitButton pendingText="Saving…">
              <Check className="h-4 w-4" />
              Change password
            </SubmitButton>
            <button type="button" onClick={sendCode} disabled={sending} className="btn-secondary">
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              Send a new code
            </button>
          </div>
          {sendError && <p className="text-sm text-red-700">{sendError}</p>}
        </form>
      )}
    </div>
  );
}
