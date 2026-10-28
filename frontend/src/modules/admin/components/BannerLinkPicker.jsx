import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../services/adminApi";

const FIELD =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20";

const toList = (data) => {
  const raw = data?.result;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(raw?.items)) return raw.items;
  return Array.isArray(raw) ? raw : [];
};

/**
 * Where a banner opens when tapped. Saves ids (never hand-typed slugs), which
 * is what the storefront's /category/:id and /product/:id pages resolve.
 */
const BannerLinkPicker = ({ linkType = "none", linkValue = "", onChange }) => {
  const set = (changes) => onChange({ linkType, linkValue, ...changes });

  const { data: tree = [] } = useQuery({
    queryKey: ["admin", "bannerLinkTree"],
    queryFn: async () => {
      const res = await adminApi.getCategoryTree();
      const list = res.data?.results || res.data?.result || [];
      return Array.isArray(list) ? list : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const options = useMemo(() => {
    if (linkType === "header") return tree.map((h) => ({ id: h._id, label: h.name }));
    if (linkType === "category") {
      return tree.flatMap((h) => (h.children || []).map((c) => ({ id: c._id, label: `${c.name} (${h.name})` })));
    }
    if (linkType === "subcategory") {
      return tree.flatMap((h) =>
        (h.children || []).flatMap((c) =>
          (c.children || []).map((s) => ({ id: s._id, label: `${s.name} (${c.name})` })),
        ),
      );
    }
    return [];
  }, [tree, linkType]);

  return (
    <div className="space-y-2">
      <select
        value={linkType}
        onChange={(e) => set({ linkType: e.target.value, linkValue: "" })}
        className={FIELD}
      >
        <option value="none">No link</option>
        <option value="product">Product</option>
        <option value="category">Category</option>
        <option value="subcategory">Subcategory</option>
        <option value="header">Header</option>
        <option value="url">Web address (URL)</option>
      </select>

      {["header", "category", "subcategory"].includes(linkType) && (
        <select value={linkValue} onChange={(e) => set({ linkValue: e.target.value })} className={FIELD}>
          <option value="">Select {linkType}…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      )}

      {linkType === "product" && (
        <ProductSearch value={linkValue} onSelect={(id) => set({ linkValue: id })} />
      )}

      {linkType === "url" && (
        <input
          value={linkValue}
          onChange={(e) => set({ linkValue: e.target.value })}
          className={FIELD}
          placeholder="https://… or /offers"
        />
      )}
    </div>
  );
};

const ProductSearch = ({ value, onSelect }) => {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  const { data: selected } = useQuery({
    queryKey: ["admin", "bannerLinkProduct", value],
    queryFn: async () => {
      const res = await adminApi.getProductById(value);
      return res.data?.result || res.data?.product || null;
    },
    enabled: Boolean(value),
    staleTime: 5 * 60 * 1000,
  });

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["admin", "bannerLinkProductSearch", debounced],
    queryFn: async () => toList((await adminApi.getProducts({ search: debounced, limit: 10 })).data),
    enabled: debounced.length >= 2,
  });

  return (
    <div className="space-y-1.5">
      {value && (
        <div className="flex items-center justify-between rounded-md bg-primary/5 px-3 py-2 text-xs font-bold text-slate-700">
          <span className="truncate">{selected?.name || "Selected product"}</span>
          <button type="button" onClick={() => onSelect("")} className="ml-2 text-slate-400 hover:text-danger">
            Clear
          </button>
        </div>
      )}
      <input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        className={FIELD}
        placeholder={value ? "Search to change product…" : "Search product by name…"}
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
              onClick={() => { onSelect(p._id); setTerm(""); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold hover:bg-slate-50"
            >
              {p.mainImage && <img src={p.mainImage} alt="" className="h-7 w-7 rounded object-cover" />}
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default BannerLinkPicker;
