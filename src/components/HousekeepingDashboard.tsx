"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  BedDouble, Sparkles, DoorOpen, Plus, Wand2, UserPlus, X, Loader2,
  CheckCircle2, Clock3, ClipboardCheck, ShieldCheck, Users, Check, History, CameraOff,
  ArrowUpNarrowWide, ArrowDownWideNarrow,
} from "lucide-react";
import { HK_STATUS_META, taskLabel, type HkStatus } from "@/lib/housekeeping";
import { submittedWithoutMedia } from "@/lib/hk-view";
import type { HkTaskView, HkRoomOption, HkPerson, HkCaps, HkStatusAction, HkTaskTemplate, HkMediaRules } from "@/lib/hk-view";
import { HkTaskPanel } from "@/components/HkTaskPanel";
import {
  checkOutRooms, createGeneralTask, assignTasks, autoAssign, bulkReview,
} from "@/lib/actions/housekeeping";

type Filter = "all" | HkStatus | "general";

// --- Board order: sort + optional grouping by housekeeper --------------------
type SortKey = "room" | "status" | "activity";
type SortDir = "asc" | "desc";
type BoardView = { sort: SortKey; dir: SortDir; byHousekeeper: boolean };
const DEFAULT_VIEW: BoardView = { sort: "room", dir: "asc", byHousekeeper: false };
const VIEW_KEY = "dmo:hk-board-view";
const SORT_LABEL: Record<SortKey, string> = { room: "Room no.", status: "Status", activity: "Latest activity" };

// Workflow order: waiting → being cleaned → waiting for inspection → finished.
const STATUS_RANK: Record<string, number> = {
  READY_TO_CLEAN: 0, TODO: 0, IN_PROGRESS: 1, READY_FOR_INSPECTION: 2, READY_TO_RENT: 3, DONE: 3,
};

// Rooms in natural number order (101, 102 … 1001), then daily tasks by title.
function byRoom(a: HkTaskView, b: HkTaskView): number {
  if (a.roomNumber && b.roomNumber) return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
  if (a.roomNumber || b.roomNumber) return a.roomNumber ? -1 : 1;
  return (a.title ?? "").localeCompare(b.title ?? "");
}

function lastActivity(t: HkTaskView): number {
  return Math.max(
    ...[t.createdAt, t.assignedAt, t.startedAt, t.submittedAt, t.reviewedAt, t.closedAt]
      .filter((d): d is string => !!d)
      .map((d) => new Date(d).getTime()),
  );
}

function sortTasks(list: HkTaskView[], sort: SortKey, dir: SortDir): HkTaskView[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    // Rooms always come before daily tasks, whichever direction is chosen.
    if (sort === "room" && !a.roomNumber !== !b.roomNumber) return a.roomNumber ? -1 : 1;
    const primary =
      sort === "status" ? (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9)
      : sort === "activity" ? lastActivity(a) - lastActivity(b)
      : byRoom(a, b);
    // Ties (same status / same time) always fall back to room order, ascending.
    return primary !== 0 ? primary * sign : byRoom(a, b);
  });
}

type Group = { key: string; name: string; tasks: HkTaskView[] };

// One section per housekeeper (A–Z), Unassigned last.
function groupByHousekeeper(list: HkTaskView[]): Group[] {
  const groups = new Map<string, Group>();
  for (const t of list) {
    const key = t.assignedTo?.id ?? "";
    if (!groups.has(key)) groups.set(key, { key, name: t.assignedTo?.name ?? "Unassigned", tasks: [] });
    groups.get(key)!.tasks.push(t);
  }
  return [...groups.values()].sort((a, b) =>
    !a.key ? 1 : !b.key ? -1 : a.name.localeCompare(b.name),
  );
}

function readView(): BoardView {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null") as Partial<BoardView> | null;
    if (!v) return DEFAULT_VIEW;
    return {
      sort: v.sort && v.sort in SORT_LABEL ? v.sort : DEFAULT_VIEW.sort,
      dir: v.dir === "desc" ? "desc" : "asc",
      byHousekeeper: !!v.byHousekeeper,
    };
  } catch {
    return DEFAULT_VIEW;
  }
}
// Which tasks the board shows; the summary cards filter by status within it.
type Scope = "all" | "mine";

const POLL_MS = 12_000;

// --- Summary cards shown across the top (PM-style, clickable filters) ---
const SUMMARY: { key: Filter; label: string; icon: React.ReactNode; tone: string }[] = [
  { key: "READY_TO_CLEAN", label: "To Clean", icon: <DoorOpen className="h-5 w-5" />, tone: "amber" },
  { key: "IN_PROGRESS", label: "In Progress", icon: <Clock3 className="h-5 w-5" />, tone: "sky" },
  { key: "READY_FOR_INSPECTION", label: "For Inspection", icon: <ClipboardCheck className="h-5 w-5" />, tone: "violet" },
  { key: "READY_TO_RENT", label: "Cleaned", icon: <ShieldCheck className="h-5 w-5" />, tone: "emerald" },
  { key: "general", label: "Daily Tasks", icon: <Sparkles className="h-5 w-5" />, tone: "slate" },
];

const TONE_CARD: Record<string, { bg: string; text: string; ring: string }> = {
  amber: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-300" },
  sky: { bg: "bg-sky-50", text: "text-sky-700", ring: "ring-sky-300" },
  violet: { bg: "bg-violet-50", text: "text-violet-700", ring: "ring-violet-300" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-300" },
  slate: { bg: "bg-slate-100", text: "text-slate-600", ring: "ring-slate-300" },
};

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function HousekeepingDashboard({
  tasks, rooms, housekeepers, statusActions, taskTemplates, caps, currentUserId, initialOpenId, mediaRules,
}: {
  initialOpenId?: string | null; // ?task=<id> from a notification link
  mediaRules: HkMediaRules; // photo/video required to finish rooms / daily tasks
  tasks: HkTaskView[];
  rooms: HkRoomOption[];
  housekeepers: HkPerson[];
  statusActions: HkStatusAction[];
  taskTemplates: HkTaskTemplate[];
  caps: HkCaps;
  currentUserId: string;
}) {
  const router = useRouter();
  // Housekeepers (can clean, but don't assign or inspect) open on their own
  // tasks; managers and inspectors open on the whole board. Both tabs stay available.
  const isHousekeeper = caps.submit && !caps.manage && !caps.review;
  const [scope, setScope] = useState<Scope>(isHousekeeper ? "mine" : "all");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  // A notification link while already on the board (?task= changes) opens that task too.
  useEffect(() => {
    if (initialOpenId) setOpenId(initialOpenId);
  }, [initialOpenId]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<null | "checkout" | "newtask" | "assign">(null);
  const [busy, setBusy] = useState(false);

  // Auto-refresh (polling) — paused while a drawer/modal is open or an action runs.
  useEffect(() => {
    if (openId || modal || busy) return;
    const t = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [openId, modal, busy, router]);

  const myTasks = useMemo(() => tasks.filter((t) => t.assignedTo?.id === currentUserId), [tasks, currentUserId]);
  const scoped = scope === "mine" ? myTasks : tasks;

  // Summary counts follow the selected tab (a housekeeper sees their own numbers).
  const counts = useMemo(() => {
    const c: Record<string, number> = {
      READY_TO_CLEAN: 0, IN_PROGRESS: 0, READY_FOR_INSPECTION: 0, READY_TO_RENT: 0, general: 0,
    };
    for (const t of scoped) {
      if (t.status in c) c[t.status]++;
      // Count only open daily tasks, matching the four status cards which all
      // count open work (not completed) (F7).
      if (t.kind === "GENERAL" && t.status !== "DONE") c.general++;
    }
    return c;
  }, [scoped]);

  // Sort / group choice is remembered on this device only.
  const [view, setViewState] = useState<BoardView>(DEFAULT_VIEW);
  useEffect(() => setViewState(readView()), []);
  function setView(patch: Partial<BoardView>) {
    setViewState((cur) => {
      const next = { ...cur, ...patch };
      try {
        localStorage.setItem(VIEW_KEY, JSON.stringify(next));
      } catch {
        // storage blocked — the choice just isn't remembered
      }
      return next;
    });
  }

  const visible = useMemo(() => {
    const list =
      filter === "general" ? scoped.filter((t) => t.kind === "GENERAL")
      : filter !== "all" ? scoped.filter((t) => t.status === filter)
      : scoped;
    return sortTasks(list, view.sort, view.dir);
  }, [scoped, filter, view.sort, view.dir]);

  // "My tasks" is a single person already, so grouping only applies to All.
  const grouped = view.byHousekeeper && scope === "all";
  const groups = useMemo(() => (grouped ? groupByHousekeeper(visible) : null), [grouped, visible]);

  const openTask = openId ? tasks.find((t) => t.id === openId) ?? null : null;

  // Tasks eligible for bulk review (awaiting inspection).
  const selectedList = [...selected];

  function toggleSel(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function run(fn: () => Promise<unknown>) {
    setBusy(true);
    fn().finally(() => { setBusy(false); router.refresh(); });
  }

  return (
    <div className="space-y-5">
      {/* ---- Toolbar (managers) ---- */}
      {caps.manage && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setModal("checkout")} className="btn-primary">
            <DoorOpen className="h-4 w-4" /> Rooms
          </button>
          <button onClick={() => setModal("newtask")} className="btn-secondary">
            <Plus className="h-4 w-4" /> New task
          </button>
          <button
            onClick={() => run(() => autoAssign())}
            disabled={busy}
            className="btn-secondary"
            title="Distribute unassigned tasks evenly across housekeepers"
          >
            <Wand2 className="h-4 w-4" /> Auto-assign
          </button>
          {selected.size > 0 && (
            <button onClick={() => setModal("assign")} className="btn-secondary">
              <UserPlus className="h-4 w-4" /> Assign ({selected.size})
            </button>
          )}
        </div>
      )}

      {/* ---- Summary cards ---- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {SUMMARY.map((s) => {
          const tone = TONE_CARD[s.tone];
          const active = filter === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setFilter(active ? "all" : s.key)}
              className={clsx(
                "card flex items-center gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md",
                active && `ring-2 ${tone.ring}`,
              )}
            >
              <span className={clsx("flex h-11 w-11 items-center justify-center rounded-xl", tone.bg, tone.text)}>
                {s.icon}
              </span>
              <div>
                <div className="text-2xl font-bold leading-none text-slate-900">{counts[s.key] ?? 0}</div>
                <div className="text-xs text-slate-500">{s.label}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ---- Filter chips ---- */}
      <div className="flex flex-wrap items-center gap-2">
        {caps.submit && (
          <Chip active={scope === "mine"} onClick={() => { setScope("mine"); setFilter("all"); }}>
            <Users className="mr-1 inline h-3.5 w-3.5" /> My tasks ({myTasks.length})
          </Chip>
        )}
        <Chip active={scope === "all"} onClick={() => { setScope("all"); setFilter("all"); }}>All ({tasks.length})</Chip>

        {/* Sort + group */}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
            Sort
            <select
              value={view.sort}
              onChange={(e) => setView({ sort: e.target.value as SortKey })}
              className="rounded-full border border-slate-200 bg-white py-1 pl-3 pr-7 text-xs font-semibold text-slate-700"
              aria-label="Sort by"
            >
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <option key={k} value={k}>{SORT_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setView({ dir: view.dir === "asc" ? "desc" : "asc" })}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            title={view.dir === "asc" ? "Ascending — tap for descending" : "Descending — tap for ascending"}
          >
            {view.dir === "asc" ? <ArrowUpNarrowWide className="h-3.5 w-3.5" /> : <ArrowDownWideNarrow className="h-3.5 w-3.5" />}
            {view.dir === "asc" ? "Ascending" : "Descending"}
          </button>
          {scope === "all" && (
            <Chip active={view.byHousekeeper} onClick={() => setView({ byHousekeeper: !view.byHousekeeper })}>
              <Users className="mr-1 inline h-3.5 w-3.5" /> By housekeeper
            </Chip>
          )}
        </div>

        {caps.review && counts.READY_FOR_INSPECTION > 0 && selected.size > 0 && (
          <div className="ml-auto flex gap-2">
            <button onClick={() => run(() => bulkReview(selectedList, "APPROVE"))} disabled={busy} className="btn-primary !py-1.5">
              <Check className="h-4 w-4" /> Approve ({selected.size})
            </button>
          </div>
        )}
      </div>

      {/* ---- Tiles ---- */}
      {visible.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-2 p-12 text-center">
          <Sparkles className="h-9 w-9 text-slate-300" />
          <p className="text-slate-600">
            {scope === "mine" && filter === "all" ? "Nothing assigned to you right now." : "Nothing here."}
          </p>
          {scope === "mine" && (
            <button type="button" onClick={() => { setScope("all"); setFilter("all"); }} className="text-sm font-semibold text-brand-600 hover:underline">
              See all tasks
            </button>
          )}
          {caps.manage && scope === "all" && filter === "all" && (
            <p className="text-sm text-slate-400">Check out rooms or create a task to get started.</p>
          )}
        </div>
      ) : groups ? (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key || "unassigned"} className="space-y-2">
              <GroupHeader group={g} />
              <TileGrid
                tasks={g.tasks} caps={caps} selected={selected}
                onSelect={toggleSel} onOpen={setOpenId}
              />
            </section>
          ))}
        </div>
      ) : (
        <TileGrid tasks={visible} caps={caps} selected={selected} onSelect={toggleSel} onOpen={setOpenId} />
      )}

      {/* ---- Drawer: task detail + actions + timeline ---- */}
      {openTask && (
        <Drawer
          onClose={() => setOpenId(null)}
          task={openTask}
          historyHref={caps.history && openTask.roomId ? `/settings/rooms/${openTask.roomId}` : null}
        >
          <HkTaskPanel
            task={openTask}
            caps={{ submit: caps.submit, review: caps.review, manage: caps.manage }}
            currentUserId={currentUserId}
            canModerate={caps.moderate}
            mediaRequired={openTask.kind === "ROOM_CLEANING" ? mediaRules.room : mediaRules.task}
            onDone={() => { setOpenId(null); router.refresh(); }}
            onChanged={() => router.refresh()}
          />
        </Drawer>
      )}

      {/* ---- Modals ---- */}
      {modal === "checkout" && (
        <CheckoutModal
          rooms={rooms}
          housekeepers={housekeepers}
          statusActions={statusActions}
          canConfigure={caps.admin}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); router.refresh(); }}
        />
      )}
      {modal === "newtask" && (
        <NewTaskModal
          housekeepers={housekeepers}
          templates={taskTemplates}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); router.refresh(); }}
        />
      )}
      {modal === "assign" && (
        <AssignModal
          housekeepers={housekeepers}
          taskIds={selectedList}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); setSelected(new Set()); router.refresh(); }}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Tile
// ===========================================================================
function TaskTile({
  task, caps, selected, onSelect, onOpen,
}: {
  task: HkTaskView;
  caps: HkCaps;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const meta = HK_STATUS_META[task.status];
  const isRoom = task.kind === "ROOM_CLEANING";
  const selectable =
    (caps.manage) || (caps.review && task.status === "READY_FOR_INSPECTION");

  return (
    <div className={clsx("card group relative overflow-hidden transition hover:shadow-md", selected && "ring-2 ring-brand-300")}>
      <span className={clsx("absolute inset-x-0 top-0 h-1.5", meta.bar)} />
      {selectable && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          className="absolute right-3 top-3 z-10 h-4 w-4 rounded border-slate-300"
          aria-label={`Select ${taskLabel(task)}`}
        />
      )}
      <button onClick={onOpen} className="flex w-full flex-col gap-3 p-4 pt-5 text-left">
        <div className="flex items-center gap-2.5">
          <span className={clsx(
            "flex h-10 w-10 items-center justify-center rounded-xl",
            isRoom ? "bg-brand-50 text-brand-600" : "bg-slate-100 text-slate-500",
          )}>
            {isRoom ? <BedDouble className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <div className="truncate font-bold text-slate-900">{taskLabel(task)}</div>
            {isRoom && task.roomName && <div className="truncate text-xs text-slate-500">{task.roomName}</div>}
            {!isRoom && <div className="text-xs text-slate-400">Daily task</div>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className={clsx("inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", meta.chip)}>
            <span className={clsx("h-1.5 w-1.5 rounded-full", meta.dot)} /> {meta.label}
          </span>
          {task.requestReason && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {task.requestReason}
            </span>
          )}
          {task.recurring && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              Repeats daily
            </span>
          )}
          {task.takeover && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
              {task.takeover.byName.split(" ")[0]} asked to take it
            </span>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500">
          {task.assignedTo ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">
                {initials(task.assignedTo.name)}
              </span>
              {task.assignedTo.name.split(" ")[0]}
            </span>
          ) : (
            <span className="text-slate-400">Unassigned</span>
          )}
          {submittedWithoutMedia(task) ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800" title="Submitted without photos — check the room in person">
              <CameraOff className="h-3 w-3" /> No photos
            </span>
          ) : (
            task.photos.length > 0 && <span>{task.photos.length} photo{task.photos.length === 1 ? "" : "s"}</span>
          )}
        </div>
      </button>
    </div>
  );
}

// ===========================================================================
// Drawer
// ===========================================================================
function Drawer({
  task, onClose, historyHref, children,
}: {
  task: HkTaskView;
  onClose: () => void;
  historyHref: string | null;
  children: React.ReactNode;
}) {
  const meta = HK_STATUS_META[task.status];
  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <div
        className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={clsx("flex items-center justify-between px-5 py-4", meta.chip)}>
          <div>
            <div className="text-lg font-bold">{taskLabel(task)}</div>
            <div className="text-xs font-semibold opacity-80">{meta.label}</div>
          </div>
          {historyHref && (
            <Link
              href={historyHref}
              className="ml-auto mr-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold hover:bg-black/10"
            >
              <History className="h-4 w-4" /> Room history
            </Link>
          )}
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-black/10" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ===========================================================================
// Small pieces
// ===========================================================================
function TileGrid({
  tasks, caps, selected, onSelect, onOpen,
}: {
  tasks: HkTaskView[];
  caps: HkCaps;
  selected: Set<string>;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {tasks.map((t) => (
        <TaskTile
          key={t.id}
          task={t}
          caps={caps}
          selected={selected.has(t.id)}
          onSelect={() => onSelect(t.id)}
          onOpen={() => onOpen(t.id)}
        />
      ))}
    </div>
  );
}

// Section header for "By housekeeper": name, total, and a count per status.
function GroupHeader({ group }: { group: Group }) {
  const perStatus = new Map<HkStatus, number>();
  for (const t of group.tasks) perStatus.set(t.status, (perStatus.get(t.status) ?? 0) + 1);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
      <span className={clsx(
        "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
        group.key ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500",
      )}>
        {group.key ? initials(group.name) : "?"}
      </span>
      <h3 className="font-bold text-slate-900">{group.name}</h3>
      <span className="text-sm text-slate-500">({group.tasks.length})</span>
      <div className="flex flex-wrap gap-1.5">
        {[...perStatus].map(([status, n]) => (
          <span key={status} className={clsx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", HK_STATUS_META[status].chip)}>
            <span className={clsx("h-1.5 w-1.5 rounded-full", HK_STATUS_META[status].dot)} />
            {n} {HK_STATUS_META[status].short}
          </span>
        ))}
      </div>
    </div>
  );
}

function Chip({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "rounded-full border px-3 py-1 text-xs font-semibold transition",
        active ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
      )}
    >
      {children}
    </button>
  );
}

function ModalShell({
  title, onClose, children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <div className="card relative w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function HousekeeperSelect({
  housekeepers, value, onChange,
}: {
  housekeepers: HkPerson[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Unassigned</option>
      {housekeepers.map((h) => (
        <option key={h.id} value={h.id}>{h.name}</option>
      ))}
    </select>
  );
}

// ===========================================================================
// Modals
// ===========================================================================
function CheckoutModal({
  rooms, housekeepers, statusActions, canConfigure, onClose, onDone,
}: {
  rooms: HkRoomOption[];
  housekeepers: HkPerson[];
  statusActions: HkStatusAction[];
  canConfigure: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [assignee, setAssignee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const free = rooms.filter((r) => !r.busy);
  const selectableIds = free.map((r) => r.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => sel.has(id));

  function toggle(id: string) {
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectAll() {
    setSel(allSelected ? new Set() : new Set(selectableIds));
  }

  // Applying a status action = create Ready-to-Clean tasks for selected rooms,
  // tagged with the action's label as the reason.
  function apply(reason: string) {
    setError(null);
    if (sel.size === 0) { setError("Select at least one room."); return; }
    start(async () => {
      const res = await checkOutRooms([...sel], assignee || null, reason);
      if (!res.ok) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <ModalShell title="Rooms" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">Select rooms to send for cleaning</span>
          {free.length > 0 && (
            <button onClick={selectAll} className="text-xs font-semibold text-brand-600 hover:underline">
              {allSelected ? "Clear" : "Select all"}
            </button>
          )}
        </div>

        {/* Room grid — all rooms; busy ones disabled with a badge */}
        <div className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
          {rooms.map((r) => {
            const on = sel.has(r.id);
            return (
              <button
                key={r.id}
                disabled={r.busy}
                onClick={() => toggle(r.id)}
                className={clsx(
                  "relative rounded-lg border px-2 py-2 text-sm font-semibold transition",
                  r.busy
                    ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
                    : on
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                )}
                title={r.busy ? "Already in cleaning" : r.name ?? undefined}
              >
                {r.number}
                {r.busy && <span className="block text-[11px] font-medium">busy</span>}
              </button>
            );
          })}
        </div>

        <div>
          <label className="label">Assign to (optional)</label>
          <HousekeeperSelect housekeepers={housekeepers} value={assignee} onChange={setAssignee} />
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}

        {/* Bottom bar: one button per status action */}
        <div className="border-t border-slate-100 pt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Update status {sel.size > 0 && `· ${sel.size} room${sel.size === 1 ? "" : "s"}`}
          </div>
          {statusActions.length === 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No status actions are set up yet, so rooms can&apos;t be sent for cleaning.{" "}
              {canConfigure ? "Add one (e.g. “Checkout”) in Housekeeping settings." : "Ask an admin to add one in Housekeeping settings."}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {statusActions.map((a, i) => (
              <button
                key={a.id}
                onClick={() => apply(a.label)}
                disabled={pending || sel.size === 0}
                className={i === 0 ? "btn-primary" : "btn-secondary"}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorOpen className="h-4 w-4" />}
                {a.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Manage this list &amp; add rooms in{" "}
            {canConfigure ? (
              <Link href="/services/housekeeping/settings" className="font-semibold text-brand-600 hover:underline">
                Housekeeping settings
              </Link>
            ) : (
              "Housekeeping settings"
            )}
            .
          </p>
        </div>
      </div>
    </ModalShell>
  );
}

function NewTaskModal({
  housekeepers, templates, onClose, onDone,
}: {
  housekeepers: HkPerson[];
  templates: HkTaskTemplate[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [assignee, setAssignee] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    if (!title.trim()) { setError("Give the task a title."); return; }
    start(async () => {
      const res = await createGeneralTask({
        title, assignedHousekeeperId: assignee || null, templateId, recurring,
      });
      if (!res.ok) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <ModalShell title="New daily task" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Task</label>
          <input
            className="input"
            placeholder="e.g. Restock lobby"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setTemplateId(null); }}
            autoFocus
          />
          {templates.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setTitle(t.label); setTemplateId(t.id); setRecurring(true); }}
                  className={clsx(
                    "rounded-full border px-2.5 py-1 text-xs",
                    templateId === t.id
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="label">Assign to (optional)</label>
          <HousekeeperSelect housekeepers={housekeepers} value={assignee} onChange={setAssignee} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={recurring}
            onChange={(e) => setRecurring(e.target.checked)}
          />
          Repeats every day — resets to To Do &amp; unassigned each night
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} disabled={pending} className="btn-primary">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Create task
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function AssignModal({
  housekeepers, taskIds, onClose, onDone,
}: {
  housekeepers: HkPerson[];
  taskIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [assignee, setAssignee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const res = await assignTasks(taskIds, assignee || null);
      if (!res.ok) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <ModalShell title={`Assign ${taskIds.length} task${taskIds.length === 1 ? "" : "s"}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Housekeeper</label>
          <HousekeeperSelect housekeepers={housekeepers} value={assignee} onChange={setAssignee} />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} disabled={pending} className="btn-primary">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Assign
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
