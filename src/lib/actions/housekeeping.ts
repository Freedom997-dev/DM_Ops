"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, can } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { deleteImages, createUploadUrl, getObjectInfo } from "@/lib/storage";
import { signUploadTicket, verifyUploadTicket } from "@/lib/upload-ticket";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MAX_FILES_PER_SUBMIT, formatMB } from "@/lib/upload-limits";
import {
  hkPhotoPath,
  hkGeneralPhotoPath,
  isOpenStatus,
} from "@/lib/housekeeping";
import { ROLE_KEYS } from "@/lib/roles";
import { notify } from "@/lib/notifications/notify";

type Result = { ok: true } | { ok: false; error: string };

function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic") return "heic";
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/webm") return "webm";
  if (mime === "video/quicktime") return "mov";
  return "bin";
}

function refresh() {
  revalidatePath("/services/housekeeping");
}

/** Photo/video rules from Housekeeping settings (defaults when never saved: rooms required, tasks optional). */
async function mediaRules(): Promise<{ room: boolean; task: boolean }> {
  const s = await prisma.housekeepingSetting.findUnique({
    where: { id: "singleton" },
    select: { requireRoomMedia: true, requireTaskMedia: true },
  });
  return { room: s?.requireRoomMedia ?? true, task: s?.requireTaskMedia ?? false };
}

// --- Notifications -----------------------------------------------------------

const hkHref = (taskId?: string) => (taskId ? `/services/housekeeping?task=${taskId}` : "/services/housekeeping");

type TaskLabel = { id: string; kind: string; title: string | null; room: { number: string } | null };
const taskName = (t: TaskLabel) => (t.kind === "ROOM_CLEANING" ? `Room ${t.room?.number ?? "?"}` : t.title ?? "Task");

/** One "assigned to you" per housekeeper, however many tasks they got. */
async function notifyAssigned(byAssignee: Map<string, TaskLabel[]>, actorId: string) {
  for (const [userId, tasks] of byAssignee) {
    const title =
      tasks.length === 1 ? `${taskName(tasks[0])} assigned to you` : `${tasks.length} tasks assigned to you`;
    await notify({
      type: "hk.task.assigned",
      actorId,
      userIds: [userId],
      title,
      body: tasks.length === 1 ? null : tasks.map(taskName).join(", "),
      href: hkHref(tasks.length === 1 ? tasks[0].id : undefined),
      entityType: "HousekeepingTask",
      entityId: tasks[0].id,
    });
  }
}

async function labelsFor(taskIds: string[]): Promise<TaskLabel[]> {
  return prisma.housekeepingTask.findMany({
    where: { id: { in: taskIds } },
    select: { id: true, kind: true, title: true, room: { select: { number: true } } },
  });
}

// ===========================================================================
// Creation — check out rooms (room-clean tasks) + general daily tasks
// ===========================================================================

// --- Apply a status action to rooms → create READY_TO_CLEAN room tasks (bulk).
//     `reason` is the status-action label (e.g. "Checkout") recorded on each task. ---
export async function checkOutRooms(
  roomIds: string[],
  assignedHousekeeperId?: string | null,
  reason?: string | null,
): Promise<{ ok: true; created: number; skipped: number } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!can(user, "housekeeping:tasks:manage")) return { ok: false, error: "Not allowed." };
  if (!Array.isArray(roomIds) || roomIds.length === 0) {
    return { ok: false, error: "No rooms selected." };
  }

  const rooms = await prisma.room.findMany({
    where: { id: { in: roomIds }, archived: false },
    select: { id: true, number: true },
  });

  // Rooms with an open room-clean task are skipped.
  const openTasks = await prisma.housekeepingTask.findMany({
    where: {
      kind: "ROOM_CLEANING",
      roomId: { in: rooms.map((r) => r.id) },
      status: { notIn: ["READY_TO_RENT"] },
    },
    select: { roomId: true },
  });
  const busy = new Set(openTasks.map((t) => t.roomId));
  const toCreate = rooms.filter((r) => !busy.has(r.id));

  const assignee = assignedHousekeeperId || null;
  const requestReason = reason?.trim().slice(0, 100) || null;

  // Snapshot the room-cleaning checklist (templateId null) onto each new task.
  const checklist = await prisma.housekeepingChecklistItem.findMany({
    where: { templateId: null, archived: false },
    orderBy: { order: "asc" },
    select: { label: true, order: true },
  });

  const created: TaskLabel[] = [];
  for (const room of toCreate) {
    const task = await prisma.housekeepingTask.create({
      data: {
        kind: "ROOM_CLEANING",
        roomId: room.id,
        status: "READY_TO_CLEAN",
        requestReason,
        createdById: user.id,
        assignedHousekeeperId: assignee,
        assignedById: assignee ? user.id : null,
        assignedAt: assignee ? new Date() : null,
        items: { create: checklist.map((c) => ({ label: c.label, order: c.order })) },
      },
    });
    await logAudit({
      userId: user.id,
      action: "CREATE",
      entity: "HousekeepingTask",
      entityId: task.id,
      details: { kind: "ROOM_CLEANING", roomNumber: room.number, status: "READY_TO_CLEAN", reason: requestReason },
    });
    created.push({ id: task.id, kind: "ROOM_CLEANING", title: null, room: { number: room.number } });
  }

  if (created.length > 0) {
    if (assignee) {
      await notifyAssigned(new Map([[assignee, created]]), user.id);
    } else {
      await notify({
        type: "hk.rooms.unassigned",
        actorId: user.id,
        title: created.length === 1 ? `${taskName(created[0])} needs a housekeeper` : `${created.length} rooms need a housekeeper`,
        body: `${created.map(taskName).join(", ")}${requestReason ? ` · ${requestReason}` : ""}`,
        href: hkHref(created.length === 1 ? created[0].id : undefined),
        entityType: "HousekeepingTask",
        entityId: created[0].id,
      });
    }
  }

  refresh();
  return { ok: true, created: toCreate.length, skipped: rooms.length - toCreate.length };
}

// --- Create a general daily task (lobby, laundry, …) ---
export async function createGeneralTask(input: {
  title: string;
  assignedHousekeeperId?: string | null;
  templateId?: string | null;
  recurring?: boolean;
}): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:tasks:manage")) return { ok: false, error: "Not allowed." };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the task a title." };

  const assignee = input.assignedHousekeeperId || null;
  const recurring = input.recurring ?? false;

  // Snapshot the chosen template's checklist (if any) onto the task.
  const checklist = input.templateId
    ? await prisma.housekeepingChecklistItem.findMany({
        where: { templateId: input.templateId, archived: false },
        orderBy: { order: "asc" },
        select: { label: true, order: true },
      })
    : [];

  const task = await prisma.housekeepingTask.create({
    data: {
      kind: "GENERAL",
      title: title.slice(0, 200),
      recurring,
      status: "TODO",
      createdById: user.id,
      assignedHousekeeperId: assignee,
      assignedById: assignee ? user.id : null,
      assignedAt: assignee ? new Date() : null,
      items: { create: checklist.map((c) => ({ label: c.label, order: c.order })) },
    },
  });
  await logAudit({
    userId: user.id,
    action: "CREATE",
    entity: "HousekeepingTask",
    entityId: task.id,
    details: { kind: "GENERAL", title, status: "TODO", recurring },
  });
  if (assignee) {
    await notifyAssigned(new Map([[assignee, [{ id: task.id, kind: "GENERAL", title: task.title, room: null }]]]), user.id);
  }

  refresh();
  return { ok: true };
}

// --- Delete a task entirely (manager+ only) — cascades photos/checklist items. ---
export async function deleteHousekeepingTask(taskId: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:tasks:manage")) return { ok: false, error: "Not allowed." };

  const task = await prisma.housekeepingTask.findUnique({
    where: { id: taskId },
    select: {
      id: true, kind: true, title: true, roomId: true,
      room: { select: { number: true } },
      photos: { select: { storagePath: true } },
    },
  });
  if (!task) return { ok: false, error: "Task not found." };

  if (task.photos.length > 0) {
    await deleteImages(task.photos.map((p) => p.storagePath));
  }
  await prisma.housekeepingTask.delete({ where: { id: taskId } });
  await logAudit({
    userId: user.id,
    action: "DELETE",
    entity: "HousekeepingTask",
    entityId: taskId,
    details: { kind: task.kind, title: task.title, roomId: task.roomId, roomNumber: task.room?.number ?? null },
  });

  refresh();
  return { ok: true };
}

// ===========================================================================
// Assignment — manual + balanced auto-assign
// ===========================================================================

// --- Assign one or more tasks to a specific housekeeper (or unassign) ---
export async function assignTasks(
  taskIds: string[],
  housekeeperId: string | null,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!can(user, "housekeeping:tasks:manage")) return { ok: false, error: "Not allowed." };
  if (!Array.isArray(taskIds) || taskIds.length === 0) return { ok: false, error: "No tasks selected." };

  if (housekeeperId) {
    // Only users on the housekeeper roster may be assigned cleaning — this
    // matches the assign dropdown and auto-assign, which both list HOUSEKEEPER
    // users only. Previously any active user was accepted, contradicting the
    // UI it feeds (F3).
    const hk = await prisma.user.findFirst({
      where: {
        id: housekeeperId,
        active: true,
        roles: { some: { role: { key: ROLE_KEYS.HOUSEKEEPER } } },
      },
      select: { id: true },
    });
    if (!hk) return { ok: false, error: "That person isn't on the housekeeper roster." };
  }

  await prisma.housekeepingTask.updateMany({
    where: { id: { in: taskIds } },
    data: {
      assignedHousekeeperId: housekeeperId,
      assignedById: housekeeperId ? user.id : null,
      assignedAt: housekeeperId ? new Date() : null,
    },
  });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "HousekeepingTask",
    entityId: taskIds[0],
    details: { assignedTo: housekeeperId, count: taskIds.length },
  });
  if (housekeeperId) {
    await notifyAssigned(new Map([[housekeeperId, await labelsFor(taskIds)]]), user.id);
  }

  refresh();
  return { ok: true, count: taskIds.length };
}

// --- Auto-assign: spread the given (or all open, unassigned) tasks evenly
//     across active housekeepers, giving each next task to whoever currently
//     has the fewest open assigned tasks (balanced round-robin). ---
export async function autoAssign(
  taskIds?: string[],
): Promise<{ ok: true; assigned: number } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!can(user, "housekeeping:tasks:manage")) return { ok: false, error: "Not allowed." };

  const housekeepers = await prisma.user.findMany({
    // RBAC-based: User.role is the deprecated legacy column and isn't set
    // for users assigned roles via Settings -> Roles & permissions.
    where: { active: true, roles: { some: { role: { key: ROLE_KEYS.HOUSEKEEPER } } } },
    select: { id: true },
  });
  if (housekeepers.length === 0) {
    return { ok: false, error: "No active housekeepers to assign to." };
  }

  // Target tasks: explicit list, else every open unassigned task.
  const targets = await prisma.housekeepingTask.findMany({
    where: {
      assignedHousekeeperId: null,
      status: { notIn: ["READY_TO_RENT", "DONE"] },
      ...(taskIds && taskIds.length > 0 ? { id: { in: taskIds } } : {}),
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (targets.length === 0) return { ok: true, assigned: 0 };

  // Current open-task load per housekeeper.
  const load = new Map<string, number>();
  for (const hk of housekeepers) load.set(hk.id, 0);
  const existing = await prisma.housekeepingTask.groupBy({
    by: ["assignedHousekeeperId"],
    where: {
      assignedHousekeeperId: { in: housekeepers.map((h) => h.id) },
      status: { notIn: ["READY_TO_RENT", "DONE"] },
    },
    _count: { _all: true },
  });
  for (const row of existing) {
    if (row.assignedHousekeeperId) load.set(row.assignedHousekeeperId, row._count._all);
  }

  // Greedy: each task → the currently-least-loaded housekeeper.
  const assignedTo = new Map<string, string[]>();
  for (const task of targets) {
    let bestId = housekeepers[0].id;
    let best = load.get(bestId) ?? 0;
    for (const hk of housekeepers) {
      const l = load.get(hk.id) ?? 0;
      if (l < best) { best = l; bestId = hk.id; }
    }
    await prisma.housekeepingTask.update({
      where: { id: task.id },
      data: { assignedHousekeeperId: bestId, assignedById: user.id, assignedAt: new Date() },
    });
    load.set(bestId, best + 1);
    assignedTo.set(bestId, [...(assignedTo.get(bestId) ?? []), task.id]);
  }

  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "HousekeepingTask",
    entityId: targets[0].id,
    details: { autoAssigned: targets.length, housekeepers: housekeepers.length },
  });
  const labels = new Map((await labelsFor(targets.map((t) => t.id))).map((l) => [l.id, l]));
  await notifyAssigned(
    new Map([...assignedTo].map(([hk, ids]) => [hk, ids.map((id) => labels.get(id)).filter((l): l is TaskLabel => !!l)])),
    user.id,
  );

  refresh();
  return { ok: true, assigned: targets.length };
}

// ===========================================================================
// Progress — start (both kinds), submit room for inspection, complete general
// ===========================================================================

// --- Start work: READY_TO_CLEAN|TODO -> IN_PROGRESS (self-assigns if free) ---
export async function startTask(taskId: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:tasks:submit")) return { ok: false, error: "Not allowed." };

  const task = await prisma.housekeepingTask.findUnique({
    where: { id: taskId },
    include: { room: { select: { number: true } } },
  });
  if (!task) return { ok: false, error: "Task not found." };
  if (task.status !== "READY_TO_CLEAN" && task.status !== "TODO") {
    return { ok: false, error: "This task can't be started." };
  }

  // Optimistic lock: only transition if the status is still what we read.
  const started = await prisma.housekeepingTask.updateMany({
    where: { id: taskId, status: { in: ["READY_TO_CLEAN", "TODO"] } },
    data: {
      status: "IN_PROGRESS",
      startedAt: new Date(),
      reviewNote: null,
      // Self-assign if it wasn't assigned to anyone.
      assignedHousekeeperId: task.assignedHousekeeperId ?? user.id,
    },
  });
  if (started.count === 0) {
    return { ok: false, error: "This task just changed — refresh and try again." };
  }
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "HousekeepingTask",
    entityId: taskId,
    details: { kind: task.kind, roomNumber: task.room?.number, status: "IN_PROGRESS" },
  });

  refresh();
  return { ok: true };
}

// --- Direct uploads: issue signed upload URLs for a task's photos/videos ---
// Media goes browser -> storage (Vercel caps function bodies at ~4.5 MB). The
// browser asks for one URL per file, uploads, then sends only the returned
// {storagePath, ticket} pairs with submitForInspection / completeGeneralTask.
export type MediaUploadTarget = { storagePath: string; uploadUrl: string; ticket: string };

export async function requestHkMediaUploads(
  taskId: string,
  files: { name: string; type: string; size: number }[],
): Promise<{ ok: true; uploads: MediaUploadTarget[] } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!can(user, "housekeeping:tasks:submit")) return { ok: false, error: "Not allowed." };
  if (!Array.isArray(files) || files.length === 0) return { ok: false, error: "No files to upload." };
  if (files.length > MAX_FILES_PER_SUBMIT) {
    return { ok: false, error: `Too many files — up to ${MAX_FILES_PER_SUBMIT} per submit.` };
  }

  const task = await prisma.housekeepingTask.findUnique({
    where: { id: taskId },
    select: { kind: true, status: true, room: { select: { number: true } } },
  });
  if (!task) return { ok: false, error: "Task not found." };
  const open = task.kind === "ROOM_CLEANING"
    ? task.status === "READY_TO_CLEAN" || task.status === "IN_PROGRESS"
    : task.status === "TODO" || task.status === "IN_PROGRESS";
  if (!open) return { ok: false, error: "This task can't take new photos right now." };

  for (const f of files) {
    const err = mediaLimitError(f.name, f.type, f.size);
    if (err) return { ok: false, error: err };
  }

  try {
    const uploads = await Promise.all(
      files.map(async (f) => {
        const ext = extFromMime(f.type);
        const storagePath = task.kind === "ROOM_CLEANING"
          ? hkPhotoPath(task.room?.number ?? "unknown", ext)
          : hkGeneralPhotoPath(ext);
        const uploadUrl = await createUploadUrl(storagePath, signUploadTicket("local-upload", storagePath));
        return { storagePath, uploadUrl, ticket: signUploadTicket(`hk-task:${taskId}`, storagePath) };
      }),
    );
    return { ok: true, uploads };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not prepare the upload." };
  }
}

// --- Housekeeper submits a cleaned ROOM for inspection (photos required) ---
export async function submitForInspection(form: FormData): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:tasks:submit")) return { ok: false, error: "Not allowed." };

  const taskId = form.get("taskId");
  if (typeof taskId !== "string") return { ok: false, error: "Missing task." };

  const task = await prisma.housekeepingTask.findUnique({
    where: { id: taskId },
    include: {
      room: { select: { number: true } },
      items: { select: { status: true } },
    },
  });
  if (!task) return { ok: false, error: "Task not found." };
  if (task.kind !== "ROOM_CLEANING") return { ok: false, error: "Not a room-cleaning task." };
  if (task.status !== "READY_TO_CLEAN" && task.status !== "IN_PROGRESS") {
    return { ok: false, error: "This room is not being cleaned." };
  }

  // Quality gate: every checklist item must be resolved (Done or N/A) before a
  // room can be sent for inspection — an unresolved list makes the checklist
  // advisory rather than a real gate.
  const unresolved = task.items.filter((it) => it.status !== "DONE" && it.status !== "NA").length;
  if (unresolved > 0) {
    return {
      ok: false,
      error: `Finish the checklist first — ${unresolved} item${unresolved === 1 ? "" : "s"} still need Done or N/A.`,
    };
  }

  const media = await collectUploadedMedia(form, taskId);
  if (!media.ok) return { ok: false, error: media.error };
  if (media.files.length === 0 && (await mediaRules()).room) {
    return { ok: false, error: "Add at least one photo or video before submitting." };
  }
  const uploaded = { paths: media.files.map((m) => m.storagePath) };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.housekeepingPhoto.createMany({
        data: media.files.map((m) => ({ taskId, ...m, uploadedById: user.id })),
      });
      // Optimistic lock on the status; stamp startedAt if the room was submitted
      // without ever entering In Progress so the timeline stays complete (F2).
      const moved = await tx.housekeepingTask.updateMany({
        where: { id: taskId, status: { in: ["READY_TO_CLEAN", "IN_PROGRESS"] } },
        data: {
          status: "READY_FOR_INSPECTION",
          submittedById: user.id,
          submittedAt: new Date(),
          startedAt: task.startedAt ?? new Date(),
          assignedHousekeeperId: task.assignedHousekeeperId ?? user.id,
        },
      });
      if (moved.count === 0) {
        throw new Error("This room just changed — refresh and try again.");
      }
    });
  } catch (e) {
    await deleteImages(uploaded.paths);
    return { ok: false, error: e instanceof Error ? e.message : "Could not submit." };
  }

  await logAudit({
    userId: user.id, action: "UPDATE", entity: "HousekeepingTask", entityId: taskId,
    details: { roomNumber: task.room?.number, status: "READY_FOR_INSPECTION", photos: uploaded.paths.length },
  });
  await notify({
    type: "hk.task.submitted",
    actorId: user.id,
    title: `Room ${task.room?.number ?? "?"} ready for inspection`,
    body: `Cleaned by ${user.name}`,
    href: hkHref(taskId),
    entityType: "HousekeepingTask",
    entityId: taskId,
  });
  refresh();
  return { ok: true };
}

// --- Complete a GENERAL task -> DONE (photos optional) ---
export async function completeGeneralTask(form: FormData): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:tasks:submit")) return { ok: false, error: "Not allowed." };

  const taskId = form.get("taskId");
  if (typeof taskId !== "string") return { ok: false, error: "Missing task." };

  const task = await prisma.housekeepingTask.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, error: "Task not found." };
  if (task.kind !== "GENERAL") return { ok: false, error: "Not a general task." };
  if (task.status !== "TODO" && task.status !== "IN_PROGRESS") {
    return { ok: false, error: "This task is already done." };
  }

  const media = await collectUploadedMedia(form, taskId);
  if (!media.ok) return { ok: false, error: media.error };
  if (media.files.length === 0 && (await mediaRules()).task) {
    return { ok: false, error: "Add at least one photo or video before completing this task." };
  }
  const uploaded = { paths: media.files.map((m) => m.storagePath) };

  try {
    await prisma.$transaction(async (tx) => {
      if (media.files.length > 0) {
        await tx.housekeepingPhoto.createMany({
          data: media.files.map((m) => ({ taskId, ...m, uploadedById: user.id })),
        });
      }
      const moved = await tx.housekeepingTask.updateMany({
        where: { id: taskId, status: { in: ["TODO", "IN_PROGRESS"] } },
        data: {
          status: "DONE",
          submittedById: user.id,
          submittedAt: new Date(),
          closedAt: new Date(),
          assignedHousekeeperId: task.assignedHousekeeperId ?? user.id,
        },
      });
      if (moved.count === 0) {
        throw new Error("This task just changed — refresh and try again.");
      }
    });
  } catch (e) {
    await deleteImages(uploaded.paths);
    return { ok: false, error: e instanceof Error ? e.message : "Could not complete." };
  }

  await logAudit({
    userId: user.id, action: "UPDATE", entity: "HousekeepingTask", entityId: taskId,
    details: { kind: "GENERAL", title: task.title, status: "DONE", photos: uploaded.paths.length },
  });
  refresh();
  return { ok: true };
}

// ===========================================================================
// Inspection (room tasks only)
// ===========================================================================

export async function reviewTask(
  taskId: string,
  outcome: "APPROVE" | "REJECT",
  note?: string,
): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:cleaning:review")) return { ok: false, error: "Not allowed." };

  const task = await prisma.housekeepingTask.findUnique({
    where: { id: taskId },
    include: { room: { select: { number: true } } },
  });
  if (!task) return { ok: false, error: "Task not found." };
  if (task.status !== "READY_FOR_INSPECTION") {
    return { ok: false, error: "This room is not awaiting inspection." };
  }

  if (outcome === "REJECT") {
    const trimmed = (note ?? "").trim();
    if (!trimmed) return { ok: false, error: "A note is required when rejecting." };
    // Optimistic lock: only reject if still awaiting inspection.
    const rejected = await prisma.housekeepingTask.updateMany({
      where: { id: taskId, status: "READY_FOR_INSPECTION" },
      data: {
        status: "READY_TO_CLEAN",
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote: trimmed.slice(0, 1000),
        startedAt: null,
        submittedById: null,
        submittedAt: null,
      },
    });
    if (rejected.count === 0) {
      return { ok: false, error: "This room just changed — refresh and try again." };
    }
    // Media is kept (room history): the panel shows the rejected submission's
    // photos as "Earlier submission" once the room is re-cleaned.
    await logAudit({
      userId: user.id, action: "UPDATE", entity: "HousekeepingTask", entityId: taskId,
      details: { roomNumber: task.room?.number, outcome: "REJECTED", note: trimmed.slice(0, 200) },
    });
    await notify({
      type: "hk.task.rejected",
      actorId: user.id,
      userIds: [task.assignedHousekeeperId ?? task.submittedById],
      title: `Room ${task.room?.number ?? "?"} sent back`,
      body: trimmed.slice(0, 300),
      href: hkHref(taskId),
      entityType: "HousekeepingTask",
      entityId: taskId,
    });
    refresh();
    return { ok: true };
  }

  // APPROVE — media is kept until a manager deletes it (room history).
  // Optimistic lock: only approve if still awaiting inspection.
  const approved = await prisma.housekeepingTask.updateMany({
    where: { id: taskId, status: "READY_FOR_INSPECTION" },
    data: {
      status: "READY_TO_RENT",
      reviewedById: user.id,
      reviewedAt: new Date(),
      reviewNote: (note ?? "").trim().slice(0, 1000) || null,
      closedAt: new Date(),
    },
  });
  if (approved.count === 0) {
    return { ok: false, error: "This room just changed — refresh and try again." };
  }

  await logAudit({
    userId: user.id, action: "UPDATE", entity: "HousekeepingTask", entityId: taskId,
    details: { roomNumber: task.room?.number, outcome: "APPROVED" },
  });
  await notify({
    type: "hk.task.approved",
    actorId: user.id,
    userIds: [task.assignedHousekeeperId ?? task.submittedById],
    title: `Room ${task.room?.number ?? "?"} approved`,
    body: `Inspected by ${user.name}`,
    href: hkHref(taskId),
    entityType: "HousekeepingTask",
    entityId: taskId,
  });
  refresh();
  return { ok: true };
}

export async function bulkReview(
  taskIds: string[],
  outcome: "APPROVE" | "REJECT",
  note?: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  // Explicit top-level guard so an unauthorized caller gets a clear "Not
  // allowed" instead of a misleading { ok: true, count: 0 } (F10). Each
  // per-item reviewTask still re-checks independently.
  const user = await requireUser();
  if (!can(user, "housekeeping:cleaning:review")) return { ok: false, error: "Not allowed." };
  if (!Array.isArray(taskIds) || taskIds.length === 0) return { ok: false, error: "No rooms selected." };
  if (outcome === "REJECT" && !(note ?? "").trim()) {
    return { ok: false, error: "A note is required when rejecting." };
  }
  let count = 0;
  for (const id of taskIds) {
    const res = await reviewTask(id, outcome, note);
    if (res.ok) count++;
  }
  return { ok: true, count };
}

// ===========================================================================
// Admin — delete photo, settings
// ===========================================================================

export async function deleteHousekeepingPhoto(photoId: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:settings:configure")) return { ok: false, error: "Not allowed." };

  const photo = await prisma.housekeepingPhoto.findUnique({ where: { id: photoId } });
  if (!photo) return { ok: false, error: "Photo not found." };

  await deleteImages([photo.storagePath]);
  await prisma.housekeepingPhoto.delete({ where: { id: photoId } });
  await logAudit({
    userId: user.id, action: "DELETE", entity: "HousekeepingPhoto", entityId: photoId,
    details: { storagePath: photo.storagePath },
  });
  refresh();
  return { ok: true };
}

export async function updateHousekeepingSettings(input: {
  instructions: string;
  requireRoomMedia: boolean;
  requireTaskMedia: boolean;
}): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:settings:configure")) return { ok: false, error: "Not allowed." };

  const instructions = input.instructions.trim().slice(0, 2000) || null;
  const data = {
    instructions,
    requireRoomMedia: !!input.requireRoomMedia,
    requireTaskMedia: !!input.requireTaskMedia,
  };
  await prisma.housekeepingSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
  await logAudit({
    userId: user.id, action: "UPDATE", entity: "HousekeepingSetting", entityId: "singleton",
    details: { instructions: !!instructions, requireRoomMedia: data.requireRoomMedia, requireTaskMedia: data.requireTaskMedia },
  });
  revalidatePath("/services/housekeeping");
  revalidatePath("/services/housekeeping/settings");
  return { ok: true };
}

// ===========================================================================
// Configuration (admin, in Housekeeping settings)
// ===========================================================================

// --- Status actions (the check-out panel's bottom-bar options) ---
export async function createStatusAction(label: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:settings:configure")) return { ok: false, error: "Not allowed." };
  const clean = label.trim();
  if (!clean) return { ok: false, error: "Enter a label." };

  const max = await prisma.housekeepingStatusAction.aggregate({ _max: { order: true } });
  await prisma.housekeepingStatusAction.create({
    data: { label: clean.slice(0, 60), order: (max._max.order ?? -1) + 1 },
  });
  revalidatePath("/services/housekeeping/settings");
  refresh();
  return { ok: true };
}

export async function renameStatusAction(id: string, label: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:settings:configure")) return { ok: false, error: "Not allowed." };
  const clean = label.trim();
  if (!clean) return { ok: false, error: "Enter a label." };
  await prisma.housekeepingStatusAction.update({ where: { id }, data: { label: clean.slice(0, 60) } });
  revalidatePath("/services/housekeeping/settings");
  refresh();
  return { ok: true };
}

export async function archiveStatusAction(id: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:settings:configure")) return { ok: false, error: "Not allowed." };
  const remaining = await prisma.housekeepingStatusAction.count({ where: { archived: false } });
  if (remaining <= 1) return { ok: false, error: "Keep at least one status action." };
  await prisma.housekeepingStatusAction.update({ where: { id }, data: { archived: true } });
  revalidatePath("/services/housekeeping/settings");
  refresh();
  return { ok: true };
}

// --- Task templates (the "New task" panel's quick-picks) ---
export async function createTaskTemplate(label: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:settings:configure")) return { ok: false, error: "Not allowed." };
  const clean = label.trim();
  if (!clean) return { ok: false, error: "Enter a label." };
  const max = await prisma.housekeepingTaskTemplate.aggregate({ _max: { order: true } });
  await prisma.housekeepingTaskTemplate.create({
    data: { label: clean.slice(0, 80), order: (max._max.order ?? -1) + 1 },
  });
  revalidatePath("/services/housekeeping/settings");
  refresh();
  return { ok: true };
}

export async function renameTaskTemplate(id: string, label: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:settings:configure")) return { ok: false, error: "Not allowed." };
  const clean = label.trim();
  if (!clean) return { ok: false, error: "Enter a label." };
  await prisma.housekeepingTaskTemplate.update({ where: { id }, data: { label: clean.slice(0, 80) } });
  revalidatePath("/services/housekeeping/settings");
  refresh();
  return { ok: true };
}

export async function archiveTaskTemplate(id: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:settings:configure")) return { ok: false, error: "Not allowed." };
  await prisma.housekeepingTaskTemplate.update({ where: { id }, data: { archived: true } });
  revalidatePath("/services/housekeeping/settings");
  refresh();
  return { ok: true };
}

// --- Cleaning checklist items (templateId null = room cleaning) ---
export async function createChecklistItem(templateId: string | null, label: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:settings:configure")) return { ok: false, error: "Not allowed." };
  const clean = label.trim();
  if (!clean) return { ok: false, error: "Enter a label." };
  const max = await prisma.housekeepingChecklistItem.aggregate({
    where: { templateId }, _max: { order: true },
  });
  await prisma.housekeepingChecklistItem.create({
    data: { templateId, label: clean.slice(0, 120), order: (max._max.order ?? -1) + 1 },
  });
  revalidatePath("/services/housekeeping/settings");
  return { ok: true };
}

export async function renameChecklistItem(id: string, label: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:settings:configure")) return { ok: false, error: "Not allowed." };
  const clean = label.trim();
  if (!clean) return { ok: false, error: "Enter a label." };
  await prisma.housekeepingChecklistItem.update({ where: { id }, data: { label: clean.slice(0, 120) } });
  revalidatePath("/services/housekeeping/settings");
  return { ok: true };
}

export async function archiveChecklistItem(id: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:settings:configure")) return { ok: false, error: "Not allowed." };
  await prisma.housekeepingChecklistItem.update({ where: { id }, data: { archived: true } });
  revalidatePath("/services/housekeeping/settings");
  return { ok: true };
}

// --- Housekeeper saves subtask (checklist) responses on a task ---
export async function saveTaskItems(
  taskId: string,
  items: { id: string; status: string; note: string | null }[],
): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:tasks:submit")) return { ok: false, error: "Not allowed." };

  // Checklist is only editable while the task is actively being worked — not on
  // a closed (Ready-to-Rent / Done) or under-inspection task (F4).
  const parent = await prisma.housekeepingTask.findUnique({
    where: { id: taskId }, select: { status: true },
  });
  if (!parent) return { ok: false, error: "Task not found." };
  if (!["READY_TO_CLEAN", "IN_PROGRESS", "TODO"].includes(parent.status)) {
    return { ok: false, error: "This checklist can no longer be edited." };
  }

  const valid = new Set(["PENDING", "DONE", "NOT_DONE", "NA"]);
  // Ensure the items belong to this task.
  const owned = await prisma.housekeepingTaskItem.findMany({
    where: { taskId }, select: { id: true },
  });
  const ownedIds = new Set(owned.map((o) => o.id));

  await prisma.$transaction(
    items
      .filter((it) => ownedIds.has(it.id) && valid.has(it.status))
      .map((it) =>
        prisma.housekeepingTaskItem.update({
          where: { id: it.id },
          data: { status: it.status, note: it.note?.trim().slice(0, 500) || null },
        }),
      ),
  );
  refresh();
  return { ok: true };
}

// --- Add a room (rooms are shared with PM) ---
export async function hkCreateRoom(input: { number: string; name?: string }): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:settings:configure")) return { ok: false, error: "Not allowed." };
  const number = input.number.trim();
  if (!number) return { ok: false, error: "Enter a room number." };

  const existing = await prisma.room.findUnique({ where: { number } });
  if (existing) return { ok: false, error: `Room ${number} already exists.` };

  const room = await prisma.room.create({
    data: { number: number.slice(0, 30), name: input.name?.trim().slice(0, 60) || null },
  });
  await logAudit({
    userId: user.id, action: "CREATE", entity: "Room", entityId: room.id,
    details: { number: room.number, name: room.name, via: "housekeeping" },
  });
  revalidatePath("/services/housekeeping");
  revalidatePath("/services/housekeeping/settings");
  return { ok: true };
}

// ===========================================================================
// Internal helpers
// ===========================================================================

function mediaLimitError(name: string, type: string, size: number): string | null {
  const isImage = type.startsWith("image/");
  const isVideo = type.startsWith("video/");
  if (!isImage && !isVideo) return `Unsupported file: ${name}`;
  if (isImage && size > MAX_IMAGE_BYTES) return `${name} is over ${formatMB(MAX_IMAGE_BYTES)}.`;
  if (isVideo && size > MAX_VIDEO_BYTES) return `${name} is over ${formatMB(MAX_VIDEO_BYTES)}.`;
  return null;
}

type UploadedMedia = { storagePath: string; mediaType: "IMAGE" | "VIDEO"; bytes: number };

// Reads the `media` JSON ([{storagePath, ticket}]) sent on submit, checks each
// ticket was issued for this task, and confirms the object really landed in
// storage. Size and type come from storage, not from the client. Objects that
// fail the limits are deleted so they don't linger in the bucket.
async function collectUploadedMedia(
  form: FormData,
  taskId: string,
): Promise<{ ok: true; files: UploadedMedia[] } | { ok: false; error: string }> {
  const raw = form.get("media");
  let entries: { storagePath?: unknown; ticket?: unknown }[] = [];
  if (typeof raw === "string" && raw) {
    try {
      entries = JSON.parse(raw);
    } catch {
      return { ok: false, error: "Invalid upload data." };
    }
  }
  if (!Array.isArray(entries)) return { ok: false, error: "Invalid upload data." };
  if (entries.length > MAX_FILES_PER_SUBMIT) return { ok: false, error: "Too many files." };

  const paths = new Set<string>();
  for (const e of entries) {
    if (typeof e.storagePath !== "string" || typeof e.ticket !== "string") {
      return { ok: false, error: "Invalid upload data." };
    }
    if (!verifyUploadTicket(`hk-task:${taskId}`, e.storagePath, e.ticket)) {
      return { ok: false, error: "Upload expired — remove the photos, add them again and resubmit." };
    }
    paths.add(e.storagePath);
  }

  const files: UploadedMedia[] = [];
  for (const storagePath of paths) {
    const info = await getObjectInfo(storagePath);
    if (!info) return { ok: false, error: "A photo didn't finish uploading — please submit again." };
    const type = info.contentType ?? "";
    const err = mediaLimitError(storagePath.split("/").pop() ?? "file", type, info.size);
    if (err) {
      await deleteImages([storagePath]);
      return { ok: false, error: err };
    }
    files.push({ storagePath, mediaType: type.startsWith("video/") ? "VIDEO" : "IMAGE", bytes: info.size });
  }
  return { ok: true, files };
}
