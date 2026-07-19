import { Fragment } from "react";

/**
 * Renders `text` with every case-insensitive occurrence of `query` wrapped in
 * a <mark>. Empty/whitespace query (or no match) renders the plain text.
 */
export function HighlightedText({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;

  const lower = text.toLowerCase();
  const ql = q.toLowerCase();

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let idx = lower.indexOf(ql, cursor);
  if (idx === -1) return <>{text}</>;

  let key = 0;
  while (idx !== -1) {
    if (idx > cursor) parts.push(<Fragment key={key++}>{text.slice(cursor, idx)}</Fragment>);
    parts.push(
      <mark key={key++} className="rounded bg-yellow-200 px-0.5 text-slate-900">
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    cursor = idx + q.length;
    idx = lower.indexOf(ql, cursor);
  }
  if (cursor < text.length) parts.push(<Fragment key={key++}>{text.slice(cursor)}</Fragment>);

  return <>{parts}</>;
}
