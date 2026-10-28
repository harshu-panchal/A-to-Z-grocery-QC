import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const LEVELS = [
  { id: "", label: "None" },
  { id: "view", label: "View" },
  { id: "edit", label: "Edit" },
];

const Segmented = ({ value, onChange, label }) => (
  <div role="group" aria-label={label} className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
    {LEVELS.map((l) => (
      <button
        key={l.id || "none"}
        type="button"
        aria-pressed={value === l.id}
        onClick={() => onChange(l.id)}
        className={cn(
          "rounded-md px-2.5 py-1 text-[11px] font-bold transition-all",
          value === l.id
            ? l.id === "edit"
              ? "bg-primary text-white shadow-sm"
              : l.id === "view"
                ? "bg-white text-slate-800 shadow-sm"
                : "bg-white text-slate-400 shadow-sm"
            : "text-slate-400 hover:text-slate-600",
        )}
      >
        {l.label}
      </button>
    ))}
  </div>
);

/**
 * Tick what a staff member can open. Every module expands into its
 * sub-modules; each sub-module is None / View / Edit. Risky single actions
 * (cancel a bill, see cost price...) are plain on/off switches.
 *
 * value: { "orders.orders": "edit", "pos.cancel": "edit" }
 */
const PermissionPicker = ({ modules = [], value = {}, onChange }) => {
  const hasAny = (m) => m.subs.some((s) => value[s.key]);
  const [open, setOpen] = useState(() => new Set(modules.filter(hasAny).map((m) => m.key)));

  const toggleOpen = (key) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const setLevel = (key, level) => {
    const next = { ...value };
    if (level) next[key] = level;
    else delete next[key];
    onChange(next);
  };

  const setModuleLevel = (module, level) => {
    const next = { ...value };
    for (const s of module.subs.filter((x) => !x.special)) {
      if (level) next[s.key] = level;
      else delete next[s.key];
    }
    onChange(next);
    if (level) setOpen((prev) => new Set(prev).add(module.key));
  };

  const grantedSections = modules.reduce((n, m) => n + m.subs.filter((s) => !s.special && value[s.key]).length, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
        <span>{grantedSections === 0 ? "Nothing selected yet" : `${grantedSections} section${grantedSections === 1 ? "" : "s"} selected`}</span>
        <span className="space-x-3">
          <button type="button" className="hover:text-primary" onClick={() => setOpen(new Set(modules.map((m) => m.key)))}>Expand all</button>
          <button type="button" className="hover:text-primary" onClick={() => setOpen(new Set())}>Collapse all</button>
        </span>
      </div>

      {modules.map((m) => {
        const normal = m.subs.filter((s) => !s.special);
        const specials = m.subs.filter((s) => s.special);
        const levels = new Set(normal.map((s) => value[s.key] || ""));
        const moduleLevel = levels.size === 1 ? [...levels][0] : "mixed";
        const count = normal.filter((s) => value[s.key]).length;
        const isOpen = open.has(m.key);
        const onlyOne = normal.length === 1 && specials.length === 0;

        return (
          <div key={m.key} className={cn("rounded-xl border bg-white", count ? "border-primary/40" : "border-slate-200")}>
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
              <button
                type="button"
                onClick={() => !onlyOne && toggleOpen(m.key)}
                aria-expanded={isOpen}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                {onlyOne ? <span className="w-4" /> : isOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                <span className="truncate text-sm font-bold text-slate-800">{m.label}</span>
                {count > 0 && !onlyOne && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {count}/{normal.length}
                  </span>
                )}
              </button>
              <div className="flex items-center gap-2">
                {moduleLevel === "mixed" && <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Mixed</span>}
                <Segmented
                  label={`${m.label}: all sections`}
                  value={moduleLevel === "mixed" ? "__mixed__" : moduleLevel}
                  onChange={(lvl) => setModuleLevel(m, lvl)}
                />
              </div>
            </div>

            {isOpen && !onlyOne && (
              <div className="space-y-1 border-t border-slate-100 px-3 py-2">
                {normal.map((s) => (
                  <div key={s.key} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-700">{s.label}</p>
                      {s.hint && <p className="truncate text-[10px] text-slate-400">{s.hint}</p>}
                    </div>
                    <Segmented label={s.label} value={value[s.key] || ""} onChange={(lvl) => setLevel(s.key, lvl)} />
                  </div>
                ))}
                {specials.length > 0 && (
                  <div className="mt-1 space-y-1 border-t border-dashed border-slate-200 pt-2">
                    <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Extra permissions</p>
                    {specials.map((s) => (
                      <label key={s.key} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={Boolean(value[s.key])}
                          onChange={(e) => setLevel(s.key, e.target.checked ? "edit" : "")}
                        />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-slate-700">{s.label}</span>
                          {s.hint && <span className="block text-[10px] text-slate-400">{s.hint}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {onlyOne === false && !isOpen && specials.length > 0 && specials.some((s) => value[s.key]) && (
              <p className="border-t border-slate-100 px-3 py-1.5 text-[10px] font-semibold text-amber-600">
                Includes: {specials.filter((s) => value[s.key]).map((s) => s.label).join(", ")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PermissionPicker;
