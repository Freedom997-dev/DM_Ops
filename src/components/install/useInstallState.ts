"use client";

import { useEffect, useState } from "react";

// Install-to-home-screen helpers (app manifest: src/app/manifest.ts).
//
//   platform   — "ios" (Safari "Add to Home Screen" only), "android", or "other"
//   installed  — already running as the installed app (no browser bar)
//   promptInstall — Android/desktop Chrome's own install dialog, when offered
//
// `ready` stays false until mounted, so nothing renders on the server and
// there's no hydration mismatch from reading the user agent.

export type Platform = "ios" | "android" | "other";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support tells them apart.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  if (/Android/.test(ua)) return "android";
  return "other";
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function useInstallState() {
  const [ready, setReady] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const [installed, setInstalled] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isStandalone());
    setReady(true);

    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep Chrome's mini-infobar from showing; we offer a button
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function promptInstall() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null); // the event can only be used once
  }

  return { ready, platform, installed, canPrompt: !!deferred, promptInstall };
}
