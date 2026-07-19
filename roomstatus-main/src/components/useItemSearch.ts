import { useCallback, useEffect, useMemo, useState } from "react";

export type ItemSearch = {
  query: string;
  setQuery: (q: string) => void;
  /** Matching item ids, in document order. */
  matchIds: string[];
  /** Same ids as a Set for O(1) row lookup during render. */
  matchSet: Set<string>;
  /** The currently focused match id, or null when there are none. */
  activeId: string | null;
  /** 0-based index of activeId within matchIds, or -1 when empty. */
  activeIndex: number;
  total: number;
  next: () => void;
  prev: () => void;
  clear: () => void;
};

/**
 * "Find on page" search over a flat, ordered list of items. Case-insensitive
 * substring match on `text`. Pure data — no DOM access — so the consumer owns
 * scrolling/highlighting. See InspectForm for the scroll wiring.
 */
export function useItemSearch(items: { id: string; text: string }[]): ItemSearch {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const matchIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items.filter((it) => it.text.toLowerCase().includes(q)).map((it) => it.id);
  }, [items, query]);

  const matchSet = useMemo(() => new Set(matchIds), [matchIds]);

  // A new query starts the cursor back at the first match.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const total = matchIds.length;
  // Clamp in case matches shrank without a query change (defensive).
  const safeIndex = total === 0 ? -1 : Math.min(activeIndex, total - 1);
  const activeId = safeIndex >= 0 ? matchIds[safeIndex] : null;

  const next = useCallback(() => {
    setActiveIndex((i) => {
      if (total === 0) return 0;
      return (Math.min(i, total - 1) + 1) % total;
    });
  }, [total]);

  const prev = useCallback(() => {
    setActiveIndex((i) => {
      if (total === 0) return 0;
      const cur = Math.min(i, total - 1);
      return (cur - 1 + total) % total;
    });
  }, [total]);

  const clear = useCallback(() => {
    setQuery("");
    setActiveIndex(0);
  }, []);

  return {
    query,
    setQuery,
    matchIds,
    matchSet,
    activeId,
    activeIndex: safeIndex,
    total,
    next,
    prev,
    clear,
  };
}
