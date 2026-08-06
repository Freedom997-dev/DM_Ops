import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Settings, Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission, can } from "@/lib/session";
import { getSignedUrl } from "@/lib/storage";
import { type HkKind, type HkStatus } from "@/lib/housekeeping";
import type { HkTaskView, HkRoomOption, HkPerson, HkStatusAction, HkTaskTemplate } from "@/lib/hk-view";
import { HousekeepingDashboard } from "@/components/HousekeepingDashboard";

export const dynamic = "force-dynamic";

export default async function HousekeepingPage() {
  const user = await requirePermission("housekeeping:board:view");

  const [tasks, rooms, housekeepers, setting, statusActions, taskTemplates] = await Promise.all([
    prisma.housekeepingTask.findMany({
      // Open tasks + anything closed today (so "Ready to Rent" / "Done" stay visible briefly).
      where: {
        OR: [
          { status: { notIn: ["READY_TO_RENT", "DONE"] } },
          { closedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      include: {
        room: { select: { number: true, name: true } },
        assignedHousekeeper: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        submittedBy: { select: { name: true } },
        reviewedBy: { select: { name: true } },
        photos: { select: { id: true, storagePath: true, mediaType: true } },
        items: { orderBy: { order: "asc" }, select: { id: true, label: true, status: true, note: true } },
      },
    }),
    prisma.room.findMany({
      where: { archived: false },
      orderBy: { number: "asc" },
      select: { id: true, number: true, name: true },
    }),
    prisma.user.findMany({
      where: { role: "HOUSEKEEPER", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.housekeepingSetting.findUnique({ where: { id: "singleton" } }),
    prisma.housekeepingStatusAction.findMany({
      where: { archived: false },
      orderBy: { order: "asc" },
      select: { id: true, label: true },
    }),
    prisma.housekeepingTaskTemplate.findMany({
      where: { archived: false },
      orderBy: { order: "asc" },
      select: { id: true, label: true },
    }),
  ]);

  // Every room, flagged if it already has an open cleaning task.
  const openRoomIds = new Set(
    tasks.filter((t) => t.kind === "ROOM_CLEANING" && t.status !== "READY_TO_RENT").map((t) => t.roomId),
  );
  const allRooms: HkRoomOption[] = rooms.map((r) => ({
    id: r.id, number: r.number, name: r.name, busy: openRoomIds.has(r.id),
  }));

  const taskViews: HkTaskView[] = await Promise.all(
    tasks.map(async (t) => ({
      id: t.id,
      kind: t.kind as HkKind,
      title: t.title,
      recurring: t.recurring,
      status: t.status as HkStatus,
      requestReason: t.requestReason,
      roomId: t.roomId,
      roomNumber: t.room?.number ?? null,
      roomName: t.room?.name ?? null,
      assignedTo: t.assignedHousekeeper
        ? { id: t.assignedHousekeeper.id, name: t.assignedHousekeeper.name }
        : null,
      createdByName: t.createdBy?.name ?? null,
      submittedByName: t.submittedBy?.name ?? null,
      reviewedByName: t.reviewedBy?.name ?? null,
      reviewNote: t.reviewNote,
      createdAt: t.createdAt.toISOString(),
      assignedAt: t.assignedAt ? t.assignedAt.toISOString() : null,
      startedAt: t.startedAt ? t.startedAt.toISOString() : null,
      submittedAt: t.submittedAt ? t.submittedAt.toISOString() : null,
      reviewedAt: t.reviewedAt ? t.reviewedAt.toISOString() : null,
      closedAt: t.closedAt ? t.closedAt.toISOString() : null,
      photos: await Promise.all(
        t.photos.map(async (p) => ({
          id: p.id,
          url: await getSignedUrl(p.storagePath, 3600),
          mediaType: (p.mediaType === "VIDEO" ? "VIDEO" : "IMAGE") as "IMAGE" | "VIDEO",
        })),
      ),
      subtasks: t.items.map((it) => ({
        id: it.id,
        label: it.label,
        status: it.status as "PENDING" | "DONE" | "NOT_DONE" | "NA",
        note: it.note,
      })),
    })),
  );

  const roster: HkPerson[] = housekeepers.map((h) => ({ id: h.id, name: h.name }));
  const actions: HkStatusAction[] = statusActions.map((a) => ({ id: a.id, label: a.label }));
  const templates: HkTaskTemplate[] = taskTemplates.map((t) => ({ id: t.id, label: t.label }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/services" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Back to services
        </Link>
        {can(user, "housekeeping:settings:configure") && (
          <Link href="/services/housekeeping/settings" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
            <Settings className="h-4 w-4" /> Settings
          </Link>
        )}
      </div>

      {/* Elegant header */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-brand-700 to-brand-500 p-6 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
            <Sparkles className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">Housekeeping</h1>
            <p className="text-sm text-white/80">Live room turnover &amp; daily tasks — assign, clean, inspect, and rent.</p>
          </div>
        </div>
      </div>

      {setting?.instructions && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">Cleaning instructions: </span>{setting.instructions}
        </div>
      )}

      <HousekeepingDashboard
        tasks={taskViews}
        rooms={allRooms}
        housekeepers={roster}
        statusActions={actions}
        taskTemplates={templates}
        caps={{
          manage: can(user, "housekeeping:tasks:manage"),
          submit: can(user, "housekeeping:tasks:submit"),
          review: can(user, "housekeeping:cleaning:review"),
          admin: can(user, "housekeeping:settings:configure"),
        }}
        currentUserId={user.id}
      />
    </div>
  );
}
