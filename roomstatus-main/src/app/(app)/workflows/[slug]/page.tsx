import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireWorkflowAccess, isAdmin, isManager } from "@/lib/session";
import { getSignedUrl } from "@/lib/storage";
import { WorkflowMatrix, type MatrixCellSeed, type MatrixRowSeed } from "@/components/WorkflowMatrix";
import type { CellStatus } from "@/components/WorkflowCellButton";

export const dynamic = "force-dynamic";

function todayMidnightUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function parseDateParam(s: string | undefined): Date {
  if (!s) return todayMidnightUTC();
  // Expects YYYY-MM-DD
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return todayMidnightUTC();
  return new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
}

export default async function WorkflowSubmissionPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { date?: string };
}) {
  const { user, workflow } = await requireWorkflowAccess(params.slug);
  if (workflow.shape !== "MATRIX") notFound();

  const targetDate = parseDateParam(searchParams.date);
  const isToday = targetDate.getTime() === todayMidnightUTC().getTime();

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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/workflows"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to workflows
        </Link>
        <Link
          href={`/workflows/${workflow.slug}/history`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"
        >
          <Clock className="h-4 w-4" />
          History
        </Link>
      </div>

      {!isToday && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Viewing past date:{" "}
          {targetDate.toLocaleDateString(undefined, { dateStyle: "full" })}. This is read-only.
        </p>
      )}

      <WorkflowMatrix
        workflowSlug={workflow.slug}
        workflowName={workflow.name}
        submissionId={submission?.id ?? null}
        submissionStatus={(submission?.status as "IN_PROGRESS" | "COMPLETED" | undefined) ?? null}
        rooms={rooms.map((r) => ({ id: r.id, number: r.number, name: r.name }))}
        items={items.map((i) => ({ id: i.id, text: i.text }))}
        seedCells={seedCells}
        seedRows={seedRows}
        isAdmin={isAdmin(user)}
        canMarkComplete={isToday && isManager(user)}
      />
    </div>
  );
}
