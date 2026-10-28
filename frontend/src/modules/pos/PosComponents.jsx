import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import axiosInstance from "@core/api/axios";
import Modal from "@shared/components/ui/Modal";
import Button from "@shared/components/ui/Button";
import { cn } from "@/lib/utils";
import { makePosApi, apiError } from "./posApi";
import { rupees, WALK_IN } from "./posUtils";

export const usePosApi = (portal) => useMemo(() => makePosApi(portal), [portal]);

// --------------------------------------------------------------- settings
const settingsCache = {};
/** Bill + barcode settings for receipts/labels (cached per portal). */
export function usePosSettings(api) {
  const [settings, setSettings] = useState(settingsCache[api.portal] || { bill: {}, barcode: {} });
  useEffect(() => {
    let alive = true;
    api.getSettings().then((s) => {
      settingsCache[api.portal] = s;
      if (alive) setSettings(s);
    }).catch(() => {});
    return () => { alive = false; };
  }, [api]);
  const update = (next) => {
    settingsCache[api.portal] = next;
    setSettings(next);
  };
  return [settings, update];
}

// ---------------------------------------------------------- input styling
export const inputCls =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50";
export const labelCls = "mb-1 block text-xs font-semibold text-slate-600";

export function Field({ label, children, className }) {
  return (
    <label className={cn("block", className)}>
      {label && <span className={labelCls}>{label}</span>}
      {children}
    </label>
  );
}

// ------------------------------------------------------- barcode scanning
/**
 * USB/Bluetooth scanners type the code very fast and press Enter. Capture
 * that anywhere on the page except while the user types in a field.
 */
export function useBarcodeWedge(onScan, enabled = true) {
  const buf = useRef({ text: "", last: 0 });
  const cb = useRef(onScan);
  useEffect(() => { cb.current = onScan; }, [onScan]);
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;
      const now = Date.now();
      if (now - buf.current.last > 60) buf.current.text = "";
      buf.current.last = now;
      if (e.key === "Enter") {
        const code = buf.current.text;
        buf.current.text = "";
        if (code.length >= 3) {
          e.preventDefault();
          cb.current(code);
        }
      } else if (e.key.length === 1) {
        buf.current.text += e.key;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/** Camera scanner (phone/laptop camera) using html5-qrcode. */
export function BarcodeScannerModal({ isOpen, onClose, onDetected }) {
  const [error, setError] = useState("");
  const regionId = "pos-scanner-region";
  useEffect(() => {
    if (!isOpen) return undefined;
    let scanner;
    let stopped = false;
    setError("");
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (stopped) return;
        scanner = new Html5Qrcode(regionId, { verbose: false });
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 140 } },
          (text) => {
            if (stopped) return;
            stopped = true;
            onDetected(text);
            onClose();
          },
          () => {},
        );
      } catch (e) {
        setError(e?.message?.includes("Permission") ? "Camera permission was denied." : "Could not start the camera on this device.");
      }
    })();
    return () => {
      stopped = true;
      if (scanner?.isScanning) scanner.stop().catch(() => {});
    };
  }, [isOpen, onClose, onDetected]);
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Scan barcode" size="sm">
      <div id={regionId} className="min-h-[220px] overflow-hidden rounded-xl bg-slate-900" />
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : <p className="mt-3 text-xs text-slate-500">Point the camera at the barcode.</p>}
    </Modal>
  );
}

// ------------------------------------------------------- customer picker
export function CustomerFormModal({ api, isOpen, onClose, onSaved, initial }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", gstin: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (isOpen) setForm({ name: "", phone: "", email: "", address: "", gstin: "", ...(initial || {}) });
  }, [isOpen, initial]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    if (form.phone && !/^\d{10}$/.test(form.phone)) return toast.error("Phone must be 10 digits");
    setSaving(true);
    try {
      const saved = initial?._id ? await api.updateCustomer(initial._id, form) : await api.createCustomer(form);
      toast.success(initial?._id ? "Customer updated" : "Customer added");
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initial?._id ? "Edit customer" : "New customer"}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} isLoading={saving}>Save</Button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name *"><input className={inputCls} value={form.name} onChange={set("name")} autoFocus /></Field>
        <Field label="Phone"><input className={inputCls} inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "") }))} /></Field>
        <Field label="Email"><input className={inputCls} value={form.email} onChange={set("email")} /></Field>
        <Field label="GSTIN"><input className={inputCls} value={form.gstin} onChange={set("gstin")} /></Field>
        <Field label="Address" className="sm:col-span-2"><input className={inputCls} value={form.address} onChange={set("address")} /></Field>
      </div>
    </Modal>
  );
}

/** Search-as-you-type customer selector with walk-in option. */
export function CustomerPicker({ api, value, onChange, allowWalkIn = true }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const wrap = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => {
      api.customers({ search: query, limit: 8 }).then((r) => setResults(r.items || [])).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query, open, api]);

  useEffect(() => {
    const close = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const label = value && value._id !== WALK_IN ? `${value.name}${value.phone ? ` · ${value.phone}` : ""}` : "Walk-in customer";
  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm hover:border-slate-300"
      >
        <span className="truncate font-medium text-slate-800">{label}</span>
        {value && value._id !== WALK_IN && Number(value.creditBalance) !== 0 && (
          <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold", value.creditBalance > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700")}>
            {value.creditBalance > 0 ? `Due ${rupees(value.creditBalance)}` : `Adv ${rupees(-value.creditBalance)}`}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <input className={inputCls} placeholder="Search name or phone" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          <div data-lenis-prevent className="mt-2 max-h-64 overflow-auto">
            {allowWalkIn && (
              <button type="button" className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { onChange({ _id: WALK_IN, name: "Walk-in customer" }); setOpen(false); }}>
                Walk-in customer
              </button>
            )}
            {results.map((c) => (
              <button key={c._id} type="button" className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { onChange(c); setOpen(false); }}>
                <span><span className="font-medium text-slate-800">{c.name}</span>{c.phone && <span className="text-slate-500"> · {c.phone}</span>}</span>
                {Number(c.creditBalance) > 0 && <span className="text-xs font-semibold text-red-600">Due {rupees(c.creditBalance)}</span>}
              </button>
            ))}
            {!results.length && query && <p className="px-2 py-2 text-xs text-slate-500">No customer found.</p>}
          </div>
          <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={() => { setAdding(true); setOpen(false); }}>+ New customer</Button>
        </div>
      )}
      <CustomerFormModal api={api} isOpen={adding} onClose={() => setAdding(false)} onSaved={onChange} initial={/^\d{10}$/.test(query) ? { phone: query } : query ? { name: query } : undefined} />
    </div>
  );
}

// ------------------------------------------------------------ quick add
/**
 * Add an item that isn't in the catalogue: either just on this bill, or
 * saved as a real product (needs a category; admin also picks the store).
 */
export function QuickAddModal({ api, isOpen, onClose, onAdd, initialBarcode = "", sellers = [], saveOnly = false }) {
  const empty = { name: "", barcode: "", mrp: "", price: "", purchaseRate: "", wholesalePrice: "", stock: "", hsnCode: "", gstRate: "", unit: "", categoryId: "", sellerId: "", save: false };
  const [form, setForm] = useState(empty);
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    setForm({ ...empty, barcode: initialBarcode, save: saveOnly });
    if (!categories.length) {
      axiosInstance.get("/categories").then((r) => {
        const list = r.data?.results || r.data?.result || [];
        const headers = Object.fromEntries(list.filter((c) => c.type === "header").map((c) => [c._id, c.name]));
        setCategories(list.filter((c) => c.type === "category").map((c) => ({ _id: c._id, name: `${headers[c.parentId?._id || c.parentId] || ""} › ${c.name}` })).sort((a, b) => a.name.localeCompare(b.name)));
      }).catch(() => {});
    }
  }, [isOpen, initialBarcode]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async () => {
    const price = Number(form.price || form.mrp);
    if (!form.name.trim()) return toast.error("Item name is required");
    if (!(price > 0)) return toast.error("Enter the selling price");
    if (!form.save) {
      onAdd({
        productId: null, name: form.name.trim(), barcode: form.barcode, price, mrp: Number(form.mrp) || price,
        wholesalePrice: Number(form.wholesalePrice) || 0, purchaseRate: Number(form.purchaseRate) || 0,
        hsnCode: form.hsnCode, gstRate: Number(form.gstRate) || 0, variantName: form.unit, stock: null,
      });
      return onClose();
    }
    if (!form.categoryId) return toast.error("Pick a category to save the product");
    if (api.portal === "admin" && !form.sellerId) return toast.error("Pick the store this product belongs to");
    setSaving(true);
    try {
      const row = await api.quickAddProduct({ ...form, price, mrp: Number(form.mrp) || price });
      toast.success("Product saved to inventory");
      onAdd(row);
      onClose();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={saveOnly ? "New product" : "Quick add item"}
      size="lg"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} isLoading={saving}>{saveOnly ? "Save product" : form.save ? "Save product & add" : "Add to bill"}</Button></>}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Item name *" className="sm:col-span-2"><input className={inputCls} value={form.name} onChange={set("name")} autoFocus /></Field>
        <Field label="Barcode"><input className={inputCls} value={form.barcode} onChange={set("barcode")} /></Field>
        <Field label="MRP"><input className={inputCls} type="number" min="0" value={form.mrp} onChange={set("mrp")} /></Field>
        <Field label="Selling price *"><input className={inputCls} type="number" min="0" value={form.price} onChange={set("price")} /></Field>
        <Field label="Wholesale price"><input className={inputCls} type="number" min="0" value={form.wholesalePrice} onChange={set("wholesalePrice")} /></Field>
        <Field label="Purchase price"><input className={inputCls} type="number" min="0" value={form.purchaseRate} onChange={set("purchaseRate")} /></Field>
        <Field label="HSN code"><input className={inputCls} value={form.hsnCode} onChange={set("hsnCode")} /></Field>
        <Field label="GST %">
          <select className={inputCls} value={form.gstRate} onChange={set("gstRate")}>
            {["", "0", "5", "12", "18", "28"].map((g) => <option key={g} value={g}>{g === "" ? "No GST" : `${g}%`}</option>)}
          </select>
        </Field>
        <Field label="Unit / size"><input className={inputCls} placeholder="1 kg, 500 ml…" value={form.unit} onChange={set("unit")} /></Field>
      </div>
      {!saveOnly && (
        <label className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={form.save} onChange={set("save")} /> Also save as a product in inventory
        </label>
      )}
      {form.save && (
        <div className="mt-3 grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-3">
          <Field label="Category *" className="sm:col-span-2">
            <select className={inputCls} value={form.categoryId} onChange={set("categoryId")}>
              <option value="">Select category</option>
              {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </Field>
          {!saveOnly && <Field label="Opening stock"><input className={inputCls} type="number" min="0" value={form.stock} onChange={set("stock")} /></Field>}
          {api.portal === "admin" && (
            <Field label="Store (seller) *" className="sm:col-span-3">
              <select className={inputCls} value={form.sellerId} onChange={set("sellerId")}>
                <option value="">Select store</option>
                {sellers.map((s) => <option key={s._id} value={s._id}>{s.shopName || s.name}</option>)}
              </select>
            </Field>
          )}
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------ misc bits
export function StatTile({ label, value, sub, tone = "slate" }) {
  const tones = { slate: "text-slate-900", green: "text-emerald-700", red: "text-red-600", amber: "text-amber-600" };
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", tones[tone])}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function Pager({ page, totalPages, onPage }) {
  if (!totalPages || totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 p-3 text-sm">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</Button>
      <span className="text-slate-600">Page {page} of {totalPages}</span>
      <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</Button>
    </div>
  );
}

/** Small amount entry dialog (payments, dues, supplier bills). */
export function AmountModal({ isOpen, onClose, title, onSubmit, methods, showDate = false, submitLabel = "Save", hint, preview }) {
  const [form, setForm] = useState({ amount: "", method: methods?.[0] || "", note: "", reference: "", date: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (isOpen) setForm({ amount: "", method: methods?.[0] || "", note: "", reference: "", date: "" }); }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async () => {
    if (!(Number(form.amount) > 0)) return toast.error("Enter an amount");
    setBusy(true);
    try {
      await onSubmit({ ...form, amount: Number(form.amount) });
      onClose();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} isLoading={busy}>{submitLabel}</Button></>}>
      <div className="space-y-3">
        {hint && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{hint}</p>}
        <Field label="Amount (₹)"><input className={inputCls} type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} autoFocus /></Field>
        {preview && preview(Number(form.amount) || 0)}
        {methods?.length > 0 && (
          <Field label="Paid by">
            <select className={inputCls} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              {methods.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
        )}
        {showDate && <Field label="Date"><input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>}
        <Field label="Reference / bill no."><input className={inputCls} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
        <Field label="Note"><input className={inputCls} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
