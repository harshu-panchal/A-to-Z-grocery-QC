import { useEffect, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { adminApi } from "../services/adminApi";

const FIELD =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20";

const toList = (data) => {
  const raw = data?.result;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(raw?.items)) return raw.items;
  return Array.isArray(raw) ? raw : [];
};

/** Pick specific products by searching their name. `value` is a list of ids. */
const ProductMultiPicker = ({ value = [], onChange }) => {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  // Names for already-chosen ids (e.g. when editing a saved section).
  const selected = useQueries({
    queries: value.map((id) => ({
      queryKey: ["admin", "bannerLinkProduct", id],
      queryFn: async () => {
        const res = await adminApi.getProductById(id);
        return res.data?.result || null;
      },
      staleTime: 5 * 60 * 1000,
    })),
  });

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["admin", "bannerLinkProductSearch", debounced],
    queryFn: async () => toList((await adminApi.getProducts({ search: debounced, limit: 10 })).data),
    enabled: debounced.length >= 2,
  });

  const add = (id) => {
    if (!value.includes(id)) onChange([...value, id]);
    setTerm("");
  };
  const remove = (id) => onChange(value.filter((v) => v !== id));

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((id, i) => (
            <span
              key={id}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary bg-primary/5 px-3 py-1 text-[11px] font-bold text-slate-700"
            >
              <span className="truncate">
                {selected[i]?.data?.name || (selected[i]?.isLoading ? "Loading…" : "Unavailable product")}
              </span>
              <button type="button" onClick={() => remove(id)} className="text-slate-400 hover:text-danger" aria-label="Remove">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        className={FIELD}
        placeholder="Search product by name to add…"
      />
      {debounced.length >= 2 && (
        <div className="max-h-48 overflow-y-auto rounded-md border border-slate-100 bg-white">
          {isFetching && <p className="px-3 py-2 text-xs text-slate-400">Searching…</p>}
          {!isFetching && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400">No products found</p>
          )}
          {results.map((p) => (
            <button
              key={p._id}
              type="button"
              disabled={value.includes(p._id)}
              onClick={() => add(p._id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold hover:bg-slate-50 disabled:opacity-40"
            >
              {p.mainImage && <img src={p.mainImage} alt="" className="h-7 w-7 rounded object-cover" />}
              <span className="truncate">{p.name}</span>
              {value.includes(p._id) && <span className="ml-auto text-[10px] text-slate-400">Added</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductMultiPicker;
