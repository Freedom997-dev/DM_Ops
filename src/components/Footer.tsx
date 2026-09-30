/**
 * Formal site footer. Shown on every route (app pages + login) via the root
 * layout's sticky-footer wrapper. Left: product name. Right: firm.
 */
export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-1 px-4 py-4 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
        <p className="text-xs text-slate-400">Divya Motel · Room Condition Program</p>
        <p className="text-xs text-slate-400">
          Powered by <span className="font-semibold text-slate-600">FCG Solutions</span>
        </p>
      </div>
    </footer>
  );
}
