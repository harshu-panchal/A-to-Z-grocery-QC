import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import Button from "@shared/components/ui/Button";

const KINDS = [
  { id: "", label: "Everything" },
  { id: "action", label: "Things they did" },
  { id: "login", label: "Logins" },
  { id: "login_failed", label: "Failed logins" },
  { id: "blocked", label: "Blocked attempts" },
];

const KIND_STYLE = {
  action: "bg-primary/10 text-primary",
  login: "bg-emerald-50 text-emerald-700",
  logout: "bg-slate-100 text-slate-500",
  login_failed: "bg-amber-50 text-amber-700",
  blocked: "bg-red-50 text-red-600",
};
const KIND_LABEL = { action: "Action", login: "Login", logout: "Logout", login_failed: "Failed login", blocked: "Blocked" };

const money = (n) => (n === null || n === undefined ? "" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const when = (iso) =>
  new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });

const field = "h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

/** What staff did: who, what and when, with filters. */
const ActivityLog = ({ api, portal, members }) => {
  const [filters, setFilters] = useState({ staffId: "", kind: "", from: "", to: "", q: "" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Search as they type, without a request per key press.
  useEffect(() => {
    const t = setTimeout(() => { setFilters((f) => ({ ...f, q: search.trim() })); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const params = useMemo(() => {
    const p = { page, limit: 25 };
    Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v; });
    return p;
  }, [filters, page]);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["staff", portal, "activity", params],
    queryFn: async () => (await api.activity(params)).data.result,
    placeholderData: (prev) => prev,
    refetchInterval: 30000,
  });

  const set = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const items = data?.items || [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Staff member" className={field} value={filters.staffId} onChange={(e) => set({ staffId: e.target.value })}>
          <option value="">All staff</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select aria-label="Type of activity" className={field} value={filters.kind} onChange={(e) => set({ kind: e.target.value })}>
          {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <input aria-label="From date" type="date" className={field} value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} />
        <span className="text-xs text-slate-400">to</span>
        <input aria-label="To date" type="date" className={field} value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} />
        <input aria-label="Search" className={cn(field, "min-w-[160px] flex-1")} placeholder="Search action, bill number, name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {(filters.staffId || filters.kind || filters.from || filters.to || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilters({ staffId: "", kind: "", from: "", to: "", q: "" }); setSearch(""); setPage(1); }}>
            Clear
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-slate-400">Loading activity…</p>
        ) : isError ? (
          <p className="p-8 text-center text-sm text-red-500">Could not load the activity log.</p>
        ) : items.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">
            {Object.values(filters).some(Boolean) ? "Nothing matches these filters." : "No activity yet. What your staff do will show up here."}
          </p>
        ) : (
          <ul className={cn("divide-y divide-slate-100", isFetching && "opacity-70")}>
            {items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", KIND_STYLE[a.kind] || KIND_STYLE.action)}>
                  {KIND_LABEL[a.kind] || "Action"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800">
                    <span className="font-bold">{a.staffName}</span>
                    {a.jobTitle && <span className="text-slate-400"> · {a.jobTitle}</span>}
                    <span className="text-slate-600"> — {a.action}</span>
                    {a.detail && <span className="font-semibold text-slate-800"> {a.detail}</span>}
                    {a.amount !== null && a.amount !== undefined && <span className="font-semibold text-emerald-700"> · {money(a.amount)}</span>}
                  </p>
                </div>
                <time className="shrink-0 text-xs text-slate-400" dateTime={a.createdAt}>{when(a.createdAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
          <span>{data.total.toLocaleString("en-IN")} entries · page {data.page} of {data.pages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /> Newer</Button>
            <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Older <ChevronRight size={14} /></Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityLog;
