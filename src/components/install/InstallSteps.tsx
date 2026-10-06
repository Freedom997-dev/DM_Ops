import { EllipsisVertical, Share, SquarePlus } from "lucide-react";
import clsx from "clsx";
import type { Platform } from "./useInstallState";

// Step-by-step install instructions. Keep in sync with docs/user-guide.md.

const ANDROID = [
  <>Open this site in <b>Chrome</b>.</>,
  <>Tap the <EllipsisVertical className="inline h-4 w-4 align-text-bottom" /> menu (top right).</>,
  <>Tap <b>Install app</b> (or <b>Add to Home screen</b>), then <b>Install</b>.</>,
];

const IOS = [
  <>Open this site in <b>Safari</b> (not Chrome).</>,
  <>Tap the <Share className="inline h-4 w-4 align-text-bottom" /> <b>Share</b> button at the bottom.</>,
  <>Scroll down, tap <SquarePlus className="inline h-4 w-4 align-text-bottom" /> <b>Add to Home Screen</b>, then <b>Add</b>.</>,
];

function Steps({ title, steps, highlight }: { title: string; steps: React.ReactNode[]; highlight: boolean }) {
  return (
    <div className={clsx("rounded-xl p-4 ring-1", highlight ? "bg-brand-50 ring-brand-200" : "bg-white ring-slate-200")}>
      <h3 className="mb-2 text-sm font-semibold text-slate-900">
        {title}
        {highlight && <span className="ml-2 chip-brand">Your phone</span>}
      </h3>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>
  );
}

/** Both platforms, the visitor's own first (or Android first on desktop). */
export function InstallSteps({ platform }: { platform: Platform }) {
  const android = <Steps key="a" title="Android" steps={ANDROID} highlight={platform === "android"} />;
  const ios = <Steps key="i" title="iPhone / iPad" steps={IOS} highlight={platform === "ios"} />;
  return <div className="grid gap-3 sm:grid-cols-2">{platform === "ios" ? [ios, android] : [android, ios]}</div>;
}
