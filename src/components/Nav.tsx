"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import clsx from "clsx";
import {
  BedDouble,
  LayoutDashboard,
  DoorOpen,
  ListChecks,
  Users,
  History,
  LogOut,
  Menu,
  X,
} from "lucide-react";

type NavUser = { name?: string | null; role: string };

const ICONS = {
  dashboard: LayoutDashboard,
  rooms: DoorOpen,
  questions: ListChecks,
  users: Users,
  audit: History,
} as const;

export function Nav({ user }: { user: NavUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isAdmin = user.role === "ADMIN";

  const links: { href: string; label: string; icon: keyof typeof ICONS; admin?: boolean }[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/rooms", label: "Rooms", icon: "rooms" },
    { href: "/admin/questions", label: "Checklist", icon: "questions", admin: true },
    { href: "/admin/users", label: "Staff", icon: "users", admin: true },
    { href: "/admin/audit", label: "Activity", icon: "audit", admin: true },
  ];

  const visible = links.filter((l) => !l.admin || isAdmin);

  function NavLinks({ onClick }: { onClick?: () => void }) {
    return (
      <>
        {visible.map((link) => {
          const Icon = ICONS[link.icon];
          const active =
            pathname === link.href || pathname.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClick}
              className={clsx(
                "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </>
    );
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
            <BedDouble className="h-5 w-5" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-bold text-slate-900">Divya Motel</span>
            <span className="text-[11px] text-slate-400">Room Condition</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          <NavLinks />
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <div className="text-right leading-tight">
            <div className="text-sm font-medium text-slate-700">{user.name}</div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400">
              {user.role}
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="btn-secondary px-3 py-2"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {/* Mobile toggle */}
        <button
          className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label="Menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            <NavLinks onClick={() => setOpen(false)} />
          </nav>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <div className="leading-tight">
              <div className="text-sm font-medium text-slate-700">{user.name}</div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400">
                {user.role}
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="btn-secondary px-3 py-2"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
