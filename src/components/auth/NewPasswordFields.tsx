import { PASSWORD_MIN_LENGTH } from "@/lib/password";

// "New password" + "Confirm" inputs shared by the reset and change flows. The
// server re-checks everything with validatePassword().
export function NewPasswordFields() {
  return (
    <>
      <div>
        <label className="label" htmlFor="password">New password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          className="input"
        />
        <p className="mt-1 text-xs text-slate-400">
          At least {PASSWORD_MIN_LENGTH} characters, with a letter and a number.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">Confirm new password</label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          className="input"
        />
      </div>
    </>
  );
}
