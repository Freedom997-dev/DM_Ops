import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, DoorOpen } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireWorkflowAccess, isAdmin, isManager, can } from "@/lib/session";
import { getSignedUrl } from "@/lib/storage";
import { WorkflowMatrix, type MatrixCellSeed, type MatrixRowSeed } from "@/components/WorkflowMatrix";
import type { CellStatus } from "@/components/WorkflowCellButton";
import { WorkflowDayBar } from "@/components/WorkflowDayBar";
import { motelTodayUTC, formatBusinessDate } from "@/lib/business-date";
import { sheetState, dateKey, parseDateKey, addDays } from "@/lib/workflow-lock";

export const dynamic = "force-dynamic";

export default async function WorkflowSubmissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { user, workflow } = await requireWorkflowAccess((await params).slug);
  if (workflow.shape !== "MATRIX") notFound();

  const today = motelTodayUTC();
  const dateParam = (await searchParams).date;
  const parsed = parseDateKey(dateParam);
  // No date, a malformed one, or a future one: show today.
  if (dateParam !== undefined && (!parsed || parsed > today)) redirect(`/services/${workflow.slug}`);
  const targetDate = parsed ?? today;

  const [items, rooms, submission] = await Promise.all([
    prisma.workflowItem.findMany({
      where: { workflowId: workflow.id, archived: false },
      orderBy: { order: "asc" },
    }),
    prisma.room.findMany({
      where: { archived: false },
      orderBy: { number: "asc" },
    }),
    prisma.workflowSubmission.findUnique({
      where: { workflowId_date: { workflowId: workflow.id, date: targetDate } },
      include: {
        unlockedBy: { select: { name: true } },
        cells: {
          include: { lastUpdatedBy: { select: { name: true } } },
        },
        rows: {
          include: {
            images: true,
            lastUpdatedBy: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const seedCells: MatrixCellSeed[] =
    submission?.cells.map((c) => ({
      roomId: c.roomId,
      itemId: c.itemId,
      status: c.status as CellStatus,
      lastUpdatedBy: c.lastUpdatedBy?.name ?? null,
    })) ?? [];

  // Pre-sign URLs for any row images
  const seedRows: MatrixRowSeed[] = await Promise.all(
    (submission?.rows ?? []).map(async (r) => ({
      roomId: r.roomId,
      note: r.note,
      images: await Promise.all(
        r.images.map(async (img) => ({
          id: img.id,
          url: await getSignedUrl(img.storagePath, 3600),
          width: img.width,
          height: img.height,
        })),
      ),
    })),
  );

  const state = sheetState(targetDate, today, submission);
  const key = dateKey(targetDate);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/services/${workflow.slug}/history`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          All days
        </Link>
        <div className="flex items-center gap-4">
          {can(user, "pm:rooms:add") && (
            <Link
              href="/settings/rooms?add=1"
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"
            >
              <DoorOpen className="h-4 w-4" />
              Rooms
            </Link>
          )}
        </div>
      </div>

      <WorkflowDayBar
        workflowSlug={workflow.slug}
        dateKey={key}
        dateLabel={formatBusinessDate(targetDate)}
        todayKey={dateKey(today)}
        prevKey={dateKey(addDays(targetDate, -1))}
        nextKey={state.kind === "today" ? null : dateKey(addDays(targetDate, 1))}
        isToday={state.kind === "today"}
      />

      <WorkflowMatrix
        workflowSlug={workflow.slug}
        workflowName={workflow.name}
        dateKey={key}
        submissionId={submission?.id ?? null}
        submissionStatus={(submission?.status as "IN_PROGRESS" | "COMPLETED" | undefined) ?? null}
        rooms={rooms.map((r) => ({ id: r.id, number: r.number, name: r.name }))}
        items={items.map((i) => ({ id: i.id, text: i.text }))}
        seedCells={seedCells}
        seedRows={seedRows}
        isAdmin={isAdmin(user)}
        canMarkComplete={isManager(user)}
        canUnlock={isManager(user)}
        isPast={state.kind === "past"}
        editable={state.editable}
        lockReason={state.lockReason}
        unlockedBy={state.unlocked ? (submission?.unlockedBy?.name ?? "a manager") : null}
        printDateLabel={formatBusinessDate(targetDate)}
        printFileDate={key}
      />
    </div>
  );
}
