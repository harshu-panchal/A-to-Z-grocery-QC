import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Download, FileText, Printer } from "lucide-react";
import PageHeader from "@shared/components/ui/PageHeader";
import Button from "@shared/components/ui/Button";
import Modal from "@shared/components/ui/Modal";
import { apiError } from "../posApi";
import { rupees, round2, fmtDate, DEFAULT_BARCODE_SETTINGS } from "../posUtils";
import { downloadCsv, downloadTablePdf, printBarcodeLabels, printReceipt } from "../posPrint";
import { DEFAULT_SCALE, parseScaleBarcode } from "../posOffline";
import { usePosApi, usePosSettings, StatTile, Pager, inputCls, Field } from "../PosComponents";
import { IconBtn } from "./PosReport";

// ============================================================ GST register
export function PosGstRegister({ portal }) {
  const api = usePosApi(portal);
  const [filters, setFilters] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], totals: {}, totalPages: 1 });
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => api.gstRegister({ ...filters, page, limit: 50 }).then(setData).catch((e) => toast.error(apiError(e))), [api, filters, page]);
  useEffect(() => { load(); }, [load]);
  const t = data.totals || {};
  const HEAD = ["Date", "Invoice", "Party", "GSTIN", "Taxable", "CGST", "SGST", "IGST", "Total"];
  const rows = data.items.map((g) => [fmtDate(g.date), g.invoiceNo, g.partyName, g.gstin, g.taxableValue, g.cgst, g.sgst, g.igst, g.total]);
  const remove = async (g) => {
    if (!window.confirm("Delete this entry?")) return;
    try { await api.deleteGst(g._id); toast.success("Deleted"); load(); } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Purchase GST register" description="Input GST on purchases. Completed purchase entries are added automatically."
        actions={<>
          <Button variant="outline" onClick={() => downloadCsv("gst-register.csv", HEAD, rows)}><Download size={15} className="mr-1" /> CSV</Button>
          <Button variant="outline" onClick={() => downloadTablePdf({ title: "Purchase GST register", subtitle: `${filters.from || "start"} to ${filters.to || "today"}`, head: HEAD, body: rows })}><FileText size={15} className="mr-1" /> PDF</Button>
          <Button onClick={() => setEditing({})}><Plus size={15} className="mr-1" /> Add entry</Button>
        </>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Taxable value" value={rupees(t.taxable || 0)} />
        <StatTile label="CGST" value={rupees(t.cgst || 0)} />
        <StatTile label="SGST" value={rupees(t.sgst || 0)} />
        <StatTile label="IGST" value={rupees(t.igst || 0)} />
        <StatTile label="Total input GST" value={rupees(round2((t.cgst || 0) + (t.sgst || 0) + (t.igst || 0)))} tone="green" />
      </div>
      <div className="flex gap-2">
        <Field label="From"><input type="date" className={inputCls} value={filters.from} onChange={(e) => { setPage(1); setFilters({ ...filters, from: e.target.value }); }} /></Field>
        <Field label="To"><input type="date" className={inputCls} value={filters.to} onChange={(e) => { setPage(1); setFilters({ ...filters, to: e.target.value }); }} /></Field>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500"><tr>{HEAD.map((h) => <th key={h} className="p-3">{h}</th>)}<th /></tr></thead>
          <tbody>
            {data.items.map((g) => (
              <tr key={g._id} className="border-t border-slate-100">
                <td className="p-3">{fmtDate(g.date)}</td><td className="p-3 font-medium">{g.invoiceNo}</td><td className="p-3">{g.partyName}</td><td className="p-3">{g.gstin || "-"}</td>
                <td className="p-3">{rupees(g.taxableValue)}</td><td className="p-3">{rupees(g.cgst)}</td><td className="p-3">{rupees(g.sgst)}</td><td className="p-3">{rupees(g.igst)}</td><td className="p-3 font-bold">{rupees(g.total)}</td>
                <td className="p-3"><div className="flex gap-1"><IconBtn title="Edit" onClick={() => setEditing(g)}><Pencil size={14} /></IconBtn><IconBtn danger title="Delete" onClick={() => remove(g)}><Trash2 size={14} /></IconBtn></div></td>
              </tr>
            ))}
            {!data.items.length && <tr><td colSpan={10} className="p-10 text-center text-slate-500">No entries.</td></tr>}
          </tbody>
        </table>
        <Pager page={page} totalPages={data.totalPages} onPage={setPage} />
      </div>
      {editing && <GstEntryModal api={api} entry={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function GstEntryModal({ api, entry, onClose, onSaved }) {
  const [f, setF] = useState({ date: (entry.date || new Date().toISOString()).slice(0, 10), invoiceNo: entry.invoiceNo || "", partyName: entry.partyName || "", gstin: entry.gstin || "", taxableValue: entry.taxableValue ?? "", cgst: entry.cgst ?? "", sgst: entry.sgst ?? "", igst: entry.igst ?? "", notes: entry.notes || "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, taxableValue: Number(f.taxableValue) || 0, cgst: Number(f.cgst) || 0, sgst: Number(f.sgst) || 0, igst: Number(f.igst) || 0 };
      if (entry._id) await api.updateGst(entry._id, body); else await api.createGst(body);
      toast.success("Saved");
      onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen onClose={onClose} title={entry._id ? "Edit GST entry" : "Add GST entry"}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} isLoading={busy}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date"><input type="date" className={inputCls} value={f.date} onChange={set("date")} /></Field>
        <Field label="Invoice no."><input className={inputCls} value={f.invoiceNo} onChange={set("invoiceNo")} /></Field>
        <Field label="Party"><input className={inputCls} value={f.partyName} onChange={set("partyName")} /></Field>
        <Field label="GSTIN"><input className={inputCls} value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} /></Field>
        <Field label="Taxable value"><input className={inputCls} type="number" value={f.taxableValue} onChange={set("taxableValue")} /></Field>
        <Field label="CGST"><input className={inputCls} type="number" value={f.cgst} onChange={set("cgst")} /></Field>
        <Field label="SGST"><input className={inputCls} type="number" value={f.sgst} onChange={set("sgst")} /></Field>
        <Field label="IGST"><input className={inputCls} type="number" value={f.igst} onChange={set("igst")} /></Field>
        <Field label="Notes" className="sm:col-span-2"><input className={inputCls} value={f.notes} onChange={set("notes")} /></Field>
      </div>
    </Modal>
  );
}

// ================================================================ settings
const BILL_FIELDS = [
  ["shopName", "Shop name"],
  ["address", "Address"],
  ["phone", "Phone"],
  ["gstin", "GSTIN"],
  ["fssai", "FSSAI licence no."],
  ["upiId", "UPI ID (QR on unpaid bills)"],
  ["notes", "Notes (e.g. goods once sold…)"],
  ["terms", "Terms & conditions"],
  ["footer", "Footer line"],
];

export function PosSettingsPage({ portal }) {
  const api = usePosApi(portal);
  const [settings, setSettings] = usePosSettings(api);
  const [bill, setBill] = useState({});
  const [barcode, setBarcode] = useState(DEFAULT_BARCODE_SETTINGS);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setBill(settings.bill || {});
    setBarcode({ ...DEFAULT_BARCODE_SETTINGS, ...(settings.barcode || {}) });
  }, [settings]);

  const setBillField = (k, patch) => setBill((b) => ({ ...b, [k]: { text: "", enabled: true, ...(b[k] || {}), ...patch } }));
  const save = async () => {
    setBusy(true);
    try {
      const saved = await api.saveSettings({ bill, barcode });
      setSettings(saved);
      toast.success("Settings saved");
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const testReceipt = () => printReceipt({
    invoiceNumber: "TEST-0001", createdAt: new Date(), customerSnapshot: { name: "Walk-in Customer" },
    items: [{ name: "Sample item", variantName: "1 kg", quantity: 2, unitPrice: 50, mrp: 60, total: 100 }],
    itemCount: 2, subtotal: 100, total: 100, gstTotal: 4.76, paymentMethod: "Cash", paymentStatus: "Paid", amountReceived: 200, changeReturned: 100,
  }, bill);

  return (
    <div className="space-y-4">
      <PageHeader title="POS settings" description="What prints on receipts and barcode labels." actions={<Button onClick={save} isLoading={busy}>Save settings</Button>} />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="font-bold text-slate-800">Receipt / invoice header & footer</p>
            <Button size="sm" variant="outline" onClick={testReceipt}><Printer size={14} className="mr-1" /> Test print</Button>
          </div>
          {BILL_FIELDS.map(([k, label]) => (
            <div key={k} className="flex items-end gap-2">
              <Field label={label} className="flex-1">
                {k === "notes" || k === "terms"
                  ? <textarea className={`${inputCls} h-16 py-2`} value={bill[k]?.text || ""} onChange={(e) => setBillField(k, { text: e.target.value })} />
                  : <input className={inputCls} value={bill[k]?.text || ""} onChange={(e) => setBillField(k, { text: e.target.value })} />}
              </Field>
              <label className="mb-2 flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={bill[k]?.enabled !== false} onChange={(e) => setBillField(k, { enabled: e.target.checked })} /> show</label>
            </div>
          ))}
          <Field label="Receipt paper width">
            <select className={inputCls} value={bill.paperWidth || 80} onChange={(e) => setBill((b) => ({ ...b, paperWidth: Number(e.target.value) }))}><option value={80}>80 mm (3 inch)</option><option value={58}>58 mm (2 inch)</option></select>
          </Field>
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="font-bold text-slate-800">Barcode labels</p>
            <Button size="sm" variant="outline" onClick={() => printBarcodeLabels([{ name: "Sample product 1kg", barcode: "8901234567890", mrp: 60, price: 50, copies: 1 }], barcode)}><Printer size={14} className="mr-1" /> Test label</Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[["width", "Label width (mm)"], ["height", "Label height (mm)"], ["fontSize", "Font size (px)"], ["barcodeHeight", "Bar height (px)"], ["barcodeWidth", "Bar thickness"]].map(([k, label]) => (
              <Field key={k} label={label}><input className={inputCls} type="number" step="0.1" value={barcode[k]} onChange={(e) => setBarcode({ ...barcode, [k]: Number(e.target.value) })} /></Field>
            ))}
            <Field label="MRP label"><input className={inputCls} value={barcode.mrpLabel} onChange={(e) => setBarcode({ ...barcode, mrpLabel: e.target.value })} /></Field>
            <Field label="Selling price label"><input className={inputCls} value={barcode.spLabel} onChange={(e) => setBarcode({ ...barcode, spLabel: e.target.value })} /></Field>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-slate-700">
            {[["showName", "Product name"], ["showMrp", "MRP"], ["showPrice", "Selling price"]].map(([k, label]) => (
              <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={Boolean(barcode[k])} onChange={(e) => setBarcode({ ...barcode, [k]: e.target.checked })} /> {label}</label>
            ))}
          </div>
          <p className="text-xs text-slate-500">Labels print one per page at this size. Set the same size in your label printer's driver.</p>
        </div>

        <ScaleSettings scale={{ ...DEFAULT_SCALE, ...(bill.scale || {}) }} onChange={(scale) => setBill((b) => ({ ...b, scale }))} />
      </div>
    </div>
  );
}

/** Weighing-scale barcode format (loose items: dal, sugar, vegetables…). */
function ScaleSettings({ scale, onChange }) {
  const [test, setTest] = useState("");
  const parsed = test ? parseScaleBarcode(test, { ...scale, enabled: true }) : null;
  return (
    <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm xl:col-span-2">
      <div className="flex items-center justify-between">
        <p className="font-bold text-slate-800">Weighing scale barcodes</p>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={Boolean(scale.enabled)} onChange={(e) => onChange({ ...scale, enabled: e.target.checked })} /> Use scale barcodes</label>
      </div>
      <p className="text-xs text-slate-500">
        Shop scales print a 13-digit label: prefix + item code (PLU) + weight or price. Set each loose product's barcode (or SKU) to its scale PLU, e.g. 00012, and price it per kg.
        When a scale label is scanned at the counter, the item is added with the weighed quantity.
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Label starts with"><input className={inputCls} value={scale.prefix} maxLength={3} onChange={(e) => onChange({ ...scale, prefix: e.target.value.replace(/\D/g, "") })} /></Field>
        <Field label="Item code (PLU) digits"><select className={inputCls} value={scale.pluLength} onChange={(e) => onChange({ ...scale, pluLength: Number(e.target.value) })}>{[4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
        <Field label="Label holds"><select className={inputCls} value={scale.valueType} onChange={(e) => onChange({ ...scale, valueType: e.target.value })}><option value="weight">Weight (grams)</option><option value="price">Price (paise)</option></select></Field>
        <Field label="Test a label"><input className={inputCls} placeholder="2100012012345" value={test} onChange={(e) => setTest(e.target.value.trim())} /></Field>
      </div>
      {test && <p className="text-sm">{parsed ? <span className="text-emerald-700">Item code <b>{parsed.plu}</b> · {parsed.quantity !== undefined ? `${parsed.quantity} kg` : `₹${parsed.amount}`}</span> : <span className="text-red-600">This doesn't match the format above.</span>}</p>}
    </div>
  );
}
