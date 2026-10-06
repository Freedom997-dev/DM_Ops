"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Smartphone, X } from "lucide-react";
import { useInstallState } from "./useInstallState";

const DISMISS_KEY = "dm-install-banner-dismissed";

/**
 * "Install the app" prompt. Hidden when already running as the installed app.
 *
 *   variant="banner" — Services home: phones only, dismissible (remembered on
 *                      this device).
 *   variant="link"   — login page: one quiet line, on every device.
 *
 * Android Chrome gets a one-tap Install button when the browser allows it;
 * everyone else gets a link to the /install instructions.
 */
export function InstallAppBanner({ variant }: { variant: "banner" | "link" }) {
  const { ready, platform, installed, canPrompt, promptInstall } = useInstallState();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!ready || installed) return null;

  if (variant === "link") {
    return (
      <p className="mt-4 text-center text-sm">
        {canPrompt ? (
          <button onClick={promptInstall} className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
            <Download className="h-4 w-4" />
            Install the app on this device
          </button>
        ) : (
          <Link href="/install" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
            <Smartphone className="h-4 w-4" />
            Install the app on your phone
          </Link>
        )}
      </p>
    );
  }

  const onPhone = platform !== "other";
  if (dismissed || !(onPhone || canPrompt)) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // storage blocked (private mode): hide for this visit only
    }
  }

  return (
    <div className="card flex items-center gap-3 p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
        <Smartphone className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-900">Add the DMO app to your home screen</div>
        <div className="text-xs text-slate-500">Opens full-screen like an app — one tap from your phone.</div>
      </div>
      {canPrompt ? (
        <button onClick={promptInstall} className="btn-primary shrink-0 px-3 py-2 text-sm">
          <Download className="h-4 w-4" />
          Install
        </button>
      ) : (
        <Link href="/install" className="btn-primary shrink-0 px-3 py-2 text-sm">
          How to
        </Link>
      )}
      <button onClick={dismiss} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
