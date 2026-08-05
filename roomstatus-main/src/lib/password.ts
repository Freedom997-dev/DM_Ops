// Password policy — single source of truth for what counts as an acceptable
// password. Used by staff creation and password-reset flows.
//
//   • Minimum 8 characters (the biggest lever against brute force).
//   • Maximum 72 (bcrypt ignores bytes past 72; reject rather than silently
//     truncate and give a false sense of strength).
//   • Must contain a letter AND a number.
//   • Reject the most common passwords outright.
// Per NIST 800-63B, length + a blocklist beats complexity rules that just push
// users toward predictable "Password1!" patterns.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "qwerty123",
  "iloveyou",
  "letmein1",
  "admin123",
  "welcome1",
]);

export type PasswordCheck = { ok: true } | { ok: false; error: string };

export function validatePassword(password: unknown): PasswordCheck {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return {
      ok: false,
      error: `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`,
    };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { ok: false, error: "Password must include at least one letter." };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, error: "Password must include at least one number." };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return {
      ok: false,
      error: "That password is too common. Choose a less predictable one.",
    };
  }
  return { ok: true };
}
