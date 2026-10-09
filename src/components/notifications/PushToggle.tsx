"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, Loader2, Smartphone } from "lucide-react";
import { removePushSubscription, savePushSubscription } from "@/lib/actions/notifications";

type State = "loading" | "unsupported" | "needs-install" | "no-key" | "blocked" | "off" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

// "Phone notifications on this device": registers /sw.js, asks permission,
// saves the push subscription. Each device is turned on separately.
export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!vapidPublicKey) return setState("no-key");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // iPhone only supports push for apps added to the home screen.
        return setState(isIos() && !isStandalone() ? "needs-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [vapidPublicKey]);

  async function turnOn() {
    if (!vapidPublicKey) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
        }));
      const res = await savePushSubscription(sub.toJSON(), navigator.userAgent);
      if (!res.ok) throw new Error(res.error);
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't turn on notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  const note: Record<Exclude<State, "on" | "off" | "loading">, string> = {
    "needs-install": "On iPhone, add DMO to your home screen first (Share → Add to Home Screen), open it from there, then come back here.",
    unsupported: "This browser can't show phone notifications. Try Chrome on Android, or the DMO app on iPhone.",
    "no-key": "Phone notifications aren't set up on the server yet. You'll still see everything under the bell.",
    blocked: "Notifications are blocked for this site. Allow them in your browser or phone settings, then reload.",
  };

  return (
    <div className="card flex flex-wrap items-center gap-3 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Smartphone className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-900">Phone notifications on this device</div>
        <div className="text-xs text-slate-500">
          {state === "on"
            ? "On — you'll get alerts even when the app is closed."
            : state === "off"
              ? "Off — turn on to get alerts on this phone or computer."
              : state === "loading"
                ? "Checking…"
                : note[state]}
        </div>
        {error && <div className="mt-1 text-xs text-red-700">{error}</div>}
      </div>
      {state === "off" && (
        <button type="button" onClick={turnOn} disabled={busy} className="btn-primary">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
          Turn on
        </button>
      )}
      {state === "on" && (
        <button type="button" onClick={turnOff} disabled={busy} className="btn-secondary">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />}
          Turn off
        </button>
      )}
    </div>
  );
}
