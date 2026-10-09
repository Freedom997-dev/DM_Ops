// Notification events — the single list of what can notify whom.
//
//   recipients "direct"   — the caller names the people (e.g. the assignee).
//                           Admins can switch the event off, not reroute it.
//   recipients "audience" — everyone who can act on it: holders of
//                           `defaultPermission` (Super Admin always counts), or
//                           the roles an admin picked in Settings → Notifications.
//
// Add an event here, then call notify({ type, ... }) where it happens.

export type NotificationEventDef = {
  type: string;
  group: string;
  label: string;
  description: string;
  recipients: "direct" | "audience";
  defaultPermission?: string; // audience: who receives by default
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
