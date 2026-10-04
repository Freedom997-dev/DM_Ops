import { BedDouble } from "lucide-react";

// Shared frame for the signed-out pages (forgot / reset password), matching
// the login page.
export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-br from-brand-50 via-slate-50 to-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/20">
            <BedDouble className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Divya Motel</h1>
          <p className="text-sm text-slate-500">{title}</p>
        </div>
        {children}
        <p className="mt-6 text-center text-xs text-slate-400">Authorized staff only · Divya Motel</p>
      </div>
    </main>
  );
}
