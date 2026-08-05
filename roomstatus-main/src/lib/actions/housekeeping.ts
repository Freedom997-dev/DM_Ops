"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, can } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { uploadImage, deleteImages } from "@/lib/storage";
import {
  hkPhotoPath,
  hkGeneralPhotoPath,
  isOpenStatus,
} from "@/lib/housekeeping";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB

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
  }

  refresh();
  return { ok: true, created: toCreate.length, skipped: rooms.length - toCreate.length };
}

// --- Create a general daily task (lobby, laundry, …) ---
export async function createGeneralTask(input: {
  title: string;
  assignedHousekeeperId?: string | null;
  templateId?: string | null;
}): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:tasks:manage")) return { ok: false, error: "Not allowed." };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the task a title." };

  const assignee = input.assignedHousekeeperId || null;

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
    details: { kind: "GENERAL", title, status: "TODO" },
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
    const hk = await prisma.user.findFirst({
      where: { id: housekeeperId, active: true },
      select: { id: true },
    });
    if (!hk) return { ok: false, error: "Housekeeper not found." };
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
    where: { role: "HOUSEKEEPER", active: true },
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
  }

  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "HousekeepingTask",
    entityId: targets[0].id,
    details: { autoAssigned: targets.length, housekeepers: housekeepers.length },
  });

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

  await prisma.housekeepingTask.update({
    where: { id: taskId },
    data: {
      status: "IN_PROGRESS",
      startedAt: new Date(),
      reviewNote: null,
      // Self-assign if it wasn't assigned to anyone.
      assignedHousekeeperId: task.assignedHousekeeperId ?? user.id,
    },
  });
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

// --- Housekeeper submits a cleaned ROOM for inspection (photos required) ---
export async function submitForInspection(form: FormData): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:tasks:submit")) return { ok: false, error: "Not allowed." };

  const taskId = form.get("taskId");
  if (typeof taskId !== "string") return { ok: false, error: "Missing task." };

  const task = await prisma.housekeepingTask.findUnique({
    where: { id: taskId },
    include: { room: { select: { number: true } } },
  });
  if (!task) return { ok: false, error: "Task not found." };
  if (task.kind !== "ROOM_CLEANING") return { ok: false, error: "Not a room-cleaning task." };
  if (task.status !== "READY_TO_CLEAN" && task.status !== "IN_PROGRESS") {
    return { ok: false, error: "This room is not being cleaned." };
  }

  const staged = stageMedia(form, (ext) => hkPhotoPath(task.room?.number ?? "unknown", ext));
  if (!staged.ok) return { ok: false, error: staged.error };
  if (staged.files.length === 0) return { ok: false, error: "Add at least one photo or video before submitting." };

  const uploaded = await uploadStaged(staged.files);
  if (!uploaded.ok) return { ok: false, error: uploaded.error };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.housekeepingPhoto.createMany({
        data: staged.files.map((s) => ({
          taskId, storagePath: s.storagePath, mediaType: s.mediaType, bytes: s.file.size, uploadedById: user.id,
        })),
      });
      await tx.housekeepingTask.update({
        where: { id: taskId },
        data: {
          status: "READY_FOR_INSPECTION",
          submittedById: user.id,
          submittedAt: new Date(),
          assignedHousekeeperId: task.assignedHousekeeperId ?? user.id,
        },
      });
    });
  } catch (e) {
    await deleteImages(uploaded.paths);
    return { ok: false, error: e instanceof Error ? e.message : "Could not submit." };
  }

  await logAudit({
    userId: user.id, action: "UPDATE", entity: "HousekeepingTask", entityId: taskId,
    details: { roomNumber: task.room?.number, status: "READY_FOR_INSPECTION", photos: uploaded.paths.length },
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

  const staged = stageMedia(form, (ext) => hkGeneralPhotoPath(ext));
  if (!staged.ok) return { ok: false, error: staged.error };

  const uploaded = await uploadStaged(staged.files);
  if (!uploaded.ok) return { ok: false, error: uploaded.error };

  try {
    await prisma.$transaction(async (tx) => {
      if (staged.files.length > 0) {
        await tx.housekeepingPhoto.createMany({
          data: staged.files.map((s) => ({
            taskId, storagePath: s.storagePath, mediaType: s.mediaType, bytes: s.file.size, uploadedById: user.id,
          })),
        });
      }
      await tx.housekeepingTask.update({
        where: { id: taskId },
        data: {
          status: "DONE",
          submittedById: user.id,
          submittedAt: new Date(),
          closedAt: new Date(),
          assignedHousekeeperId: task.assignedHousekeeperId ?? user.id,
        },
      });
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
    include: {
      room: { select: { number: true } },
      photos: { select: { id: true, storagePath: true } },
    },
  });
  if (!task) return { ok: false, error: "Task not found." };
  if (task.status !== "READY_FOR_INSPECTION") {
    return { ok: false, error: "This room is not awaiting inspection." };
  }

  if (outcome === "REJECT") {
    const trimmed = (note ?? "").trim();
    if (!trimmed) return { ok: false, error: "A note is required when rejecting." };
    await prisma.housekeepingTask.update({
      where: { id: taskId },
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
    await logAudit({
      userId: user.id, action: "UPDATE", entity: "HousekeepingTask", entityId: taskId,
      details: { roomNumber: task.room?.number, outcome: "REJECTED", note: trimmed.slice(0, 200) },
    });
    refresh();
    return { ok: true };
  }

  // APPROVE
  const setting = await prisma.housekeepingSetting.findUnique({ where: { id: "singleton" } });
  const deleteOnApproval = setting?.deleteOnApproval ?? true;

  await prisma.housekeepingTask.update({
    where: { id: taskId },
    data: {
      status: "READY_TO_RENT",
      reviewedById: user.id,
      reviewedAt: new Date(),
      reviewNote: (note ?? "").trim().slice(0, 1000) || null,
      closedAt: new Date(),
    },
  });

  if (deleteOnApproval && task.photos.length > 0) {
    await deleteImages(task.photos.map((p) => p.storagePath));
    await prisma.housekeepingPhoto.deleteMany({ where: { taskId } });
    await logAudit({
      userId: user.id, action: "DELETE", entity: "HousekeepingPhoto", entityId: taskId,
      details: { reason: "deleteOnApproval", count: task.photos.length },
    });
  }

  await logAudit({
    userId: user.id, action: "UPDATE", entity: "HousekeepingTask", entityId: taskId,
    details: { roomNumber: task.room?.number, outcome: "APPROVED" },
  });
  refresh();
  return { ok: true };
}

export async function bulkReview(
  taskIds: string[],
  outcome: "APPROVE" | "REJECT",
  note?: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
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
// Admin — delete photo, settings, retention sweep
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
  deleteOnApproval: boolean;
  retentionDays: number;
  instructions: string;
}): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "housekeeping:settings:configure")) return { ok: false, error: "Not allowed." };

  const days = Math.min(365, Math.max(1, Math.round(input.retentionDays)));
  await prisma.housekeepingSetting.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton", deleteOnApproval: input.deleteOnApproval, retentionDays: days,
      instructions: input.instructions.trim().slice(0, 2000) || null,
    },
    update: {
      deleteOnApproval: input.deleteOnApproval, retentionDays: days,
      instructions: input.instructions.trim().slice(0, 2000) || null,
    },
  });
  await logAudit({
    userId: user.id, action: "UPDATE", entity: "HousekeepingSetting", entityId: "singleton",
    details: { deleteOnApproval: input.deleteOnApproval, retentionDays: days },
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

type StagedFile = { file: File; storagePath: string; mediaType: "IMAGE" | "VIDEO" };

// Validates media-* / image-* form entries (photos and videos) and builds a
// storage path per file. `pathFor(ext)` returns the full storage path.
function stageMedia(
  form: FormData,
  pathFor: (ext: string) => string,
): { ok: true; files: StagedFile[] } | { ok: false; error: string } {
  const files: StagedFile[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("media-") && !key.startsWith("image-")) continue;
    if (!(value instanceof File)) continue;
    const isImage = value.type.startsWith("image/");
    const isVideo = value.type.startsWith("video/");
    if (!isImage && !isVideo) return { ok: false, error: `Unsupported file: ${value.name}` };
    if (isImage && value.size > MAX_IMAGE_BYTES) return { ok: false, error: `${value.name} exceeds 10 MB.` };
    if (isVideo && value.size > MAX_VIDEO_BYTES) return { ok: false, error: `${value.name} exceeds 50 MB.` };
    files.push({
      file: value,
      storagePath: pathFor(extFromMime(value.type)),
      mediaType: isVideo ? "VIDEO" : "IMAGE",
    });
  }
  return { ok: true, files };
}

async function uploadStaged(
  files: StagedFile[],
): Promise<{ ok: true; paths: string[] } | { ok: false; error: string }> {
  const paths: string[] = [];
  try {
    for (const s of files) {
      await uploadImage(s.storagePath, s.file, s.file.type);
      paths.push(s.storagePath);
    }
    return { ok: true, paths };
  } catch (e) {
    await deleteImages(paths);
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }
}
