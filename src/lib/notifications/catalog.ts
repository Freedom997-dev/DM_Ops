// Notification events — the single list of what can notify whom.
//
//   recipients "direct"   — the caller names the people (e.g. the assignee).
//                           Admins can switch the event off, not reroute it.
//   recipients "audience" — everyone who can act on it: holders of
//                           `defaultPermission` (Super Admin always counts), or
//                           the roles an admin picked in Settings → Notifications.
//
// Add an event here, then call notify({ type, ... }) where it happens.

import { ROLE_KEYS } from "@/lib/roles";

const MANAGERS = [ROLE_KEYS.SUPER_ADMIN, ROLE_KEYS.ADMIN, ROLE_KEYS.MANAGER];

export type NotificationEventDef = {
  type: string;
  group: string;
  label: string;
  description: string;
  recipients: "direct" | "audience";
  defaultPermission?: string; // audience: who receives by default…
  defaultRoles?: string[]; // …or these roles
  recipientsLabel?: string; // direct events: who "the people it's about" are, for the admin page
  defaultEnabled: boolean;
  mutable: boolean; // false = users can't turn it off (security notices)
};

export const NOTIFICATION_EVENTS: NotificationEventDef[] = [
  {
    type: "hk.task.assigned",
    group: "Housekeeping",
    label: "Task assigned to you",
    description: "A room or daily task was assigned to you.",
    recipients: "direct",
    defaultEnabled: true,
    mutable: true,
  },
  {
    type: "hk.task.submitted",
    group: "Housekeeping",
    label: "Room ready for inspection",
    description: "A housekeeper submitted a cleaned room.",
    recipients: "audience",
    defaultPermission: "housekeeping:cleaning:review",
    defaultEnabled: true,
    mutable: true,
  },
  {
    type: "hk.task.rejected",
    group: "Housekeeping",
    label: "Room sent back",
    description: "A room you cleaned was sent back, with the inspector's reason.",
    recipients: "direct",
    defaultEnabled: true,
    mutable: true,
  },
  {
    type: "hk.task.approved",
    group: "Housekeeping",
    label: "Room approved",
    description: "A room you cleaned passed inspection.",
    recipients: "direct",
    defaultEnabled: true,
    mutable: true,
  },
  {
    type: "hk.rooms.unassigned",
    group: "Housekeeping",
    label: "Rooms waiting for assignment",
    description: "Rooms were checked out for cleaning without a housekeeper.",
    recipients: "audience",
    defaultPermission: "housekeeping:tasks:manage",
    defaultEnabled: true,
    mutable: true,
  },
  {
    type: "account.password.reset",
    group: "Account & security",
    label: "Your password was reset",
    description: "An admin set a new password for your account.",
    recipients: "direct",
    defaultEnabled: true,
    mutable: false,
  },

  // --- Messages --------------------------------------------------------------
  {
    type: "msg.direct",
    group: "Messages",
    label: "New direct message",
    description: "Someone sent you a message.",
    recipients: "direct",
    recipientsLabel: "the other person in the chat",
    defaultEnabled: true,
    mutable: true,
  },
  {
    type: "msg.group",
    group: "Messages",
    label: "New group message",
    description: "A message in one of your groups (you can also mute a single group).",
    recipients: "direct",
    recipientsLabel: "group members",
    defaultEnabled: true,
    mutable: true,
  },
  {
    type: "msg.announcement",
    group: "Messages",
    label: "New announcement",
    description: "A manager posted an announcement for you.",
    recipients: "direct",
    recipientsLabel: "the announcement's audience",
    defaultEnabled: true,
    mutable: false,
  },
  {
    type: "msg.comment",
    group: "Messages",
    label: "New comment",
    description: "A comment on a task or room you're involved in.",
    recipients: "direct",
    recipientsLabel: "the task's assignee and earlier commenters",
    defaultEnabled: true,
    mutable: true,
  },

  // --- Daily Cleanliness -------------------------------------------------------
  {
    type: "dc.not_started",
    group: "Daily Cleanliness",
    label: "Today's inspection not started",
    description: "Late-morning reminder when today's inspection hasn't been started.",
    recipients: "direct",
    recipientsLabel: "roles allowed to run the service",
    defaultEnabled: true,
    mutable: true,
  },
  {
    type: "dc.missed",
    group: "Daily Cleanliness",
    label: "Yesterday's inspection missed",
    description: "Morning notice when no inspection was done yesterday.",
    recipients: "audience",
    defaultRoles: MANAGERS,
    defaultEnabled: true,
    mutable: true,
  },
  {
    type: "dc.issues_summary",
    group: "Daily Cleanliness",
    label: "Yesterday's issue summary",
    description: "Morning summary of issues found in yesterday's inspection.",
    recipients: "audience",
    defaultRoles: MANAGERS,
    defaultEnabled: false,
    mutable: true,
  },

  // --- Room Condition V2 ---------------------------------------------------------
  {
    type: "pmv2.repairs_found",
    group: "Room Condition V2",
    label: "Repairs found",
    description: "An inspection was marked complete with items needing repair.",
    recipients: "audience",
    defaultRoles: MANAGERS,
    defaultEnabled: true,
    mutable: true,
  },
  {
    type: "pmv2.repair_fixed",
    group: "Room Condition V2",
    label: "Repair marked fixed",
    description: "A repair from an inspection you recorded was marked fixed.",
    recipients: "direct",
    recipientsLabel: "whoever recorded the inspection",
    defaultEnabled: true,
    mutable: true,
  },
];

export const EVENT_BY_TYPE = new Map(NOTIFICATION_EVENTS.map((e) => [e.type, e]));

export const NOTIFICATION_GROUPS = [...new Set(NOTIFICATION_EVENTS.map((e) => e.group))];

export function parseRoles(json: string | null | undefined): string[] | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}
