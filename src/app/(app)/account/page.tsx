import { requireUser } from "@/lib/session";
import { ChangePasswordCard } from "@/components/auth/ChangePasswordCard";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My account</h1>
        <p className="text-sm text-slate-500">
          To change your name or sign-in email, ask a manager.
        </p>
      </div>

      <div className="card divide-y divide-slate-100">
        <div className="flex justify-between gap-3 px-4 py-3 text-sm">
          <span className="text-slate-500">Name</span>
          <span className="font-medium text-slate-900">{user.name}</span>
        </div>
        <div className="flex justify-between gap-3 px-4 py-3 text-sm">
          <span className="text-slate-500">Sign-in email</span>
          <span className="font-medium text-slate-900">{user.email}</span>
        </div>
      </div>

      <ChangePasswordCard email={user.email ?? ""} />
    </div>
  );
}
