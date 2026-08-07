import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { History, ArrowLeft } from "lucide-react";
import clsx from "clsx";

export const dynamic = "force-dynamic";

const ACTION_TONE: Record<string, string> = {
  CREATE: "bg-emerald-100 text-emerald-700",
  UPDATE: "bg-blue-100 text-blue-700",
  ARCHIVE: "bg-amber-100 text-amber-700",
  RESTORE: "bg-emerald-100 text-emerald-700",
  LOGIN: "bg-slate-100 text-slate-600",
};

export default async function ActivityPage() {
  await requireManager();

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { name: true } } },
  });

  return (
    <div className="space-y-5">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to settings
      </Link>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <History className="h-6 w-6 text-brand-600" />
          Activity log
        </h1>
        <p className="text-sm text-slate-500">
          Every change to rooms, checklist, staff and inspections is recorded here.
        </p>
      </div>

      <div className="card overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No activity yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Who</th>
                  <th className="px-4 py-2.5 font-medium">Action</th>
                  <th className="px-4 py-2.5 font-medium">Entity</th>
                  <th className="px-4 py-2.5 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">
                      {new Date(log.createdAt).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {log.user?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={clsx(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          ACTION_TONE[log.action] ?? "bg-slate-100 text-slate-600",
                        )}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{log.entity}</td>
                    <td className="max-w-xs truncate px-4 py-2.5 text-slate-400" title={log.details ?? ""}>
                      {log.details ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
