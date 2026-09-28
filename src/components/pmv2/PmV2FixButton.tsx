"use client";

import { useTransition } from "react";
import { Wrench } from "lucide-react";
import { useToast } from "@/components/Toast";
import { pmv2MarkFixed } from "@/lib/actions/pmv2";
import { todayISO } from "@/lib/pmv2";

export function PmV2FixButton({ resultId }: { resultId: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await pmv2MarkFixed({ resultId, today: todayISO() });
          if (!res.ok) toast.show(res.error, "error");
        })
      }
      className="btn-secondary px-3 py-1.5 text-xs"
    >
      <Wrench className="h-3.5 w-3.5" />
      {pending ? "Saving…" : "Mark fixed"}
    </button>
  );
}
