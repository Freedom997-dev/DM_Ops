import clsx from "clsx";
import {
  ITEM_STATUS_META,
  ROOM_STATUS_META,
  type ItemStatus,
  type RoomStatus,
} from "@/lib/status";

export function RoomStatusBadge({ status }: { status: RoomStatus }) {
  const meta = ROOM_STATUS_META[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        meta.chip,
      )}
    >
      <span className={clsx("h-2 w-2 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const meta = ITEM_STATUS_META[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        meta.chip,
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}
