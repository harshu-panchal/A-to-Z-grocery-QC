import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2, Barcode, FileText, ArrowRightCircle, ScanLine } from "lucide-react";
import PageHeader from "@shared/components/ui/PageHeader";
import Button from "@shared/components/ui/Button";
import Badge from "@shared/components/ui/Badge";
import { cn } from "@/lib/utils";
import { apiError } from "../posApi";
import { rupees, round2, fmtDate, todayLocal, WALK_IN } from "../posUtils";
import { printBarcodeLabels, downloadTablePdf } from "../posPrint";
import { usePosApi, usePosSettings, Pager, inputCls, labelCls, Field, CustomerPicker, useBarcodeWedge, BarcodeScannerModal, QuickAddModal } from "../PosComponents";
import { IconBtn } from "./PosReport";
import { SupplierFormModal } from "./PosParties";
import useBodyScrollLock from "@core/hooks/useBodyScrollLock";

// Full seller Add Product form, loaded only when "+ New product" is used.
const AddProduct = lazy(() => import("../../seller/pages/AddProduct"));

// ===================================================================== list
export function PosEntries({ portal, type }) {
  const api = usePosApi(portal);
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ status: "all", search: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], totalPages: 1 });
  const load = useCallback(() => api.entries({ type, ...filters, page, limit: 25 }).then(setData).catch((e) => toast.error(apiError(e))), [api, type, filters, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const setF = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })); };
  const isPurchase = type === "purchase";
  const remove = async (e, entry) => {
    e.stopPropagation();
    if (!window.confirm(`Delete ${entry.number}?`)) return;
    try { await api.deleteEntry(entry._id); toast.success("Deleted"); load(); } catch (err) { toast.error(apiError(err)); }
  };
  return (
    <div className="space-y-4">
      <PageHeader
        title={isPurchase ? "Purchase entries" : "Quotations"}
        description={isPurchase ? "Stock bought from suppliers. Completing an entry adds the stock." : "Price quotes for customers; convert one into a bill when they buy."}
        actions={<Button onClick={() => navigate(`/${portal}/pos/purchases/new?type=${type}`)}><Plus size={16} className="mr-1" /> {isPurchase ? "New purchase" : "New quotation"}</Button>}
      />
      <div className="grid gap-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm sm:grid-cols-4">
        <Field label="Status">
          <select className={inputCls} value={filters.status} onChange={setF("status")}>
            <option value="all">All</option><option value="draft">Draft</option>
            {isPurchase ? <option value="completed">Completed</option> : <option value="converted">Converted to bill</option>}
          </select>
        </Field>
        <Field label="From"><input type="date" className={inputCls} value={filters.from} onChange={setF("from")} /></Field>
        <Field label="To"><input type="date" className={inputCls} value={filters.to} onChange={setF("to")} /></Field>
        <Field label="Search"><input className={inputCls} placeholder="Number, party, bill no." value={filters.search} onChange={setF("search")} /></Field>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="p-3">Number</th><th className="p-3">Date</th><th className="p-3">{isPurchase ? "Supplier" : "Customer"}</th>{isPurchase && <th className="p-3">Bill no.</th>}<th className="p-3 text-right">Total</th><th className="p-3">Status</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {data.items.map((e) => (
              <tr key={e._id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => navigate(`/${portal}/pos/purchases/${e._id}`)}>
                <td className="p-3 font-semibold text-slate-800">{e.number}</td>
                <td className="p-3 text-slate-600">{fmtDate(e.date)}</td>
                <td className="p-3">{e.partyName || "-"}</td>
                {isPurchase && <td className="p-3">{e.billNo || "-"}</td>}
                <td className="p-3 text-right font-bold">{rupees(e.total)}</td>
                <td className="p-3"><Badge variant={e.status === "draft" ? "warning" : "success"}>{e.status}</Badge></td>
                <td className="p-3 text-right">{(e.status === "draft" || (!isPurchase && e.status !== "converted")) && <IconBtn danger title="Delete" onClick={(ev) => remove(ev, e)}><Trash2 size={15} /></IconBtn>}</td>
              </tr>
            ))}
            {!data.items.length && <tr><td colSpan={7} className="p-10 text-center text-slate-500">Nothing here yet.</td></tr>}
          </tbody>
        </table>
        <Pager page={page} totalPages={data.totalPages} onPage={setPage} />
      </div>
    </div>
  );
}

// =================================================================== editor
const emptyLine = (row, type) => ({
  key: `${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
  productId: row?.productId || null,
  variantSku: row?.variantSku || "",
  variantName: row?.variantName || "",
  name: row ? `${row.name}` : "",
  quantity: 1,
  ...(type === "purchase"
    ? { purchasePrice: row?.purchaseRate || 0, gstRate: row?.gstRate || 0, gstMode: "exclusive", mrp: row?.mrp || 0, sellingPrice: row?.price || 0, wholesalePrice: row?.wholesalePrice || 0, barcode: row?.barcode || "", hsnCode: row?.hsnCode || "", batch: "", expiry: "", updatePrices: false, currentStock: row?.stock }
    : { price: row?.price || 0, mrp: row?.mrp || 0, gstRate: row?.gstRate || 0, hsnCode: row?.hsnCode || "" }),
});

/** Same maths as the backend so the screen matches what gets saved. */
function calcLine(type, l) {
  const q = Number(l.quantity) || 0;
  const g = Number(l.gstRate) || 0;
  if (type === "quotation") {
    const total = round2((Number(l.price) || 0) * q);
    return { taxable: round2(total - (g ? (total * g) / (100 + g) : 0)), gst: round2(g ? (total * g) / (100 + g) : 0), total };
  }
  const gross = round2((Number(l.purchasePrice) || 0) * q);
  const inclusive = l.gstMode === "inclusive";
  const taxable = inclusive && g ? round2((gross * 100) / (100 + g)) : gross;
  const gst = round2(inclusive ? gross - taxable : (taxable * g) / 100);
  return { taxable, gst, total: round2(taxable + gst) };
}

export function PosEntryEditor({ portal }) {
  const api = usePosApi(portal);
  const [settings] = usePosSettings(api);
  const navigate = useNavigate();
  const { id } = useParams();
  const [params] = useSearchParams();
  const isNew = !id || id === "new";
  const [entry, setEntry] = useState(null);
  const [type, setType] = useState(params.get("type") === "quotation" ? "quotation" : "purchase");
  const [form, setForm] = useState({ supplierId: params.get("supplier") || "", customer: null, partyName: "", billNo: "", date: todayLocal(), paidAmount: "", payMode: "full", paymentMethod: "Cash", igst: false, supplierGstin: "", extraCharges: "", discount: "", notes: "" });
  const [lines, setLines] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [busy, setBusy] = useState(false);
  const locked = entry && entry.status !== "draft";

  const loadSuppliers = useCallback(() => api.suppliers({ limit: 200 }).then((d) => setSuppliers(d.items || [])).catch(() => {}), [api]);
  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);
  const [newSupplier, setNewSupplier] = useState(false);
  const [newProduct, setNewProduct] = useState(null); // barcode for the new-product form
  const [sellers, setSellers] = useState([]);
  useEffect(() => { if (portal === "admin") api.sellers().then(setSellers).catch(() => {}); }, [api, portal]);
  // what the picked supplier has sent before
  const [history, setHistory] = useState(null);
  const loadHistory = useCallback(() => {
    if (!form.supplierId || type !== "purchase") return setHistory(null);
    return api.getSupplier(form.supplierId).then(setHistory).catch(() => setHistory(null));
  }, [api, form.supplierId, type]);
  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => {
    if (isNew) return;
    api.getEntry(id).then((e) => {
      setEntry(e);
      setType(e.type);
      const d = e.data || {};
      setForm({
        supplierId: e.supplier?._id || "", customer: e.customer || null, partyName: e.partyName || "", billNo: e.billNo || "",
        date: (e.date || "").slice(0, 10), paidAmount: e.paidAmount || "", paymentMethod: e.paymentMethod || "Cash",
        payMode: d.payMode || (!(e.paidAmount > 0) ? "later" : e.paidAmount >= e.total ? "full" : "part"),
        igst: Boolean(d.igst), supplierGstin: d.supplierGstin || "", extraCharges: d.extraCharges || "", discount: d.discount || "", notes: d.notes || "",
      });
      setLines((d.lines || []).map((l) => ({ ...l, key: `${Math.random()}` })));
    }).catch((err) => toast.error(apiError(err)));
  }, [api, id, isNew]);

  // supplier picked -> fill party name/GSTIN
  useEffect(() => {
    const s = suppliers.find((x) => x._id === form.supplierId);
    if (s) setForm((f) => ({ ...f, partyName: s.name, supplierGstin: f.supplierGstin || s.gstin || "" }));
  }, [form.supplierId, suppliers]);

  const totals = useMemo(() => {
    const c = lines.map((l) => calcLine(type, l));
    const sub = round2(c.reduce((s, x) => s + x.total, 0));
    return {
      taxable: round2(c.reduce((s, x) => s + x.taxable, 0)),
      gst: round2(c.reduce((s, x) => s + x.gst, 0)),
      sub,
      total: round2(sub + (Number(form.extraCharges) || 0) - (Number(form.discount) || 0)),
    };
  }, [lines, type, form.extraCharges, form.discount]);

  // what is paid to the supplier with this bill
  const paidNow = type !== "purchase" || form.payMode === "later" ? 0 : form.payMode === "full" ? totals.total : round2(Number(form.paidAmount) || 0);

  // product search
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!q.trim()) return undefined;
    const t = setTimeout(() => api.searchProducts({ search: q, limit: 10 }).then(setRows).catch(() => setRows([])), 250);
    return () => clearTimeout(t);
  }, [q, api]);
  const addRow = useCallback((row) => {
    setLines((ls) => {
      const hit = ls.find((l) => l.productId && l.productId === row.productId && (l.variantSku || "") === (row.variantSku || ""));
      return hit ? ls.map((l) => (l === hit ? { ...l, quantity: Number(l.quantity || 0) + 1 } : l)) : [...ls, emptyLine(row, type)];
    });
    setQ("");
    setRows([]);
  }, [type]);

  // A product just created from the full Add Product form: add each of its
  // pack sizes as a purchase row (quantities are then edited as usual).
  const addCreatedProduct = useCallback(async (product) => {
    setNewProduct(null);
    const id = String(product?._id || "");
    if (!id) return;
    try {
      const found = await api.searchProducts({ search: product.name, limit: 50 });
      const mine = (found || []).filter((r) => String(r.productId) === id);
      if (!mine.length) {
        toast.info("Product saved. Search for it to add it to this purchase.");
        return;
      }
      mine.forEach((r) => addRow({ ...r, stock: 0 }));
      toast.success(mine.length > 1 ? `${product.name}: ${mine.length} pack sizes added` : `${product.name} added to purchase`);
    } catch {
      toast.info("Product saved. Search for it to add it to this purchase.");
    }
  }, [api, addRow]);

  // Scan to receive: each scan adds the item or bumps its quantity by 1
  const [scanOpen, setScanOpen] = useState(false);
  const onCode = async (code) => {
    if (locked) return;
    try {
      const found = await api.searchProducts({ barcode: code });
      if (found?.length === 1) {
        addRow(found[0]);
        toast.success(`${found[0].name} +1`, { id: "entry-scan" });
      } else if (found?.length > 1) {
        setQ(code);
      } else if (type === "purchase") {
        toast.info(`No product with code ${code}. Add it as a new product.`);
        setNewProduct(code);
      } else {
        toast.error(`No product with code ${code}`);
      }
    } catch (err) {
      toast.error(apiError(err));
    }
  };
  useBarcodeWedge(onCode, !locked && !scanOpen && !newSupplier && newProduct === null);
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const body = () => ({
    type,
    supplierId: form.supplierId || undefined,
    customerId: form.customer?._id && form.customer._id !== WALK_IN ? form.customer._id : undefined,
    partyName: type === "quotation" ? form.customer?.name || form.partyName : form.partyName,
    billNo: form.billNo,
    date: form.date,
    paidAmount: paidNow,
    paymentMethod: form.paymentMethod,
    data: { lines: lines.map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => k !== "key"))), igst: form.igst, payMode: form.payMode, supplierGstin: form.supplierGstin, extraCharges: Number(form.extraCharges) || 0, discount: Number(form.discount) || 0, notes: form.notes },
  });

  const save = async ({ silent } = {}) => {
    if (!lines.length) { toast.error("Add at least one item"); return null; }
    if (lines.some((l) => !l.name || !(Number(l.quantity) > 0))) { toast.error("Every line needs a name and quantity"); return null; }
    setBusy(true);
    try {
      const saved = isNew ? await api.createEntry(body()) : await api.updateEntry(id, body());
      if (!silent) toast.success("Saved");
      if (isNew) navigate(`/${portal}/pos/purchases/${saved._id}`, { replace: true });
      setEntry(saved);
      return saved;
    } catch (err) {
      toast.error(apiError(err));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    const linked = lines.filter((l) => l.productId).length;
    if (!window.confirm(`Complete this purchase? Stock will be added for ${linked} linked item(s)${form.supplierId ? " and the supplier's balance updated" : ""}. This can't be undone.`)) return;
    const saved = await save({ silent: true });
    if (!saved) return;
    setBusy(true);
    try {
      const done = await api.completePurchase(saved._id);
      setEntry(done);
      setLines((ls) => ls.map((l) => (l.productId && l.currentStock != null ? { ...l, currentStock: Number(l.currentStock) + (Number(l.quantity) || 0), stockAdded: true } : l)));
      loadHistory();
      toast.success("Purchase completed, stock added");
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const labels = () => {
    const ok = printBarcodeLabels(lines.map((l) => ({ name: l.name, barcode: l.barcode, mrp: l.mrp, price: l.sellingPrice || l.price, copies: l.quantity })), settings.barcode);
    if (!ok) toast.error("Add a barcode to the lines first");
  };

  const quotationPdf = () => downloadTablePdf({
    title: `Quotation ${entry?.number || ""}`,
    subtitle: `${form.customer?.name || form.partyName || ""} · ${form.date} · Total ${rupees(totals.total)}`,
    head: ["#", "Item", "Qty", "Rate", "GST", "Amount"],
    body: lines.map((l, i) => [i + 1, l.name, l.quantity, round2(l.price).toFixed(2), `${l.gstRate || 0}%`, calcLine("quotation", l).total.toFixed(2)]),
    fileName: `quotation-${entry?.number || "draft"}.pdf`,
  });

  const convert = async () => {
    // unsaved or draft quotations are saved first so the bill can link to them
    const saved = !entry || entry.status === "draft" ? await save({ silent: true }) : entry;
    if (saved) navigate(`/${portal}/pos?quotation=${saved._id}`);
  };

  const isPurchase = type === "purchase";
  return (
    <div className="space-y-4">
      <PageHeader
        title={isNew ? (isPurchase ? "New purchase" : "New quotation") : `${isPurchase ? "Purchase" : "Quotation"} ${entry?.number || ""}`}
        badge={entry && <Badge variant={entry.status === "draft" ? "warning" : "success"}>{entry.status}</Badge>}
        actions={<>
          {isPurchase && <Button variant="outline" onClick={labels}><Barcode size={15} className="mr-1" /> Labels</Button>}
          {!isPurchase && <Button variant="outline" onClick={quotationPdf}><FileText size={15} className="mr-1" /> PDF</Button>}
          {!locked && <Button variant="outline" onClick={() => save()} isLoading={busy}>Save draft</Button>}
          {isPurchase && !locked && <Button onClick={complete} isLoading={busy}>Complete purchase</Button>}
          {!isPurchase && entry?.status !== "converted" && <Button onClick={convert}><ArrowRightCircle size={15} className="mr-1" /> Convert to bill</Button>}
        </>}
      />
      {locked && <p className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">{isPurchase ? "This purchase is completed; stock and supplier balance were updated." : "This quotation was converted to a bill."}</p>}

      <div className="grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        {isPurchase ? (
          <>
            <Field label="Supplier">
              <div className="flex gap-2">
                <select className={inputCls} value={form.supplierId} disabled={locked} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                  <option value="">Cash purchase (no supplier account)</option>
                  {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}{s.phone ? ` · ${s.phone}` : ""}</option>)}
                </select>
                {!locked && <Button variant="outline" onClick={() => setNewSupplier(true)} title="New supplier"><Plus size={15} /></Button>}
              </div>
            </Field>
            {!form.supplierId && <Field label="Party name"><input className={inputCls} disabled={locked} value={form.partyName} onChange={(e) => setForm({ ...form, partyName: e.target.value })} /></Field>}
            <Field label="Supplier bill no."><input className={inputCls} disabled={locked} value={form.billNo} onChange={(e) => setForm({ ...form, billNo: e.target.value })} /></Field>
            <Field label="Supplier GSTIN"><input className={inputCls} disabled={locked} value={form.supplierGstin} onChange={(e) => setForm({ ...form, supplierGstin: e.target.value.toUpperCase() })} /></Field>
          </>
        ) : (
          <Field label="Customer" className="sm:col-span-2"><CustomerPicker api={api} value={form.customer} onChange={(c) => setForm({ ...form, customer: c })} /></Field>
        )}
        <Field label="Date"><input type="date" className={inputCls} disabled={locked} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        {isPurchase && <label className="flex items-center gap-2 pt-6 text-sm font-medium text-slate-700"><input type="checkbox" disabled={locked} checked={form.igst} onChange={(e) => setForm({ ...form, igst: e.target.checked })} /> Inter-state (IGST)</label>}
      </div>

      {!locked && (
        <div className="relative max-w-xl">
          <input className={inputCls} placeholder="Search by name (e.g. sprite) or scan the QR / barcode" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) { e.preventDefault(); if (rows.length === 1) addRow(rows[0]); else if (!rows.length) onCode(q.trim()); } }} />
          {q.trim() && rows.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {rows.map((r) => (
                <button key={`${r.productId}-${r.variantSku}`} type="button" className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => addRow(r)}>
                  <span>{r.name}{r.variantName ? ` (${r.variantName})` : ""}</span><span className="text-xs text-slate-500">stock {r.stock}</span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700" onClick={() => setScanOpen(true)}><ScanLine size={14} /> Scan with camera</button>
            <span className="text-xs text-slate-400">or scan with a USB scanner anywhere on this page</span>
            {isPurchase && <button type="button" className="text-xs font-semibold text-primary underline" onClick={() => setNewProduct("")}>+ New product</button>}
            <button type="button" className="text-xs font-semibold text-primary underline" onClick={() => setLines((ls) => [...ls, emptyLine(null, type)])}>+ Add a line without linking a product</button>
          </div>
          <BarcodeScannerModal isOpen={scanOpen} onClose={() => setScanOpen(false)} onDetected={onCode} />
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
            {isPurchase ? (
              <tr><th className="p-2">Item</th><th className="p-2">Qty</th><th className="p-2">Purchase ₹</th><th className="p-2">GST</th><th className="p-2">MRP</th><th className="p-2">Sell ₹</th><th className="p-2">Wholesale</th><th className="p-2">Barcode</th><th className="p-2">HSN</th><th className="p-2">Batch / Expiry</th><th className="p-2 text-right">Amount</th><th /></tr>
            ) : (
              <tr><th className="p-2">Item</th><th className="p-2">Qty</th><th className="p-2">Rate</th><th className="p-2">GST %</th><th className="p-2 text-right">Amount</th><th /></tr>
            )}
          </thead>
          <tbody>
            {lines.map((l) => {
              const c = calcLine(type, l);
              const num = (k, w = "w-20") => <input className={cn(inputCls, "h-8 px-2", w)} disabled={locked} inputMode="decimal" value={l[k] ?? ""} onChange={(e) => setLine(l.key, { [k]: e.target.value.replace(/[^\d.]/g, "") })} />;
              return (
                <tr key={l.key} className="border-t border-slate-100 align-top">
                  <td className="p-2">
                    {l.productId ? <p className="font-medium text-slate-800">{l.name}{l.variantName ? ` (${l.variantName})` : ""}</p> : <input className={cn(inputCls, "h-8 px-2")} disabled={locked} placeholder="Item name" value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} />}
                    {isPurchase && l.productId && !locked && (
                      <label className="mt-1 flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" checked={Boolean(l.updatePrices)} onChange={(e) => setLine(l.key, { updatePrices: e.target.checked })} /> update product prices</label>
                    )}
                    {isPurchase && l.productId && l.currentStock != null && (
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {l.stockAdded ? <>Stock now <b className="text-emerald-700">{l.currentStock}</b></> : locked ? null : <>Stock {l.currentStock} → <b className="text-emerald-700">{Number(l.currentStock) + (Number(l.quantity) || 0)}</b></>}
                      </p>
                    )}
                    {!l.productId && <p className="text-[10px] text-slate-400">not linked — no stock change</p>}
                  </td>
                  <td className="p-2">{num("quantity", "w-16")}</td>
                  {isPurchase ? (
                    <>
                      <td className="p-2">{num("purchasePrice")}</td>
                      <td className="p-2">
                        <select className={cn(inputCls, "h-8 w-20 px-1")} disabled={locked} value={l.gstRate} onChange={(e) => setLine(l.key, { gstRate: Number(e.target.value) })}>{[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}%</option>)}</select>
                        <select className={cn(inputCls, "mt-1 h-7 w-20 px-1 text-[11px]")} disabled={locked} value={l.gstMode} onChange={(e) => setLine(l.key, { gstMode: e.target.value })}><option value="exclusive">+ GST</option><option value="inclusive">incl.</option></select>
                      </td>
                      <td className="p-2">{num("mrp")}</td>
                      <td className="p-2">{num("sellingPrice")}</td>
                      <td className="p-2">{num("wholesalePrice")}</td>
                      <td className="p-2"><input className={cn(inputCls, "h-8 w-28 px-2")} disabled={locked} value={l.barcode || ""} onChange={(e) => setLine(l.key, { barcode: e.target.value })} /></td>
                      <td className="p-2"><input className={cn(inputCls, "h-8 w-20 px-2")} disabled={locked} value={l.hsnCode || ""} onChange={(e) => setLine(l.key, { hsnCode: e.target.value })} /></td>
                      <td className="p-2">
                        <input className={cn(inputCls, "h-8 w-24 px-2")} disabled={locked} placeholder="Batch" value={l.batch || ""} onChange={(e) => setLine(l.key, { batch: e.target.value })} />
                        <input type="date" className={cn(inputCls, "mt-1 h-8 w-32 px-2 text-xs")} disabled={locked} value={l.expiry || ""} onChange={(e) => setLine(l.key, { expiry: e.target.value })} />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-2">{num("price")}</td>
                      <td className="p-2"><select className={cn(inputCls, "h-8 w-20 px-1")} value={l.gstRate} onChange={(e) => setLine(l.key, { gstRate: Number(e.target.value) })}>{[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}%</option>)}</select></td>
                    </>
                  )}
                  <td className="p-2 text-right font-semibold">{rupees(c.total)}{c.gst > 0 && <p className="text-[10px] font-normal text-slate-400">GST {rupees(c.gst)}</p>}</td>
                  <td className="p-2">{!locked && <IconBtn danger title="Remove line" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 size={14} /></IconBtn>}</td>
                </tr>
              );
            })}
            {!lines.length && <tr><td colSpan={12} className="p-10 text-center text-slate-500">Search above to add items.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <Field label="Notes"><input className={inputCls} disabled={locked} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          {isPurchase && (
            <div className="space-y-2">
              <p className={labelCls}>Payment to supplier</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {[["full", "Paid in full", "Nothing owed for this bill"], ["later", "Pay later", "Bill goes to You owe"], ["part", "Part paid", "Enter the amount paid"]].map(([v, title, sub]) => (
                  <label key={v} className={cn("flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 text-sm", form.payMode === v ? "border-primary bg-primary/5" : "border-slate-200", locked && "cursor-default opacity-70")}>
                    <input type="radio" name="payMode" className="mt-0.5" disabled={locked} checked={form.payMode === v} onChange={() => setForm({ ...form, payMode: v })} />
                    <span><span className="block font-semibold text-slate-800">{title}</span><span className="text-xs text-slate-500">{sub}</span></span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {isPurchase && form.payMode !== "later" && (
            <div className="grid grid-cols-2 gap-3">
              {form.payMode === "part"
                ? <Field label="Paid now (₹)"><input className={inputCls} disabled={locked} inputMode="decimal" value={form.paidAmount} onChange={(e) => setForm({ ...form, paidAmount: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
                : <Field label="Paid now (₹)"><input className={inputCls} disabled value={paidNow} readOnly /></Field>}
              <Field label="Paid by"><select className={inputCls} disabled={locked} value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>{["Cash", "UPI", "Bank transfer", "Cheque", "Card"].map((m) => <option key={m}>{m}</option>)}</select></Field>
            </div>
          )}
        </div>
        <div className="space-y-2 rounded-2xl border border-slate-100 bg-white p-4 text-sm shadow-sm">
          <div className="flex justify-between text-slate-600"><span>Taxable value</span><span>{rupees(totals.taxable)}</span></div>
          <div className="flex justify-between text-slate-600"><span>{form.igst ? "IGST" : "CGST + SGST"}</span><span>{rupees(totals.gst)}</span></div>
          <div className="flex items-center justify-between text-slate-600"><span>Extra charges (freight…)</span><input className="w-24 rounded border border-slate-200 px-2 py-1 text-right" disabled={locked} inputMode="decimal" value={form.extraCharges} onChange={(e) => setForm({ ...form, extraCharges: e.target.value.replace(/[^\d.]/g, "") })} /></div>
          <div className="flex items-center justify-between text-slate-600"><span>Discount</span><input className="w-24 rounded border border-slate-200 px-2 py-1 text-right" disabled={locked} inputMode="decimal" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value.replace(/[^\d.]/g, "") })} /></div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-black"><span>Total</span><span>{rupees(totals.total)}</span></div>
          {isPurchase && form.supplierId && history?.supplier && <SupplierBalance balance={history.supplier.balance} bill={totals.total} paid={paidNow} done={locked} />}
        </div>
      </div>

      {isPurchase && form.supplierId && <SupplierDeliveries data={history} onOpen={() => navigate(`/${portal}/pos/suppliers/${form.supplierId}`)} />}

      <SupplierFormModal api={api} isOpen={newSupplier} onClose={() => setNewSupplier(false)} onSaved={(s) => { loadSuppliers(); if (s?._id) setForm((f) => ({ ...f, supplierId: s._id })); }} />
      {portal === "seller" ? (
        newProduct !== null && (
          <FullProductFormOverlay
            initialBarcode={newProduct}
            onCancel={() => setNewProduct(null)}
            onSaved={addCreatedProduct}
          />
        )
      ) : (
        // Admins have no create-product form (they only edit), so they keep the quick form.
        <QuickAddModal api={api} saveOnly isOpen={newProduct !== null} initialBarcode={newProduct || ""} sellers={sellers} onClose={() => setNewProduct(null)} onAdd={(row) => row?.productId && addRow({ ...row, stock: 0 })} />
      )}
    </div>
  );
}

const owesLabel = (v) => (v > 0.004 ? { text: "You owe", cls: "text-red-600" } : v < -0.004 ? { text: "Advance paid", cls: "text-emerald-700" } : { text: "Settled", cls: "text-slate-500" });

/** Supplier account for this purchase: before, this bill, paid now, after. */
/** The full Add Product form on top of the purchase entry, so the draft stays put. */
function FullProductFormOverlay({ initialBarcode, onSaved, onCancel }) {
  useBodyScrollLock(true);
  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto overscroll-contain bg-slate-50 p-4 md:p-8" data-lenis-prevent role="dialog" aria-modal="true" aria-label="New product">
      <Suspense fallback={<div className="py-24 text-center text-sm font-semibold text-slate-500">Loading product form...</div>}>
        <AddProduct embedded initialBarcode={initialBarcode || ""} onSaved={onSaved} onCancel={onCancel} />
      </Suspense>
    </div>
  );
}

function SupplierBalance({ balance, bill, paid, done }) {
  if (done) {
    const now = owesLabel(balance);
    return (
      <div className="flex justify-between border-t border-dashed border-slate-200 pt-2 text-sm">
        <span className="text-slate-600">Supplier now: {now.text}</span><span className={cn("font-bold", now.cls)}>{rupees(Math.abs(balance))}</span>
      </div>
    );
  }
  const after = round2(balance + bill - paid);
  const before = owesLabel(balance);
  const end = owesLabel(after);
  return (
    <div className="space-y-1 border-t border-dashed border-slate-200 pt-2 text-sm">
      <div className="flex justify-between text-slate-600"><span>Before this bill: {before.text}</span><span className={before.cls}>{rupees(Math.abs(balance))}</span></div>
      <div className="flex justify-between text-slate-600"><span>+ This bill</span><span>{rupees(bill)}</span></div>
      <div className="flex justify-between text-slate-600"><span>− Paid now</span><span>{rupees(paid)}</span></div>
      <div className="flex justify-between font-bold"><span>After completing: {end.text}</span><span className={end.cls}>{rupees(Math.abs(after))}</span></div>
      {balance < -0.004 && <p className="text-xs text-slate-500">The advance you paid earlier is adjusted against this bill.</p>}
      {after < -0.004 && <p className="text-xs text-slate-500">You are paying more than you owe; the extra stays as an advance with this supplier.</p>}
    </div>
  );
}

/** What the picked supplier has sent before. */
function SupplierDeliveries({ data, onOpen }) {
  if (!data) return null;
  const { supplier, supplied = [], deliveries = [] } = data;
  return (
    <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-slate-800">Supplied by {supplier.name}</p>
        <div className="flex items-center gap-3 text-sm">
          <span className={cn("font-semibold", owesLabel(supplier.balance).cls)}>{owesLabel(supplier.balance).text} {rupees(Math.abs(supplier.balance))}</span>
          <button type="button" onClick={onOpen} className="font-semibold text-primary underline">Full history</button>
        </div>
      </div>
      {!deliveries.length && <p className="text-sm text-slate-500">Nothing received from this supplier yet.</p>}
      {supplied.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {supplied.slice(0, 12).map((s) => (
            <span key={`${s.productId}-${s.variantSku}-${s.name}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {s.name}{s.variantName ? ` · ${s.variantName}` : ""}: <b>{s.quantity}</b>
            </span>
          ))}
        </div>
      )}
      {deliveries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="py-2">Date</th><th className="py-2">Entry</th><th className="py-2">Items</th></tr></thead>
            <tbody>
              {deliveries.slice(0, 8).map((d) => (
                <tr key={d._id} className="border-t border-slate-100 align-top">
                  <td className="py-2 pr-3 text-slate-600">{fmtDate(d.date)}</td>
                  <td className="py-2 pr-3">{d.number}{d.billNo ? <p className="text-xs text-slate-400">bill {d.billNo}</p> : null}</td>
                  <td className="py-2 text-slate-700">{d.items.map((i) => `${i.name}${i.variantName ? ` ${i.variantName}` : ""} × ${i.quantity}`).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
