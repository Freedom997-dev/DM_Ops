"use client";

import Link from "next/link";
import { ArrowLeft, BedDouble, CheckCircle2, Download } from "lucide-react";
import { InstallSteps } from "./InstallSteps";
import { useInstallState } from "./useInstallState";

export function InstallGuide() {
  const { ready, platform, installed, canPrompt, promptInstall } = useInstallState();

  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-br from-brand-50 via-slate-50 to-slate-100 px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/20">
            <BedDouble className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Divya Motel</h1>
          <p className="text-sm text-slate-500">Install the app on your phone</p>
        </div>
        <div className="card space-y-4 p-6">
          {ready && installed ? (
            <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              You&apos;re already using the installed app.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Add the <b>DMO</b> app to your home screen. It opens full-screen with its own icon, just like an app.
                Nothing to download from an app store.
              </p>
              {canPrompt && (
                <button onClick={promptInstall} className="btn-primary w-full">
                  <Download className="h-4 w-4" />
                  Install now
                </button>
              )}
              <InstallSteps platform={ready ? platform : "other"} />
              <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
                <li>You still sign in with your email and password. You stay signed in for 7 days.</li>
                <li>It needs an internet connection.</li>
                <li>Old icon or name? Delete the shortcut, reload this page, and add it again.</li>
              </ul>
            </>
          )}
          <Link href="/services" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-4 w-4" />
            Go to the portal
          </Link>
        </div>
      </div>
    </main>
  );
}
