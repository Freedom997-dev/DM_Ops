import { requireUser, isManager } from "@/lib/session";
import { Nav } from "@/components/Nav";
import { ToastProvider } from "@/components/Toast";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <ToastProvider>
      <div className="flex flex-1 flex-col">
        <Nav
          user={{
            name: user.name,
            roleKeys: user.roleKeys,
            isSuperAdmin: user.isSuperAdmin,
            canSettings: isManager(user),
          }}
        />
        <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
      </div>
    </ToastProvider>
  );
}
