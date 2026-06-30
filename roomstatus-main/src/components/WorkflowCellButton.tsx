"use client";

import clsx from "clsx";
import { useState, useTransition } from "react";
import { Check, X, Minus } from "lucide-react";
import { updateCell } from "@/lib/actions/workflows";

export type CellStatus = "OK" | "ISSUE" | "NA";

type Props = {
  submissionId: string;
  roomId: string;
  itemId: string;
  initialStatus: CellStatus | null;
  lastUpdatedBy?: string | null;
  disabled?: boolean;
  onChange?: (status: CellStatus | null) => void;
};

const CHOICES: { value: CellStatus; label: string; icon: typeof Check; classes: string }[] = [
  { value: "OK",    label: "OK",    icon: Check, classes: "bg-emerald-500 text-white"  },
  { value: "ISSUE", label: "Issue", icon: X,     classes: "bg-red-500 text-white"      },
  { value: "NA",    label: "N/A",   icon: Minus, classes: "bg-slate-400 text-white"    },
];

export function WorkflowCellButton({
  submissionId,
  roomId,
  itemId,
  initialStatus,
  lastUpdatedBy,
  disabled,
  onChange,
}: Props) {
  const [status, setStatus] = useState<CellStatus | null>(initialStatus);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pick(next: CellStatus) {
    if (disabled) return;
    setError(null);
    const prev = status;
    // Optimistic
    setStatus(next);
    onChange?.(next);
    startTransition(async () => {
      const res = await updateCell({ submissionId, roomId, itemId, status: next });
      if (!res.ok) {
        setError(res.error);
        setStatus(prev);
        onChange?.(prev);
      }
    });
  }

  return (
    <div
      className={clsx(
        "flex items-center justify-center gap-0.5 p-0.5",
        pending && "opacity-60",
      )}
      title={
        error
          ? error
          : lastUpdatedBy
            ? `Last updated by ${lastUpdatedBy}`
            : undefined
      }
    >
      {CHOICES.map((c) => {
        const active = status === c.value;
        const Icon = c.icon;
        return (
          <button
            key={c.value}
            type="button"
            disabled={disabled || pending}
            onClick={() => pick(c.value)}
            aria-label={`Mark ${c.label}`}
            aria-pressed={active}
            className={clsx(
              "flex h-7 w-7 items-center justify-center rounded transition",
              active ? c.classes : "bg-slate-100 text-slate-300 hover:bg-slate-200 hover:text-slate-500",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={3} />
          </button>
        );
      })}
    </div>
  );
}
