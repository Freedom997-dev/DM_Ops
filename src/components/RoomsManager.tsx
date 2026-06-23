"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormState } from "react-dom";
import clsx from "clsx";
import {
  Archive,
  ArchiveRestore,
  ClipboardCheck,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import { RoomStatusBadge } from "@/components/StatusBadge";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { createRoom, updateRoom, setRoomArchived, type ActionState } from "@/lib/actions/rooms";
import { type RoomStatus } from "@/lib/status";

type Room = {
  id: string;
  number: string;
  name: string | null;
  floor: string | null;
  notes: string | null;
  archived: boolean;
  status: RoomStatus;
  lastInspected: string | null;
};

const EMPTY: ActionState = { ok: false };

export function RoomsManager({
  rooms,
  isAdmin,
  initialAdd,
  initialEditId,
}: {
  rooms: Room[];
  isAdmin: boolean;
  initialAdd: boolean;
  initialEditId: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(initialAdd && isAdmin);
  const [editing, setEditing] = useState<Room | null>(
    initialEditId ? rooms.find((r) => r.id === initialEditId) ?? null : null,
  );
  const [showArchived, setShowArchived] = useState(false);

  const filtered = rooms
    .filter((r) => (showArchived ? r.archived : !r.archived))
    .filter((r) => {
      const q = query.toLowerCase();
      return (
        r.number.toLowerCase().includes(q) ||
        (r.name ?? "").toLowerCase().includes(q)
      );
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rooms</h1>
          <p className="text-sm text-slate-500">
            {rooms.filter((r) => !r.archived).length} active rooms
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => { setEditing(null); setAdding(true); }} className="btn-primary">
            <Plus className="h-4 w-4" />
            Add room
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search room number or name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {isAdmin && (
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Show archived
          </label>
        )}
      </div>

      {(adding || editing) && isAdmin && (
        <RoomForm
          room={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
            router.replace("/rooms");
          }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            router.replace("/rooms");
            router.refresh();
          }}
        />
      )}

      <div className="card divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No rooms found.</div>
        ) : (
          filtered.map((room) => (
            <div
              key={room.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <Link href={`/rooms/${room.id}`} className="flex items-center gap-3 hover:opacity-80">
                <div className="flex h-11 w-11 flex-col items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-700">
                  {room.number}
                </div>
                <div>
                  <div className="font-semibold text-slate-900">
                    Room {room.number}
                    {room.name && (
                      <span className="ml-2 font-normal text-slate-500">{room.name}</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400">
                    {room.lastInspected
                      ? `Last inspected ${new Date(room.lastInspected).toLocaleDateString()}`
                      : "Never inspected"}
                  </div>
                </div>
              </Link>

              <div className="flex items-center gap-2">
                <RoomStatusBadge status={room.status} />
                <Link
                  href={`/inspect/${room.id}`}
                  className="btn-secondary px-3 py-2"
                  title="Inspect"
                >
                  <ClipboardCheck className="h-4 w-4" />
                </Link>
                {isAdmin && (
                  <>
                    <button
                      onClick={() => { setAdding(false); setEditing(room); }}
                      className="btn-secondary px-3 py-2"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <ArchiveButton room={room} onDone={() => router.refresh()} />
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ArchiveButton({ room, onDone }: { room: Room; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await setRoomArchived(room.id, !room.archived);
        setBusy(false);
        onDone();
      }}
      className="btn-secondary px-3 py-2"
      title={room.archived ? "Restore" : "Archive"}
    >
      {room.archived ? (
        <ArchiveRestore className="h-4 w-4" />
      ) : (
        <Archive className="h-4 w-4" />
      )}
    </button>
  );
}

function RoomForm({
  room,
  onClose,
  onSaved,
}: {
  room: Room | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const action = room ? updateRoom : createRoom;
  const [state, formAction] = useFormState(action, EMPTY);

  useEffect(() => {
    if (state.ok) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">
          {room ? `Edit Room ${room.number}` : "Add a room"}
        </h2>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
          <X className="h-5 w-5" />
        </button>
      </div>
      <form action={formAction} className="grid gap-4 sm:grid-cols-2">
        {room && <input type="hidden" name="id" value={room.id} />}
        <div>
          <label className="label">Room number *</label>
          <input name="number" required defaultValue={room?.number ?? ""} className="input" placeholder="101" />
        </div>
        <div>
          <label className="label">Room name / type</label>
          <input name="name" defaultValue={room?.name ?? ""} className="input" placeholder="Queen Suite" />
        </div>
        <div>
          <label className="label">Floor</label>
          <input name="floor" defaultValue={room?.floor ?? ""} className="input" placeholder="1" />
        </div>
        <div>
          <label className="label">Notes</label>
          <input name="notes" defaultValue={room?.notes ?? ""} className="input" placeholder="Optional" />
        </div>

        {state.error && (
          <p className="sm:col-span-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        )}

        <div className="sm:col-span-2 flex gap-2">
          <SubmitButton pendingText="Saving…">
            {room ? "Save changes" : "Add room"}
          </SubmitButton>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
