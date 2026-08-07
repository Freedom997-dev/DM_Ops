"use client";

import clsx from "clsx";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import type { ItemSearch } from "@/components/useItemSearch";

/**
 * Sticky "find on page" bar for the inspection form. Pins just under the app
 * header (which is `sticky top-0`, ~60px tall). Driven entirely by useItemSearch.
 */
export function InspectSearchBar({ search }: { search: ItemSearch }) {
  const { query, setQuery, total, activeIndex, next, prev, clear } = search;
  const hasQuery = query.trim().length > 0;
  const noMatches = hasQuery && total === 0;

  return (
    <div className="sticky top-[60px] z-20 -mx-4 border-y border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur">
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) prev();
              else next();
            } else if (e.key === "Escape") {
              e.preventDefault();
              clear();
            }
          }}
          placeholder="Search items…"
          aria-label="Search checklist items"
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />

        {hasQuery && (
          <>
            <span
              className={clsx(
                "shrink-0 text-xs font-medium tabular-nums",
                noMatches ? "text-slate-400" : "text-slate-500",
              )}
            >
              {total === 0 ? "0 / 0" : `${activeIndex + 1} / ${total}`}
            </span>
            <div className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={prev}
                disabled={total === 0}
                aria-label="Previous match"
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={next}
                disabled={total === 0}
                aria-label="Next match"
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={clear}
              aria-label="Clear search"
              className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
