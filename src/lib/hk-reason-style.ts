// Colour + icon for a task's check-out reason (status action), so housekeepers
// can tell Checkout from Stayover at a glance. Client-safe.
//
// Admins pick these per status action in Housekeeping settings; unset values
// fall back to a guess from the label, then to the palette by position.

import { BedDouble, Brush, DoorOpen, Sparkles, Star, Wrench, type LucideIcon } from "lucide-react";

export const REASON_COLORS = ["blue", "violet", "emerald", "amber", "rose", "teal", "slate"] as const;
export type ReasonColor = (typeof REASON_COLORS)[number];

export const REASON_ICONS = ["door", "bed", "sparkles", "brush", "star", "wrench"] as const;
export type ReasonIcon = (typeof REASON_ICONS)[number];

// Full class strings (not built from parts) so Tailwind keeps them.
export const REASON_COLOR_CLASSES: Record<ReasonColor, {
  label: string; tile: string; chip: string; edge: string; swatch: string;
}> = {
  blue:    { label: "Blue",   tile: "bg-blue-100 text-blue-700",       chip: "bg-blue-600 text-white",    edge: "border-l-blue-500",    swatch: "bg-blue-500" },
  violet:  { label: "Purple", tile: "bg-violet-100 text-violet-700",   chip: "bg-violet-600 text-white",  edge: "border-l-violet-500",  swatch: "bg-violet-500" },
  emerald: { label: "Green",  tile: "bg-emerald-100 text-emerald-700", chip: "bg-emerald-600 text-white", edge: "border-l-emerald-500", swatch: "bg-emerald-500" },
  amber:   { label: "Orange", tile: "bg-amber-100 text-amber-700",     chip: "bg-amber-500 text-white",   edge: "border-l-amber-500",   swatch: "bg-amber-500" },
  rose:    { label: "Red",    tile: "bg-rose-100 text-rose-700",       chip: "bg-rose-600 text-white",    edge: "border-l-rose-500",    swatch: "bg-rose-500" },
  teal:    { label: "Teal",   tile: "bg-teal-100 text-teal-700",       chip: "bg-teal-600 text-white",    edge: "border-l-teal-500",    swatch: "bg-teal-500" },
  slate:   { label: "Grey",   tile: "bg-slate-200 text-slate-700",     chip: "bg-slate-600 text-white",   edge: "border-l-slate-400",   swatch: "bg-slate-500" },
};

export const REASON_ICON_COMPONENTS: Record<ReasonIcon, { label: string; Icon: LucideIcon }> = {
  door:     { label: "Door (checkout)", Icon: DoorOpen },
  bed:      { label: "Bed (stayover)",  Icon: BedDouble },
  sparkles: { label: "Sparkles",        Icon: Sparkles },
  brush:    { label: "Brush",           Icon: Brush },
  star:     { label: "Star",            Icon: Star },
  wrench:   { label: "Wrench",          Icon: Wrench },
};

export type ReasonStyleInput = { label: string; shortLabel?: string | null; color?: string | null; icon?: string | null };
export type ReasonStyle = { name: string; color: ReasonColor; icon: ReasonIcon };

// Automatic picks skip blue/purple (Checkout/Stayover guesses) and orange, which
// reads like the orange "Ready to Clean" status. Admins can still choose any.
const AUTO_COLORS: ReasonColor[] = ["teal", "rose", "emerald", "slate"];

const isColor = (c: string | null | undefined): c is ReasonColor => !!c && (REASON_COLORS as readonly string[]).includes(c);
const isIcon = (i: string | null | undefined): i is ReasonIcon => !!i && (REASON_ICONS as readonly string[]).includes(i);

/** "Stay_Over_Service" → "Stay Over Service" */
export const prettyReason = (label: string) => label.replace(/_/g, " ").replace(/\s+/g, " ").trim();

function guessFromLabel(label: string): { color: ReasonColor; icon: ReasonIcon } | null {
  const l = label.toLowerCase();
  if (/stay/.test(l)) return { color: "violet", icon: "bed" };
  if (/check|departure/.test(l)) return { color: "blue", icon: "door" };
  if (/deep/.test(l)) return { color: "teal", icon: "sparkles" };
  return null;
}

/**
 * Style for one status action. `autoIndex` picks the palette colour when the
 * admin chose none and the label gives no hint (count only such reasons, so
 * the first one gets teal).
 */
export function reasonStyle(a: ReasonStyleInput, autoIndex: number): ReasonStyle {
  const guess = guessFromLabel(a.label);
  return {
    name: a.shortLabel?.trim() || prettyReason(a.label),
    color: isColor(a.color) ? a.color : guess?.color ?? AUTO_COLORS[autoIndex % AUTO_COLORS.length],
    icon: isIcon(a.icon) ? a.icon : guess?.icon ?? "sparkles",
  };
}

/**
 * Lookup by label for task cards: tasks store the reason as text, so match on
 * the label (case/underscore-insensitive). Reasons no longer in the list
 * (renamed/archived) still get a guessed style.
 */
export function reasonStyleLookup(actions: ReasonStyleInput[]): (label: string | null) => ReasonStyle | null {
  const norm = (s: string) => prettyReason(s).toLowerCase();
  const map = new Map<string, ReasonStyle>();
  let auto = 0;
  for (const a of actions) {
    const needsAuto = !isColor(a.color) && !guessFromLabel(a.label);
    map.set(norm(a.label), reasonStyle(a, auto));
    if (needsAuto) auto++;
  }
  return (label) => {
    if (!label) return null;
    return map.get(norm(label)) ?? reasonStyle({ label }, auto);
  };
}
