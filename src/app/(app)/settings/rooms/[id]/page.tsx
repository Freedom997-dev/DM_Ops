import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import {
  ArrowLeft, ClipboardCheck, History, ImageOff, PencilLine, Sparkles, Trash2, Video, Wrench,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { getSignedUrl } from "@/lib/storage";
import { LocalDateTime } from "@/components/LocalDateTime";

export const dynamic = "force-dynamic";

// Room history — one timeline per room, built from data the app already keeps:
// housekeeping cleanings (with each round from the audit log), Daily
// Cleanliness results, Room Condition (PM V2) findings, room edits, and
// deleted cleaning tasks. Managers and above only.

const RANGES = [
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
  { key: "365", label: "1 year", days: 365 },
  { key: "all", label: "All time", days: null },
] as const;

const TYPES = [
  { key: "all", label: "All" },
  { key: "cleaning", label: "Cleaning" },
  { key: "daily", label: "Daily inspection" },
  { key: "condition", label: "Room condition" },
  { key: "changes", label: "Changes" },
] as const;
type TypeKey = (typeof TYPES)[number]["key"];

const PHOTO_URL_TTL = 6 * 60 * 60;
const MAX_THUMBS = 8;
const MAX_TASKS = 200;

type Media = { id: string; url: string; video: boolean };
type Step = { at: string; text: string; who: string | null; tone?: "red" | "green" };

type Event =
  | {
      type: "cleaning"; id: string; at: string; reason: string | null; status: string;
      assignedTo: string | null; steps: Step[]; checklist: { label: string; status: string; note: string | null }[];
      media: Media[]; mediaCount: number;
    }
  | {
      type: "daily"; id: string; at: string; dateLabel: string; workflow: string; slug: string;
      ok: number; issues: string[]; note: string | null; media: Media[]; mediaCount: number;
    }
  | {
      type: "condition"; id: string; at: string; quarter: string; dateLabel: string; done: boolean;
      findings: { label: string; status: string; note: string }[]; notes: string; okCount: number;
    }
  | { type: "changes"; id: string; at: string; text: string; who: string | null; icon: "edit" | "delete" };

function parseDetails(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function signMedia(items: { id: string; storagePath: string; video: boolean }[]): Promise<Media[]> {
  return Promise.all(
    items.slice(0, MAX_THUMBS).map(async (m) => ({
      id: m.id,
      video: m.video,
      url: await getSignedUrl(m.storagePath, PHOTO_URL_TTL).catch(() => ""),
    })),
  );
}

const STATUS_LABEL: Record<string, string> = {
  READY_TO_CLEAN: "Ready to Clean",
  IN_PROGRESS: "In Progress",
  READY_FOR_INSPECTION: "For Inspection",
  READY_TO_RENT: "Cleaned",
};

export default async function RoomHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; type?: string }>;
}) {
  await requireManager();
  const { id } = await params;
  const sp = await searchParams;
  const range = RANGES.find((r) => r.key === sp.range) ?? RANGES[1];
  const type: TypeKey = (TYPES.find((t) => t.key === sp.type)?.key ?? "all") as TypeKey;
  const since = range.days ? new Date(Date.now() - range.days * 24 * 60 * 60 * 1000) : new Date(0);

  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) notFound();

  const want = (t: TypeKey) => type === "all" || type === t;

  const [tasks, cells, rows, pmInspections, roomAudits, deletedTasks] = await Promise.all([
    want("cleaning")
      ? prisma.housekeepingTask.findMany({
          where: { roomId: id, kind: "ROOM_CLEANING", createdAt: { gte: since } },
          orderBy: { createdAt: "desc" },
          take: MAX_TASKS,
          include: {
            createdBy: { select: { name: true } },
            assignedHousekeeper: { select: { name: true } },
            submittedBy: { select: { name: true } },
            reviewedBy: { select: { name: true } },
            items: { orderBy: { order: "asc" }, select: { label: true, status: true, note: true } },
            photos: { orderBy: { createdAt: "asc" }, select: { id: true, storagePath: true, mediaType: true } },
          },
        })
      : [],
    want("daily")
      ? prisma.workflowCell.findMany({
          where: { roomId: id, submission: { date: { gte: since } } },
          select: {
            submissionId: true, itemText: true, status: true, lastUpdatedAt: true,
            submission: { select: { date: true, workflow: { select: { name: true, slug: true } } } },
          },
        })
      : [],
    want("daily")
      ? prisma.workflowRow.findMany({
          where: { roomId: id, submission: { date: { gte: since } } },
          select: {
            submissionId: true, note: true, lastUpdatedAt: true,
            submission: { select: { date: true, workflow: { select: { name: true, slug: true } } } },
            images: { orderBy: { createdAt: "asc" }, select: { id: true, storagePath: true } },
          },
        })
      : [],
    want("condition")
      ? prisma.pmV2Inspection.findMany({
          where: { area: { roomId: id }, updatedAt: { gte: since } },
          orderBy: { updatedAt: "desc" },
          include: { results: { include: { item: { select: { label: true } } } } },
        })
      : [],
    want("changes")
      ? prisma.auditLog.findMany({
          where: { entity: "Room", entityId: id, createdAt: { gte: since } },
          orderBy: { createdAt: "desc" },
          include: { user: { select: { name: true } } },
        })
      : [],
    want("cleaning")
      ? prisma.auditLog.findMany({
          where: { entity: "HousekeepingTask", action: "DELETE", details: { contains: id }, createdAt: { gte: since } },
          orderBy: { createdAt: "desc" },
          include: { user: { select: { name: true } } },
        })
      : [],
  ]);

  // Every round of each cleaning (send-backs included) lives in the audit log —
  // the task row itself only keeps the latest review.
  const taskAudits = tasks.length
    ? await prisma.auditLog.findMany({
        where: { entity: "HousekeepingTask", entityId: { in: tasks.map((t) => t.id) } },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { name: true } } },
      })
    : [];
  const auditsByTask = new Map<string, typeof taskAudits>();
  for (const a of taskAudits) {
    const list = auditsByTask.get(a.entityId!) ?? [];
    list.push(a);
    auditsByTask.set(a.entityId!, list);
  }

  const events: Event[] = [];

  // --- Cleanings ---
  for (const t of tasks) {
    const steps: Step[] = [];
    for (const a of auditsByTask.get(t.id) ?? []) {
      const d = parseDetails(a.details);
      const who = a.user?.name ?? null;
      const at = a.createdAt.toISOString();
      if (a.action === "CREATE") steps.push({ at, who, text: `Sent for cleaning${d.reason ? ` · ${d.reason}` : ""}` });
      else if (d.status === "IN_PROGRESS") steps.push({ at, who, text: "Started cleaning" });
      else if (d.status === "READY_FOR_INSPECTION")
        steps.push({
          at, who,
          text: `Submitted for inspection${d.photos ? ` · ${d.photos} ${d.photos === 1 ? "photo/video" : "photos/videos"}` : ""}`,
        });
      else if (d.outcome === "REJECTED")
        steps.push({ at, who, tone: "red", text: `Sent back${d.note ? `: “${d.note}”` : ""}` });
      else if (d.outcome === "APPROVED") steps.push({ at, who, tone: "green", text: "Approved — Cleaned" });
    }
    // Older tasks may predate the audit entries; fall back to the task's own fields.
    if (steps.length === 0) {
      steps.push({ at: t.createdAt.toISOString(), who: t.createdBy?.name ?? null, text: `Sent for cleaning${t.requestReason ? ` · ${t.requestReason}` : ""}` });
      if (t.startedAt) steps.push({ at: t.startedAt.toISOString(), who: null, text: "Started cleaning" });
      if (t.submittedAt) steps.push({ at: t.submittedAt.toISOString(), who: t.submittedBy?.name ?? null, text: "Submitted for inspection" });
      if (t.reviewedAt)
        steps.push({
          at: t.reviewedAt.toISOString(), who: t.reviewedBy?.name ?? null,
          tone: t.status === "READY_TO_RENT" ? "green" : "red",
          text: t.status === "READY_TO_RENT" ? "Approved — Cleaned" : `Sent back${t.reviewNote ? `: “${t.reviewNote}”` : ""}`,
        });
    }
    events.push({
      type: "cleaning", id: t.id, at: t.createdAt.toISOString(), reason: t.requestReason, status: t.status,
      assignedTo: t.assignedHousekeeper?.name ?? null, steps,
      // Only exceptions worth reading later; unchecked items on an open task are noise.
      checklist: t.items.filter((i) => i.status === "NOT_DONE" || (i.status === "NA" && i.note)),
      media: await signMedia(t.photos.map((p) => ({ id: p.id, storagePath: p.storagePath, video: p.mediaType === "VIDEO" }))),
      mediaCount: t.photos.length,
    });
  }
  for (const a of deletedTasks) {
    const d = parseDetails(a.details);
    if (d.roomId !== id) continue;
    events.push({
      type: "changes", id: a.id, at: a.createdAt.toISOString(), who: a.user?.name ?? null, icon: "delete",
      text: "Cleaning task deleted (with its photos)",
    });
  }

  // --- Daily Cleanliness (one event per day's sheet) ---
  const daily = new Map<string, Extract<Event, { type: "daily" }> & { _paths: { id: string; storagePath: string }[] }>();
  const dayOf = (sub: { date: Date; workflow: { name: string; slug: string } }, key: string, at: Date) => {
    let e = daily.get(key);
    if (!e) {
      e = {
        type: "daily", id: key, at: at.toISOString(), workflow: sub.workflow.name, slug: sub.workflow.slug,
        dateLabel: sub.date.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" }),
        ok: 0, issues: [], note: null, media: [], mediaCount: 0, _paths: [],
      };
      daily.set(key, e);
    }
    if (at.toISOString() > e.at) e.at = at.toISOString();
    return e;
  };
  for (const c of cells) {
    const e = dayOf(c.submission, c.submissionId, c.lastUpdatedAt);
    if (c.status === "OK") e.ok++;
    else if (c.status === "ISSUE") e.issues.push(c.itemText);
  }
  for (const r of rows) {
    if (!r.note && r.images.length === 0) continue;
    const e = dayOf(r.submission, r.submissionId, r.lastUpdatedAt ?? r.submission.date);
    e.note = r.note;
    e._paths.push(...r.images);
  }
  for (const e of daily.values()) {
    const { _paths, ...rest } = e;
    events.push({
      ...rest,
      media: await signMedia(_paths.map((p) => ({ id: p.id, storagePath: p.storagePath, video: false }))),
      mediaCount: _paths.length,
    });
  }

  // --- Room condition (PM V2), one event per quarter's walk-through ---
  for (const ins of pmInspections) {
    const findings = ins.results
      .filter((r) => r.status && r.status !== "OK" && r.status !== "NA")
      .map((r) => ({ label: r.item?.label ?? r.label ?? "Item", status: r.status!, note: r.note }));
    events.push({
      type: "condition", id: ins.id, at: ins.updatedAt.toISOString(), quarter: ins.quarter, dateLabel: ins.date,
      done: ins.done, findings, notes: ins.notes, okCount: ins.results.filter((r) => r.status === "OK").length,
    });
  }

  // --- Room record changes ---
  for (const a of roomAudits) {
    const d = parseDetails(a.details);
    let text = "Room updated";
    if (a.action === "CREATE") text = "Room added";
    else if (a.action === "ARCHIVE") text = "Room archived";
    else if (a.action === "RESTORE") text = "Room restored";
    else if (a.action === "UPDATE" && d.before && d.after) {
      const before = d.before as Record<string, unknown>;
      const after = d.after as Record<string, unknown>;
      const changed = Object.keys(after).filter((k) => (before[k] ?? "") !== (after[k] ?? ""));
      if (changed.length) text = `Room details changed: ${changed.join(", ")}`;
    }
    events.push({ type: "changes", id: a.id, at: a.createdAt.toISOString(), who: a.user?.name ?? null, icon: "edit", text });
  }

  events.sort((a, b) => b.at.localeCompare(a.at));

  const qs = (over: Partial<{ range: string; type: string }>) => {
    const p = new URLSearchParams({ range: range.key, type, ...over });
    return `?${p.toString()}`;
  };

  return (
    <div className="space-y-5">
      <Link href="/settings/rooms" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        Back to rooms
      </Link>

      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-base font-bold text-slate-700">
          {room.number}
        </div>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <History className="h-6 w-6 text-brand-600" />
            Room {room.number} history
          </h1>
          <p className="text-sm text-slate-500">
            {[room.name, room.floor && `Floor ${room.floor}`, room.archived && "Archived"].filter(Boolean).join(" · ") ||
              "Cleanings, daily inspections, room condition and changes."}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <Link
              key={t.key}
              href={qs({ type: t.key })}
              className={clsx(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                type === t.key ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-400">Period:</span>
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={qs({ range: r.key })}
              className={clsx(
                "rounded-md px-2 py-0.5 font-medium",
                range.key === r.key ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {r.label}
            </Link>
          ))}
          <span className="ml-auto text-slate-400">{events.length} entr{events.length === 1 ? "y" : "ies"}</span>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">Nothing recorded for this room in this period.</div>
      ) : (
        <ol className="relative space-y-3 border-l-2 border-slate-200 pl-4 sm:pl-6">
          {events.map((e) => (
            <li key={`${e.type}-${e.id}`} className="relative">
              <span
                className={clsx(
                  "absolute -left-[25px] top-4 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-slate-50 sm:-left-[33px]",
                  e.type === "cleaning" ? "bg-sky-500" : e.type === "daily" ? "bg-emerald-500" : e.type === "condition" ? "bg-violet-500" : "bg-slate-400",
                )}
              />
              <EventCard e={e} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function EventCard({ e }: { e: Event }) {
  if (e.type === "cleaning") {
    return (
      <div className="card space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 text-sky-600" />
          <span className="font-semibold text-slate-900">Cleaning{e.reason ? ` · ${e.reason}` : ""}</span>
          <span
            className={clsx(
              "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
              e.status === "READY_TO_RENT" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700",
            )}
          >
            {STATUS_LABEL[e.status] ?? e.status}
          </span>
          <span className="ml-auto text-xs text-slate-400"><LocalDateTime iso={e.at} /></span>
        </div>
        {e.assignedTo && <p className="text-xs text-slate-500">Assigned to {e.assignedTo}</p>}
        <ul className="space-y-1 text-sm">
          {e.steps.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-24 shrink-0 text-xs leading-5 text-slate-400"><LocalDateTime iso={s.at} /></span>
              <span className={clsx(s.tone === "red" && "text-red-700", s.tone === "green" && "text-emerald-700", !s.tone && "text-slate-700")}>
                {s.text}
                {s.who && <span className="text-slate-400"> · {s.who}</span>}
              </span>
            </li>
          ))}
        </ul>
        {e.checklist.length > 0 && (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span className="font-semibold">Checklist:</span>{" "}
            {e.checklist.map((c) => `${c.label} (${c.status === "NA" ? "N/A" : "not done"}${c.note ? ` — ${c.note}` : ""})`).join(" · ")}
          </div>
        )}
        <MediaStrip media={e.media} count={e.mediaCount} />
      </div>
    );
  }

  if (e.type === "daily") {
    return (
      <div className="card space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-emerald-600" />
          <span className="font-semibold text-slate-900">{e.workflow}</span>
          <span className="text-xs text-slate-500">{e.dateLabel}</span>
        </div>
        <p className="text-sm">
          <span className="text-emerald-700">{e.ok} OK</span>
          {e.issues.length > 0 ? (
            <span className="text-red-700"> · {e.issues.length} issue{e.issues.length === 1 ? "" : "s"}: {e.issues.join(", ")}</span>
          ) : (
            <span className="text-slate-400"> · no issues</span>
          )}
        </p>
        {e.note && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">“{e.note}”</p>}
        <MediaStrip media={e.media} count={e.mediaCount} />
      </div>
    );
  }

  if (e.type === "condition") {
    return (
      <div className="card space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Wrench className="h-4 w-4 text-violet-600" />
          <span className="font-semibold text-slate-900">Room condition · {e.quarter}</span>
          <span className="text-xs text-slate-500">{e.dateLabel}</span>
          <span className={clsx("ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold", e.done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
            {e.done ? "Done" : "In progress"}
          </span>
        </div>
        {e.findings.length === 0 ? (
          <p className="text-sm text-slate-500">
            {e.okCount > 0 ? `${e.okCount} items OK · no findings` : "No items checked yet"}
          </p>
        ) : (
          <ul className="space-y-0.5 text-sm">
            {e.findings.map((f, i) => (
              <li key={i}>
                <span className={clsx("font-semibold", f.status === "FIXED" ? "text-emerald-700" : "text-red-700")}>{f.status.toLowerCase()}</span>{" "}
                <span className="text-slate-700">{f.label}</span>
                {f.note && <span className="text-slate-500"> — {f.note}</span>}
              </li>
            ))}
          </ul>
        )}
        {e.notes && <p className="text-sm text-slate-600">“{e.notes}”</p>}
      </div>
    );
  }

  return (
    <div className="card flex flex-wrap items-center gap-2 p-3 text-sm">
      {e.icon === "delete" ? <Trash2 className="h-4 w-4 text-red-500" /> : <PencilLine className="h-4 w-4 text-slate-500" />}
      <span className="text-slate-700">{e.text}</span>
      {e.who && <span className="text-slate-400">· {e.who}</span>}
      <span className="ml-auto text-xs text-slate-400"><LocalDateTime iso={e.at} /></span>
    </div>
  );
}

function MediaStrip({ media, count }: { media: Media[]; count: number }) {
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {media.map((m) =>
        !m.url ? (
          <span key={m.id} className="flex h-14 w-14 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
            <ImageOff className="h-4 w-4 text-slate-300" />
          </span>
        ) : (
          <a
            key={m.id}
            href={m.url}
            target="_blank"
            rel="noreferrer"
            className="relative h-14 w-14 overflow-hidden rounded-lg border border-slate-200 bg-slate-900"
            title={m.video ? "Open video" : "Open photo"}
          >
            {m.video ? (
              <span className="flex h-full w-full items-center justify-center text-white">
                <Video className="h-5 w-5" />
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt="" className="h-full w-full object-cover" loading="lazy" />
            )}
          </a>
        ),
      )}
      {count > media.length && <span className="text-xs text-slate-500">+{count - media.length} more</span>}
    </div>
  );
}
