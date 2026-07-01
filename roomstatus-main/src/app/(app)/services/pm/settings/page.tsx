import Link from "next/link";
import { ArrowLeft, ChevronRight, ListChecks, DoorOpen } from "lucide-react";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PmSettingsPage() {
  await requireAdmin();

  const cards = [
    {
      href: "/services/pm/settings/checklist",
      icon: <ListChecks className="h-5 w-5" />,
      title: "Checklist",
      description: "Add, edit, reorder and archive the sections and questions inspectors work through.",
    },
    {
      href: "/services/pm/rooms",
      icon: <DoorOpen className="h-5 w-5" />,
      title: "Rooms",
      description: "Manage the rooms this service inspects (add, edit, archive).",
    },
  ];

  return (
    <div className="space-y-5">
      <Link
        href="/services/pm"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Room Condition (PM)
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Room Condition (PM) — Settings</h1>
        <p className="text-sm text-slate-500">Settings specific to the PM inspection service.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card group flex items-center gap-3 p-5 transition hover:shadow-md"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              {c.icon}
            </span>
            <div className="flex-1">
              <h2 className="text-base font-bold text-slate-900">{c.title}</h2>
              <p className="text-xs text-slate-500">{c.description}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
          </Link>
        ))}
      </div>
    </div>
  );
}
