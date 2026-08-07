"use client";

import clsx from "clsx";
import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { updateCell } from "@/lib/actions/workflows";

export type CellStatus = "OK" | "ISSUE" | "NA";

type Props = {
  submissionId: string | null;
  ensureSubmission: () => Promise<string | null>;
  roomId: string;
  itemId: string;
  initialStatus: CellStatus | null;
  lastUpdatedBy?: string | null;
  disabled?: boolean;
  onChange?: (status: CellStatus | null) => void;
};

// Single cycling checkbox:
//   blank (N/A) → OK (✓) → Issue (✗) → blank …
function nextStatus(cur: CellStatus | null): CellStatus | null {
  if (cur === null || cur === "NA") return "OK";
  if (cur === "OK") return "ISSUE";
  return null; // ISSUE → blank
}

export function WorkflowCellButton({
  submissionId,
  ensureSubmission,
  roomId,
  itemId,
  initialStatus,
  lastUpdatedBy,
  disabled,
  onChange,
}: Props) {
  const [status, setStatus] = useState<CellStatus | null>(
    initialStatus === "NA" ? null : initialStatus,
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cycle() {
    if (disabled) return;
    setError(null);
    const prev = status;
    const next = nextStatus(status);
    // Optimistic
    setStatus(next);
    onChange?.(next);
    startTransition(async () => {
      // Create the day's submission on first interaction if it doesn't exist yet.
      let sid = submissionId;
      if (!sid) {
        sid = await ensureSubmission();
        if (!sid) {
          setError("Could not start today's inspection.");
          setStatus(prev);
          onChange?.(prev);
          return;
        }
      }
      // null (blank) is sent as "NA" which the server treats as "clear the cell".
      const res = await updateCell({
        submissionId: sid,
        roomId,
        itemId,
        status: next ?? "NA",
      });
      if (!res.ok) {
        setError(res.error);
        setStatus(prev);
        onChange?.(prev);
      }
    });
  }

  const label =
    status === "OK" ? "OK" : status === "ISSUE" ? "Issue" : "Blank / N/A";

  return (
    <div className="flex items-center justify-center p-1">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={cycle}
        aria-label={`${label} — tap to change`}
        title={
          error
            ? error
            : lastUpdatedBy
              ? `${label} · last updated by ${lastUpdatedBy}`
              : label
        }
        className={clsx(
          "flex h-8 w-8 items-center justify-center rounded-md border transition",
          status === "OK" && "border-emerald-600 bg-emerald-500 text-white",
          status === "ISSUE" && "border-red-600 bg-red-500 text-white",
          (status === null || status === "NA") &&
            "border-slate-300 bg-white text-transparent hover:border-brand-400 hover:bg-brand-50",
          pending && "opacity-60",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        {status === "OK" && <Check className="h-4 w-4" strokeWidth={3} />}
        {status === "ISSUE" && <X className="h-4 w-4" strokeWidth={3} />}
      </button>
    </div>
  );
}
