"use server";

import cuid from "cuid";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireWorkflowAccess, requireUser, requireAdmin, isManager } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { uploadImage, deleteImages } from "@/lib/storage";
import { motelTodayUTC, formatBusinessDate } from "@/lib/business-date";
import { parseRolesAllowed } from "@/lib/permissions";
import { notify } from "@/lib/notifications/notify";
import { sheetState, lockMessage, parseDateKey } from "@/lib/workflow-lock";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const CELL_STATUS = ["OK", "ISSUE", "NA"] as const;
type CellStatus = (typeof CELL_STATUS)[number];

function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic") return "heic";
  return "bin";
}

// ---------------------------------------------------------------------------
// Editability — every write goes through this (see src/lib/workflow-lock.ts)
// ---------------------------------------------------------------------------

function editError(submission: { date: Date; status: string; unlockedAt: Date | null }): string | null {
  const state = sheetState(submission.date, motelTodayUTC(), submission);
  return state.editable ? null : lockMessage(state.lockReason);
}

function revalidateWorkflow(slug: string) {
  revalidatePath(`/services/${slug}`);
  revalidatePath(`/services/${slug}/history`);
  revalidatePath("/services");
}

// ---------------------------------------------------------------------------
// Get-or-create the submission for the day being viewed. Only today's can be
// created by a first tap; a past day is created by a manager's unlock.
// ---------------------------------------------------------------------------

type SubmissionResult =
  | { ok: true; submissionId: string }
  | { ok: false; error: string };

export async function getOrCreateSubmission(workflowSlug: string, day: string): Promise<SubmissionResult> {
  const { user, workflow } = await requireWorkflowAccess(workflowSlug);
  const date = parseDateKey(day);
  if (!date) return { ok: false, error: "Invalid date." };

  const existing = await prisma.workflowSubmission.findUnique({
    where: { workflowId_date: { workflowId: workflow.id, date } },
  });
  if (existing) {
    const err = editError(existing);
    return err ? { ok: false, error: err } : { ok: true, submissionId: existing.id };
  }

  const state = sheetState(date, motelTodayUTC(), null);
  if (!state.editable) return { ok: false, error: lockMessage(state.lockReason) };

  const submissionId = cuid();
  try {
    await prisma.workflowSubmission.create({
      data: {
        id: submissionId,
        workflowId: workflow.id,
        date,
        status: "IN_PROGRESS",
        createdById: user.id,
      },
    });
  } catch (e) {
    // Race: someone else just created it. Re-fetch.
    const again = await prisma.workflowSubmission.findUnique({
      where: { workflowId_date: { workflowId: workflow.id, date } },
    });
    if (again) return { ok: true, submissionId: again.id };
    return { ok: false, error: e instanceof Error ? e.message : "Could not open submission." };
  }

  await logAudit({
    userId: user.id,
    action: "CREATE",
    entity: "WorkflowSubmission",
    entityId: submissionId,
    details: { workflowSlug, date: date.toISOString() },
  });

  revalidateWorkflow(workflowSlug);
  return { ok: true, submissionId };
}

// ---------------------------------------------------------------------------
// Unlock / lock a past day (manager and above)
// ---------------------------------------------------------------------------

export async function unlockDay(workflowSlug: string, day: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, workflow } = await requireWorkflowAccess(workflowSlug);
  if (!isManager(user)) return { ok: false, error: "Only a manager can unlock a past day." };
  const date = parseDateKey(day);
  if (!date) return { ok: false, error: "Invalid date." };
  if (sheetState(date, motelTodayUTC(), null).kind !== "past") {
    return { ok: false, error: "Only past days can be unlocked." };
  }

  const existing = await prisma.workflowSubmission.findUnique({
    where: { workflowId_date: { workflowId: workflow.id, date } },
  });
  if (existing?.status === "COMPLETED") {
    return { ok: false, error: "This day is marked complete. An admin can Reopen it." };
  }

  const now = new Date();
  // A missed day has no submission yet: unlocking creates its blank sheet.
  const submission = await prisma.workflowSubmission.upsert({
    where: { workflowId_date: { workflowId: workflow.id, date } },
    create: {
      workflowId: workflow.id,
      date,
      status: "IN_PROGRESS",
      createdById: user.id,
      unlockedAt: now,
      unlockedById: user.id,
    },
    update: { unlockedAt: now, unlockedById: user.id },
  });

  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "WorkflowSubmission",
    entityId: submission.id,
    details: { workflowSlug, date: day, status: "UNLOCKED", createdBlank: !existing },
  });
  const staff = await prisma.user.findMany({
    where: { active: true, roles: { some: { role: { key: { in: parseRolesAllowed(workflow.rolesAllowed) } } } } },
    select: { id: true },
  });
  await notify({
    type: "dc.day_unlocked",
    actorId: user.id,
    userIds: staff.map((u) => u.id),
    collapse: true,
    title: `${formatBusinessDate(date, { weekday: "short", month: "short", day: "numeric" })} unlocked for editing`,
    body: `${user.name} unlocked this day of ${workflow.name}. You can fill it in or correct it until it's locked again.`,
    href: `/services/${workflowSlug}?date=${day}`,
    entityType: "WorkflowDay",
    entityId: `${workflow.id}:${day}`,
  });
  revalidateWorkflow(workflowSlug);
  return { ok: true };
}

export async function lockDay(submissionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const submission = await prisma.workflowSubmission.findUnique({
    where: { id: submissionId },
    include: { workflow: true },
  });
  if (!submission) return { ok: false, error: "Submission not found." };
  const { user } = await requireWorkflowAccess(submission.workflow.slug);
  if (!isManager(user)) return { ok: false, error: "Only a manager can lock a day." };
  if (!submission.unlockedAt) return { ok: true };

  await prisma.workflowSubmission.update({
    where: { id: submissionId },
    data: { unlockedAt: null, unlockedById: null },
  });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "WorkflowSubmission",
    entityId: submissionId,
    details: { workflowSlug: submission.workflow.slug, status: "LOCKED" },
  });
  revalidateWorkflow(submission.workflow.slug);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Update a single cell (upsert)
// ---------------------------------------------------------------------------

const updateCellSchema = z.object({
  submissionId: z.string().min(1),
  roomId: z.string().min(1),
  itemId: z.string().min(1),
  status: z.enum(CELL_STATUS),
});

type UpdateCellResult =
  | { ok: true; cellId: string; lastUpdatedBy: string; lastUpdatedAt: string }
  | { ok: false; error: string };

export async function updateCell(input: z.infer<typeof updateCellSchema>): Promise<UpdateCellResult> {
  const parsed = updateCellSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid cell input." };
  const { submissionId, roomId, itemId, status } = parsed.data;

  const submission = await prisma.workflowSubmission.findUnique({
    where: { id: submissionId },
    include: { workflow: true },
  });
  if (!submission) return { ok: false, error: "Submission not found." };
  const lockedErr = editError(submission);
  if (lockedErr) return { ok: false, error: lockedErr };

  const { user } = await requireWorkflowAccess(submission.workflow.slug);

  const item = await prisma.workflowItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, error: "Item not found." };

  // "NA" means blank / not-applicable — we don't store a row for it.
  // Delete any existing cell so blank == no record (cleanest history).
  if (status === "NA") {
    const existing = await prisma.workflowCell.findUnique({
      where: { submissionId_roomId_itemId: { submissionId, roomId, itemId } },
    });
    if (existing) {
      await prisma.workflowCell.delete({ where: { id: existing.id } });
      await logAudit({
        userId: user.id,
        action: "DELETE",
        entity: "WorkflowCell",
        entityId: existing.id,
        details: { submissionId, roomId, itemId, newStatus: "NA" },
      });
      revalidatePath(`/services/${submission.workflow.slug}`);
    }
    return { ok: true, cellId: existing?.id ?? "", lastUpdatedBy: user.name ?? "", lastUpdatedAt: new Date().toISOString() };
  }

  const upserted = await prisma.workflowCell.upsert({
    where: {
      submissionId_roomId_itemId: { submissionId, roomId, itemId },
    },
    create: {
      submissionId,
      roomId,
      itemId,
      itemText: item.text,
      status,
      lastUpdatedById: user.id,
    },
    update: {
      status,
      itemText: item.text,
      lastUpdatedById: user.id,
      lastUpdatedAt: new Date(),
    },
    include: { lastUpdatedBy: { select: { name: true } } },
  });

  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "WorkflowCell",
    entityId: upserted.id,
    details: { submissionId, roomId, itemId, newStatus: status },
  });

  revalidatePath(`/services/${submission.workflow.slug}`);

  return {
    ok: true,
    cellId: upserted.id,
    lastUpdatedBy: upserted.lastUpdatedBy.name,
    lastUpdatedAt: upserted.lastUpdatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Save a row (note + uploaded photos via FormData)
// FormData expects:
//   - submissionId (string)
//   - roomId (string)
//   - note (string, may be empty)
//   - image-<index> (File) — repeated
// ---------------------------------------------------------------------------

type SaveRowResult =
  | { ok: true; rowId: string }
  | { ok: false; error: string };

export async function saveRow(form: FormData): Promise<SaveRowResult> {
  const submissionId = form.get("submissionId");
  const roomId = form.get("roomId");
  const note = form.get("note");
  if (typeof submissionId !== "string" || typeof roomId !== "string") {
    return { ok: false, error: "Missing submissionId or roomId." };
  }
  // Only touch the note if the form explicitly sent one (photos-only saves omit it).
  const hasNote = form.has("note");
  const noteValue = typeof note === "string" ? note.trim().slice(0, 1000) : "";

  const submission = await prisma.workflowSubmission.findUnique({
    where: { id: submissionId },
    include: { workflow: true },
  });
  if (!submission) return { ok: false, error: "Submission not found." };
  const lockedErr = editError(submission);
  if (lockedErr) return { ok: false, error: lockedErr };

  const { user, workflow } = await requireWorkflowAccess(submission.workflow.slug);

  // Pre-mint the row ID so storage paths can embed it before DB write.
  const existingRow = await prisma.workflowRow.findUnique({
    where: { submissionId_roomId: { submissionId, roomId } },
  });
  const rowId = existingRow?.id ?? cuid();

  // Stage uploads
  type Staged = { file: File; storagePath: string };
  const staged: Staged[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("image-")) continue;
    if (!(value instanceof File)) continue;
    if (!value.type.startsWith("image/")) {
      return { ok: false, error: `Rejected non-image file: ${value.name}` };
    }
    if (value.size > MAX_FILE_BYTES) {
      return { ok: false, error: `File ${value.name} exceeds 10 MB.` };
    }
    const ext = extFromMime(value.type);
    const storagePath = `workflows/${workflow.slug}/${submissionId}/${rowId}/${cuid()}.${ext}`;
    staged.push({ file: value, storagePath });
  }

  const uploadedPaths: string[] = [];
  try {
    for (const img of staged) {
      await uploadImage(img.storagePath, img.file, img.file.type);
      uploadedPaths.push(img.storagePath);
    }
  } catch (e) {
    await deleteImages(uploadedPaths);
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.workflowRow.upsert({
        where: { submissionId_roomId: { submissionId, roomId } },
        create: {
          id: rowId,
          submissionId,
          roomId,
          ...(hasNote ? { note: noteValue || null } : {}),
          lastUpdatedById: user.id,
          lastUpdatedAt: new Date(),
        },
        update: {
          ...(hasNote ? { note: noteValue || null } : {}),
          lastUpdatedById: user.id,
          lastUpdatedAt: new Date(),
        },
      });

      if (staged.length > 0) {
        await tx.workflowRowImage.createMany({
          data: staged.map((s) => ({
            rowId,
            storagePath: s.storagePath,
            bytes: s.file.size,
            uploadedById: user.id,
          })),
        });
      }
    });
  } catch (e) {
    await deleteImages(uploadedPaths);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not save row.",
    };
  }

  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "WorkflowRow",
    entityId: rowId,
    details: { submissionId, roomId, photosAdded: uploadedPaths.length, noteUpdated: noteValue.length > 0 },
  });

  revalidatePath(`/services/${submission.workflow.slug}`);
  return { ok: true, rowId };
}

// ---------------------------------------------------------------------------
// Save just the per-room note (from the always-visible Notes column)
// ---------------------------------------------------------------------------

export async function saveRowNote(
  submissionId: string,
  roomId: string,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const submission = await prisma.workflowSubmission.findUnique({
    where: { id: submissionId },
    include: { workflow: true },
  });
  if (!submission) return { ok: false, error: "Submission not found." };
  const lockedErr = editError(submission);
  if (lockedErr) return { ok: false, error: lockedErr };
  const { user } = await requireWorkflowAccess(submission.workflow.slug);

  const noteValue = note.trim().slice(0, 1000);

  await prisma.workflowRow.upsert({
    where: { submissionId_roomId: { submissionId, roomId } },
    create: {
      submissionId,
      roomId,
      note: noteValue || null,
      lastUpdatedById: user.id,
      lastUpdatedAt: new Date(),
    },
    update: {
      note: noteValue || null,
      lastUpdatedById: user.id,
      lastUpdatedAt: new Date(),
    },
  });

  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "WorkflowRow",
    details: { submissionId, roomId, noteUpdated: true },
  });

  revalidatePath(`/services/${submission.workflow.slug}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Mark submission complete
// ---------------------------------------------------------------------------

export async function markSubmissionComplete(submissionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const submission = await prisma.workflowSubmission.findUnique({
    where: { id: submissionId },
    include: { workflow: true },
  });
  if (!submission) return { ok: false, error: "Submission not found." };
  const { user } = await requireWorkflowAccess(submission.workflow.slug);

  if (submission.status === "COMPLETED") return { ok: true };
  const lockedErr = editError(submission);
  if (lockedErr) return { ok: false, error: lockedErr };

  await prisma.workflowSubmission.update({
    where: { id: submissionId },
    data: { status: "COMPLETED", completedAt: new Date(), unlockedAt: null, unlockedById: null },
  });

  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "WorkflowSubmission",
    entityId: submissionId,
    details: { workflowSlug: submission.workflow.slug, status: "COMPLETED" },
  });

  revalidatePath(`/services/${submission.workflow.slug}`);
  revalidatePath(`/services/${submission.workflow.slug}/history`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reopen a completed submission (admin only)
// ---------------------------------------------------------------------------

export async function reopenSubmission(submissionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const submission = await prisma.workflowSubmission.findUnique({
    where: { id: submissionId },
    include: { workflow: true },
  });
  if (!submission) return { ok: false, error: "Submission not found." };

  // Only admins can reopen a locked submission.
  const admin = await requireAdmin();

  if (submission.status !== "COMPLETED") return { ok: true };

  // A reopened past day comes back unlocked; otherwise it would stay read-only.
  const isPast = sheetState(submission.date, motelTodayUTC(), null).kind === "past";
  await prisma.workflowSubmission.update({
    where: { id: submissionId },
    data: {
      status: "IN_PROGRESS",
      completedAt: null,
      ...(isPast && { unlockedAt: new Date(), unlockedById: admin.id }),
    },
  });

  await logAudit({
    userId: admin.id,
    action: "UPDATE",
    entity: "WorkflowSubmission",
    entityId: submissionId,
    details: { workflowSlug: submission.workflow.slug, status: "REOPENED" },
  });

  revalidatePath(`/services/${submission.workflow.slug}`);
  revalidatePath(`/services/${submission.workflow.slug}/history`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Delete a row image (admin only)
// ---------------------------------------------------------------------------

export async function deleteRowImage(imageId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();

  const image = await prisma.workflowRowImage.findUnique({
    where: { id: imageId },
    include: {
      row: {
        include: { submission: { include: { workflow: true } } },
      },
    },
  });
  if (!image) return { ok: false, error: "Image not found." };

  await deleteImages([image.storagePath]);

  try {
    await prisma.workflowRowImage.delete({ where: { id: imageId } });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete image row." };
  }

  await logAudit({
    userId: admin.id,
    action: "DELETE",
    entity: "WorkflowRow",
    entityId: image.rowId,
    details: { storagePath: image.storagePath, imageId },
  });

  revalidatePath(`/services/${image.row.submission.workflow.slug}`);
  return { ok: true };
}
