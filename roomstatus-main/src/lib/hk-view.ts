// Shared serializable view types for the Housekeeping dashboard + a pure
// timeline builder. Imported by the server page and the client components.

import type { HkKind, HkStatus } from "@/lib/housekeeping";

export type HkPerson = { id: string; name: string };

export type HkMediaType = "IMAGE" | "VIDEO";
export type HkPhotoView = { id: string; url: string; mediaType: HkMediaType };

export type HkSubtaskStatus = "PENDING" | "DONE" | "NOT_DONE" | "NA";
export type HkSubtask = {
  id: string;
  label: string;
  status: HkSubtaskStatus;
  note: string | null;
};

export type HkTaskView = {
  id: string;
  kind: HkKind;
  title: string | null;
  status: HkStatus;
  requestReason: string | null;
  roomId: string | null;
  roomNumber: string | null;
  roomName: string | null;
  assignedTo: HkPerson | null;
  createdByName: string | null;
  submittedByName: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
  createdAt: string;
  assignedAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  closedAt: string | null;
  photos: HkPhotoView[];
  subtasks: HkSubtask[];
};

export type HkRoomOption = {
  id: string;
  number: string;
  name: string | null;
  busy: boolean; // already has an open cleaning task
};

export type HkStatusAction = { id: string; label: string };
export type HkTaskTemplate = { id: string; label: string };
export type HkChecklistItem = { id: string; label: string };
// A daily-task template plus its checklist (for the settings editor).
export type HkTemplateWithChecklist = { id: string; label: string; checklist: HkChecklistItem[] };

export type HkCaps = {
  manage: boolean; // check out rooms, create + assign tasks
  submit: boolean; // start / submit / complete
  review: boolean; // approve / reject
  admin: boolean; // settings, delete photos
};

export type TimelineEvent = {
  at: string;
  label: string;
  who: string | null;
  tone: "slate" | "amber" | "sky" | "violet" | "emerald" | "red";
};

/** Builds the activity timeline for the current cleaning/task cycle. */
export function buildTimeline(t: HkTaskView): TimelineEvent[] {
  const ev: TimelineEvent[] = [];

  ev.push({
    at: t.createdAt,
    label: t.kind === "ROOM_CLEANING" ? "Checked out for cleaning" : "Task created",
    who: t.createdByName,
    tone: "slate",
  });

  if (t.assignedAt && t.assignedTo) {
    ev.push({ at: t.assignedAt, label: "Assigned", who: t.assignedTo.name, tone: "amber" });
  }
  if (t.startedAt) {
    ev.push({
      at: t.startedAt,
      label: t.kind === "ROOM_CLEANING" ? "Cleaning started" : "Started",
      who: t.assignedTo?.name ?? null,
      tone: "sky",
    });
  }
  if (t.submittedAt) {
    ev.push({
      at: t.submittedAt,
      label: t.kind === "ROOM_CLEANING" ? "Submitted for inspection" : "Marked done",
      who: t.submittedByName,
      tone: t.kind === "ROOM_CLEANING" ? "violet" : "emerald",
    });
  }
  if (t.reviewedAt) {
    const rejected = t.status === "READY_TO_CLEAN" && !!t.reviewNote;
    ev.push({
      at: t.reviewedAt,
      label: rejected ? "Sent back to clean" : "Approved — Ready to Rent",
      who: t.reviewedByName,
      tone: rejected ? "red" : "emerald",
    });
  }

  return ev.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export function statusLabelForStatus(status: HkStatus): HkStatus {
  return status;
}
