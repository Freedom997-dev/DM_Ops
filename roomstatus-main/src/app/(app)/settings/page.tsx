import Link from "next/link";
import { ArrowLeft, ChevronRight, Users, History, LayoutGrid, ShieldCheck } from "lucide-react";
import { requireManager } from "@/lib/session";
import { canAccessAdminSection } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function SettingsIndex() {
  const user = await requireManager();

  const sections: {
    href: string;
    icon: React.ReactNode;
    title: string;
    description: string;
    visible: boolean;
  }[] = [
    {
      href: "/settings/staff",
      icon: <Users className="h-5 w-5" />,
      title: "Staff & access",
      description: "Add staff, set roles, reset passwords, deactivate accounts.",
      visible: canAccessAdminSection(user.role, "users"),
    },
    {
      href: "/settings/access",
      icon: <ShieldCheck className="h-5 w-5" />,
      title: "Access control",
      description: "See which roles can run which services.",
      visible: canAccessAdminSection(user.role, "workflows"),
    },
    {
      href: "/settings/services",
      icon: <LayoutGrid className="h-5 w-5" />,
      title: "Services",
      description: "Create, edit and archive service definitions and their items.",
      visible: canAccessAdminSection(user.role, "workflows"),
    },
    {
      href: "/settings/activity",
      icon: <History className="h-5 w-5" />,
      title: "Activity log",
      description: "Every change across the platform, newest first.",
      visible: canAccessAdminSection(user.role, "audit"),
    },
  ];

  const visible = sections.filter((s) => s.visible);

  return (
    <div className="space-y-5">
      <Link
        href="/services"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to services
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">
          Application-wide settings. Each service also has its own settings, reachable from the
          service card.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visible.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="card group flex items-center gap-3 p-5 transition hover:shadow-md"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              {s.icon}
            </span>
            <div className="flex-1">
              <h2 className="text-base font-bold text-slate-900">{s.title}</h2>
              <p className="text-xs text-slate-500">{s.description}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
          </Link>
        ))}
      </div>
    </div>
  );
}
