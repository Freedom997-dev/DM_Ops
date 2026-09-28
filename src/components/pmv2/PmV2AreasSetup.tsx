"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import { useToast } from "@/components/Toast";
import {
  pmv2AddArea,
  pmv2BulkAddRooms,
  pmv2RemoveArea,
  pmv2SetHotelName,
  pmv2UpdateArea,
  type PmV2Result,
} from "@/lib/actions/pmv2";

type Area = { id: string; name: string; group: string; type: string; checklistId: string | null };
type ListRef = { id: string; name: string };

export function PmV2AreasSetup({ hotel, lists, areas }: { hotel: string; lists: ListRef[]; areas: Area[] }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [armed, setArmed] = useState<string | null>(null);

  const roomList = lists.find((l) => /room/i.test(l.name))?.id ?? lists[0]?.id ?? "";
  const areaList = lists.find((l) => !/guest/i.test(l.name))?.id ?? roomList;

  const [bulk, setBulk] = useState({ from: "", to: "", group: "", list: roomList });
  const [one, setOne] = useState({ name: "", group: "", type: "AREA", list: areaList });

  const run = (fn: () => Promise<PmV2Result<unknown>>, ok?: (r: PmV2Result<unknown>) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setMsg({ text: r.error, err: true });
        toast.show(r.error, "error");
      } else ok?.(r);
    });

  const update = (id: string, patch: Partial<Omit<Area, "id">>) => run(() => pmv2UpdateArea({ id, ...patch }));

  const opts = lists.map((l) => (
    <option key={l.id} value={l.id}>
      {l.name}
    </option>
  ));

  return (
    <div className={clsx("space-y-3", pending && "opacity-70")}>
      <div className="card space-y-2 p-4">
        <h3 className="text-lg font-bold text-slate-900">Hotel name</h3>
        <p className="text-sm text-slate-500">Shown at the top of the page and on shared reports.</p>
        <input
          key={hotel}
          defaultValue={hotel}
          placeholder="e.g. Divya Motel"
          onBlur={(e) => e.target.value.trim() !== hotel && run(() => pmv2SetHotelName(e.target.value))}
          className="input max-w-md"
        />
      </div>

      <div className="card space-y-3 p-4">
        <h3 className="text-lg font-bold text-slate-900">Add a range of rooms</h3>
        <p className="text-sm text-slate-500">
          Adds rooms numbered from the first number to the last. Rooms that already exist are skipped.
        </p>
        <div className="flex flex-wrap items-end gap-2.5">
          <Field label="From">
            <input type="number" value={bulk.from} onChange={(e) => setBulk({ ...bulk, from: e.target.value })} placeholder="301" className="input w-24" />
          </Field>
          <Field label="To">
            <input type="number" value={bulk.to} onChange={(e) => setBulk({ ...bulk, to: e.target.value })} placeholder="318" className="input w-24" />
          </Field>
          <Field label="Group">
            <input value={bulk.group} onChange={(e) => setBulk({ ...bulk, group: e.target.value })} placeholder="Floor 3" className="input" />
          </Field>
          <Field label="Checklist">
            <select value={bulk.list} onChange={(e) => setBulk({ ...bulk, list: e.target.value })} className="input">
              {opts}
            </select>
          </Field>
          <button
            type="button"
            className="btn-primary"
            onClick={() =>
              run(
                () =>
                  pmv2BulkAddRooms({
                    from: parseInt(bulk.from, 10),
                    to: parseInt(bulk.to, 10),
                    group: bulk.group,
                    checklistId: bulk.list || null,
                  }),
                (r) => {
                  const n = (r.ok && (r.data as { added: number })?.added) || 0;
                  setMsg({ text: n ? `Added ${n} room${n > 1 ? "s" : ""}.` : "Those rooms already exist." });
                },
              )
            }
          >
            Add rooms
          </button>
        </div>

        <h3 className="pt-2 text-lg font-bold text-slate-900">Add one room or area</h3>
        <div className="flex flex-wrap items-end gap-2.5">
          <Field label="Name">
            <input value={one.name} onChange={(e) => setOne({ ...one, name: e.target.value })} placeholder="Pool & spa" className="input" />
          </Field>
          <Field label="Group">
            <input value={one.group} onChange={(e) => setOne({ ...one, group: e.target.value })} placeholder="Common areas" className="input" />
          </Field>
          <Field label="Type">
            <select value={one.type} onChange={(e) => setOne({ ...one, type: e.target.value })} className="input">
              <option value="AREA">Other area</option>
              <option value="ROOM">Guest room</option>
            </select>
          </Field>
          <Field label="Checklist">
            <select value={one.list} onChange={(e) => setOne({ ...one, list: e.target.value })} className="input">
              {opts}
            </select>
          </Field>
          <button
            type="button"
            className="btn-primary"
            onClick={() =>
              run(
                () => pmv2AddArea({ name: one.name, group: one.group, type: one.type, checklistId: one.list || null }),
                () => {
                  setMsg({ text: `Added ${one.name.trim()}.` });
                  setOne({ ...one, name: "" });
                },
              )
            }
          >
            Add
          </button>
        </div>
        {msg && <p className={clsx("text-sm", msg.err ? "text-red-600" : "text-emerald-700")}>{msg.text}</p>}
      </div>

      <div className="card space-y-2 p-4">
        <h3 className="text-lg font-bold text-slate-900">All rooms &amp; areas</h3>
        <p className="text-sm text-slate-500">Edit a name or group directly. Changes save when you leave the field.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
                <th className="px-2 py-1.5">Name</th>
                <th className="px-2 py-1.5">Group</th>
                <th className="px-2 py-1.5">Type</th>
                <th className="px-2 py-1.5">Checklist</th>
                <th className="w-px px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => (
                <tr key={a.id} className="border-b border-slate-100">
                  <td className="px-2 py-1">
                    <input
                      key={`${a.id}-${a.name}`}
                      defaultValue={a.name}
                      aria-label="Name"
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (!v) e.target.value = a.name;
                        else if (v !== a.name) update(a.id, { name: v });
                      }}
                      className="input py-1.5"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      key={`${a.id}-${a.group}`}
                      defaultValue={a.group}
                      aria-label="Group"
                      onBlur={(e) => e.target.value.trim() !== a.group && update(a.id, { group: e.target.value.trim() })}
                      className="input py-1.5"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <select
                      value={a.type}
                      aria-label="Type"
                      onChange={(e) => update(a.id, { type: e.target.value })}
                      className="input py-1.5"
                    >
                      <option value="ROOM">Guest room</option>
                      <option value="AREA">Other area</option>
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <select
                      value={a.checklistId ?? ""}
                      aria-label="Checklist"
                      onChange={(e) => update(a.id, { checklistId: e.target.value || null })}
                      className="input py-1.5"
                    >
                      {!a.checklistId && <option value="">— none —</option>}
                      {opts}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      aria-label={`Remove ${a.name}`}
                      onClick={() => {
                        if (armed !== a.id) return setArmed(a.id);
                        setArmed(null);
                        run(() => pmv2RemoveArea(a.id));
                      }}
                      className={clsx(
                        "flex h-8 items-center justify-center rounded-lg border text-xs transition",
                        armed === a.id
                          ? "border-red-600 bg-red-600 px-2 font-semibold text-white"
                          : "w-8 border-slate-200 bg-white text-slate-500 hover:border-brand-500",
                      )}
                    >
                      {armed === a.id ? "Remove?" : <X className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-xs font-semibold text-slate-500">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}
