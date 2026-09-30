import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission, can } from "@/lib/session";
import { RoomsManager } from "@/components/RoomsManager";

export const dynamic = "force-dynamic";

// Shared room list used by Daily Cleanliness, Housekeeping and PM V1.
// (PM V2 keeps its own rooms & areas under Room Condition → Setup.)
export default async function SettingsRoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string; edit?: string }>;
}) {
  const user = await requirePermission("pm:rooms:view");
  const sp = await searchParams;

  const rooms = await prisma.room.findMany({
    select: { id: true, number: true, name: true, floor: true, notes: true, archived: true },
  });
  rooms.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));

  return (
    <div className="space-y-5">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to settings
      </Link>
      <RoomsManager
        rooms={rooms}
        isAdmin={can(user, "pm:rooms:update")}
        initialAdd={sp.add === "1"}
        initialEditId={sp.edit ?? null}
        basePath="/settings/rooms"
        pmLinks={false}
      />
    </div>
  );
}
