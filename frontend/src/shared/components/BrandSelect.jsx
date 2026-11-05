import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import axiosInstance from "@core/api/axios";
import { cn } from "@/lib/utils";

/**
 * Brand picker for the product form: pick from the brand list (search as you
 * type), "Unbranded", or "+ Add new brand". A new brand that looks like an
 * existing one asks "Did you mean ...?" first. A seller's new brand is
 * "pending" until the admin confirms it (the product can still be saved).
 *
 * value / onChange: the brand name (text, "" = unbranded).
 * allowUnbranded=false (sellers): no blank brand; "Unbranded / not in list"
 * asks for a name, which goes to the admin for approval.
 */
export default function BrandSelect({ value, onChange, className, buttonClassName, allowUnbranded = true }) {
  const [open, setOpen] = useState(false);
  const [requesting, setRequesting] = useState(false); // seller typing a name for the admin
  const [brands, setBrands] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggest, setSuggest] = useState(null); // { name, suggestions: [...] }
  const wrap = useRef(null);

  const load = () =>
    axiosInstance
      .get("/brands")
      .then((r) => setBrands(r.data?.result || r.data?.results || []))
      .catch(() => {});
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const close = (e) => { if (wrap.current && !wrap.current.contains(e.target)) { setOpen(false); setSuggest(null); setRequesting(false); } };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const key = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const shown = useMemo(() => {
    const k = key(q);
    return k ? brands.filter((b) => key(b.name).includes(k)) : brands;
  }, [brands, q]);
  const exact = brands.find((b) => key(b.name) === key(q));
  const current = brands.find((b) => key(b.name) === key(value));

  const pick = (name) => {
    onChange(name);
    setOpen(false);
    setQ("");
    setSuggest(null);
    setRequesting(false);
  };

  const addNew = async (force = false) => {
    const name = q.trim();
    if (!name) return;
    setBusy(true);
    try {
      const r = await axiosInstance.post("/brands", { name, force });
      const b = r.data?.result;
      toast.success(r.data?.message || "Brand added");
      setBrands((list) => (list.some((x) => x._id === b._id) ? list : [...list, b].sort((a, c) => a.name.localeCompare(c.name))));
      pick(b.name);
    } catch (err) {
      const suggestions = err.response?.status === 409 ? err.response?.data?.result?.suggestions : null;
      if (suggestions?.length) setSuggest({ name, suggestions });
      else toast.error(err.response?.data?.message || "Could not add the brand");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={wrap} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md px-4 py-2.5 text-left text-sm font-semibold outline-none ring-primary/5 focus:ring-2",
          buttonClassName || "bg-slate-100",
        )}
      >
        <span className={cn("truncate", !value && "text-slate-400")}>
          {value || (allowUnbranded ? "Unbranded / choose a brand" : "Choose a brand")}
          {current?.status === "pending" && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">pending</span>}
        </span>
        <ChevronDown size={16} className="shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5">
            <Search size={14} className="text-slate-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setSuggest(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (exact) pick(exact.name);
                  else if (shown.length === 1) pick(shown[0].name);
                  else if (q.trim()) addNew();
                }
              }}
              placeholder="Search brand"
              className="h-9 w-full bg-transparent text-sm outline-none"
            />
            {q && <button type="button" onClick={() => setQ("")} aria-label="Clear"><X size={14} className="text-slate-400" /></button>}
          </div>

          {requesting && !suggest ? (
            <div className="mt-2 space-y-2 p-1">
              <p className="text-xs font-semibold text-slate-600">Type the brand name. It will be sent to the admin for approval.</p>
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNew(false); } }}
                placeholder="e.g. Local Fresh, Gupta Special"
                maxLength={60}
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setRequesting(false)} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Back</button>
                <button type="button" disabled={busy || !q.trim()} onClick={() => addNew(false)} className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Send for approval</button>
              </div>
            </div>
          ) : suggest ? (
            <div className="mt-2 space-y-1.5 p-1 text-sm">
              <p className="font-semibold text-slate-700">Did you mean:</p>
              {suggest.suggestions.map((s) => (
                <button key={s._id} type="button" onClick={() => pick(s.name)} className="block w-full rounded-lg bg-primary/10 px-3 py-2 text-left font-bold text-primary hover:bg-primary/15">
                  {s.name}
                </button>
              ))}
              <button type="button" disabled={busy} onClick={() => addNew(true)} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-500 hover:bg-slate-50">
                No, add "{suggest.name}" as a new brand
              </button>
            </div>
          ) : (
            <div data-lenis-prevent className="mt-2 max-h-60 overflow-y-auto">
              {allowUnbranded ? (
                <button type="button" onClick={() => pick("")} className={cn("block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50", !value && "font-bold text-primary")}>
                  Unbranded
                </button>
              ) : (
                <button type="button" onClick={() => setRequesting(true)} className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-primary hover:bg-primary/5">
                  Unbranded / brand not in the list: type a name
                </button>
              )}
              {shown.map((b) => (
                <button
                  key={b._id}
                  type="button"
                  onClick={() => pick(b.name)}
                  className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50", key(b.name) === key(value) && "font-bold text-primary")}
                >
                  {b.name}
                  {b.status === "pending" && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">pending</span>}
                </button>
              ))}
              {!shown.length && q && <p className="px-3 py-2 text-xs text-slate-400">No brand called "{q}".</p>}
            </div>
          )}

          {!suggest && !requesting && q.trim() && !exact && (
            <button
              type="button"
              disabled={busy}
              onClick={() => addNew(false)}
              className="mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-primary/40 px-3 py-2 text-left text-sm font-bold text-primary hover:bg-primary/5 disabled:opacity-50"
            >
              <Plus size={14} /> Add new brand "{q.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}
