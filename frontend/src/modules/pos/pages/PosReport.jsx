import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Printer, FileText, Pencil, Ban, Eye, Download } from "lucide-react";
import PageHeader from "@shared/components/ui/PageHeader";
import Button from "@shared/components/ui/Button";
import Modal from "@shared/components/ui/Modal";
import Badge from "@shared/components/ui/Badge";
import { cn } from "@/lib/utils";
import { apiError } from "../posApi";
import { rupees, round2, fmtDateTime, todayLocal } from "../posUtils";
import { printReceipt, downloadInvoicePdf, downloadCsv, downloadTablePdf } from "../posPrint";
import { usePosApi, usePosSettings, StatTile, Pager, inputCls, Field } from "../PosComponents";
import { ChannelReport } from "./PosInventory";

const TABS = [
  { key: "bills", label: "Bills" },
  { key: "ledger", label: "Stock ledger" },
  { key: "exchange", label: "Exchange" },
  { key: "channel", label: "App vs Counter" },
];

export default function PosReport({ portal }) {
  const api = usePosApi(portal);
  const [tab, setTab] = useState("bills");
  return (
    <div className="space-y-4">
      <PageHeader title="POS Reports" description="Counter bills, stock movements and exchanges." />
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold sm:w-fit">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={cn("rounded-lg px-4 py-2", tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>{t.label}</button>
        ))}
      </div>
      {tab === "bills" && <BillsTab api={api} portal={portal} />}
      {tab === "ledger" && <LedgerTab api={api} portal={portal} />}
      {tab === "exchange" && <ExchangeTab api={api} />}
      {tab === "channel" && <ChannelReport api={api} portal={portal} />}
    </div>
  );
}

const statusVariant = { completed: "success", cancelled: "danger", pending_payment: "warning" };
const payVariant = { Paid: "success", Pending: "warning", Failed: "danger", Refunded: "secondary" };

// ===================================================================== bills
function BillsTab({ api, portal }) {
  const navigate = useNavigate();
  const [settings] = usePosSettings(api);
  const [filters, setFilters] = useState({ from: todayLocal(), to: todayLocal(), paymentMethod: "all", status: "all", search: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], summary: {}, totalPages: 1 });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const [view, setView] = useState(null);
  const [cancelling, setCancelling] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.listOrders({ ...filters, page, limit: 25 })
      .then((d) => { setData(d); setSelected([]); })
      .catch((err) => toast.error(apiError(err)))
      .finally(() => setLoading(false));
  }, [api, filters, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { api.summary().then(setSummary).catch(() => {}); }, [api]);

  const setF = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })); };
  const s = data.summary || {};
  const exportRows = data.items.map((o) => [o.invoiceNumber, fmtDateTime(o.createdAt), o.customerSnapshot?.name, o.itemCount, round2(o.total), round2(o.gstTotal), o.paymentMethod, o.paymentStatus, o.status]);
  const HEAD = ["Invoice", "Date", "Customer", "Items", "Total", "GST", "Method", "Payment", "Status"];

  const openFull = async (id) => {
    try { setView(await api.getOrder(id)); } catch (err) { toast.error(apiError(err)); }
  };

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Today's sales" value={rupees(summary.today.sales)} sub={`${summary.today.bills} bills`} tone="green" />
          <StatTile label="This month" value={rupees(summary.month.sales)} sub={`${summary.month.bills} bills`} />
          <StatTile label="Udhaar outstanding" value={rupees(summary.creditDue.total)} sub={`${summary.creditDue.customers} customers`} tone="red" />
          <StatTile label="Selected period" value={rupees(s.sales || 0)} sub={`${s.bills || 0} bills · GST ${rupees(s.gst || 0)}`} />
        </div>
      )}

      <div className="grid gap-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm sm:grid-cols-3 lg:grid-cols-6">
        <Field label="From"><input type="date" className={inputCls} value={filters.from} onChange={setF("from")} /></Field>
        <Field label="To"><input type="date" className={inputCls} value={filters.to} min={filters.from} onChange={setF("to")} /></Field>
        <Field label="Payment">
          <select className={inputCls} value={filters.paymentMethod} onChange={setF("paymentMethod")}>
            {["all", "Cash", "UPI", "Card", "Credit", "Online"].map((m) => <option key={m} value={m}>{m === "all" ? "All methods" : m === "Credit" ? "Udhaar" : m === "Online" ? "PhonePe" : m}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className={inputCls} value={filters.status} onChange={setF("status")}>
            <option value="all">All</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
          </select>
        </Field>
        <Field label="Search" className="sm:col-span-2"><input className={inputCls} placeholder="Invoice, name or phone" value={filters.search} onChange={setF("search")} /></Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(s.byMethod || {}).map(([m, v]) => <Badge key={m} variant="outline">{m}: {rupees(v.total)} ({v.count})</Badge>)}
        <div className="ml-auto flex gap-2">
          {selected.length > 0 && <Button size="sm" variant="danger" onClick={() => setCancelling({ ids: selected })}><Ban size={14} className="mr-1" /> Cancel {selected.length}</Button>}
          <Button size="sm" variant="outline" onClick={() => downloadCsv(`pos-bills-${filters.from}-${filters.to}.csv`, HEAD, exportRows)}><Download size={14} className="mr-1" /> CSV</Button>
          <Button size="sm" variant="outline" onClick={() => downloadTablePdf({ title: "POS Bills", subtitle: `${filters.from} to ${filters.to} · Sales ${rupees(s.sales || 0)}`, head: HEAD, body: exportRows })}><FileText size={14} className="mr-1" /> PDF</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="p-3"><input type="checkbox" aria-label="Select all" checked={data.items.length > 0 && selected.length === data.items.filter((o) => o.status === "completed").length} onChange={(e) => setSelected(e.target.checked ? data.items.filter((o) => o.status === "completed").map((o) => o._id) : [])} /></th>
              <th className="p-3">Invoice</th><th className="p-3">Date</th><th className="p-3">Customer</th><th className="p-3 text-right">Items</th><th className="p-3 text-right">Total</th><th className="p-3">Payment</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((o) => (
              <tr key={o._id} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="p-3">{o.status === "completed" && <input type="checkbox" aria-label={`Select ${o.invoiceNumber}`} checked={selected.includes(o._id)} onChange={(e) => setSelected((sel) => (e.target.checked ? [...sel, o._id] : sel.filter((x) => x !== o._id)))} />}</td>
                <td className="p-3 font-semibold text-slate-800">{o.invoiceNumber}{o.editCount > 0 && <span className="ml-1 text-[10px] text-amber-600">edited</span>}</td>
                <td className="p-3 text-slate-600">{fmtDateTime(o.createdAt)}</td>
                <td className="p-3">{o.customerSnapshot?.name}<div className="text-xs text-slate-400">{o.customerSnapshot?.phone}</div></td>
                <td className="p-3 text-right">{round2(o.itemCount)}</td>
                <td className="p-3 text-right font-bold">{rupees(o.total)}</td>
                <td className="p-3"><span className="mr-1 text-slate-700">{o.paymentMethod === "Credit" ? "Udhaar" : o.paymentMethod === "Online" ? "PhonePe" : o.paymentMethod}</span><Badge variant={payVariant[o.paymentStatus]}>{o.paymentStatus}</Badge></td>
                <td className="p-3"><Badge variant={statusVariant[o.status]}>{o.status.replace("_", " ")}</Badge></td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <IconBtn title="View" onClick={() => openFull(o._id)}><Eye size={15} /></IconBtn>
                    <IconBtn title="Print receipt" onClick={() => printReceipt(o, settings.bill)}><Printer size={15} /></IconBtn>
                    <IconBtn title="PDF invoice" onClick={() => downloadInvoicePdf(o, settings.bill)}><FileText size={15} /></IconBtn>
                    {o.status === "completed" && o.paymentMethod !== "Online" && <IconBtn title="Edit bill" onClick={() => navigate(`/${portal}/pos?edit=${o._id}`)}><Pencil size={15} /></IconBtn>}
                    {o.status === "completed" && <IconBtn title="Cancel bill" danger onClick={() => setCancelling({ ids: [o._id], label: o.invoiceNumber })}><Ban size={15} /></IconBtn>}
                  </div>
                </td>
              </tr>
            ))}
            {!data.items.length && <tr><td colSpan={9} className="p-10 text-center text-slate-500">{loading ? "Loading…" : "No bills in this period."}</td></tr>}
          </tbody>
        </table>
        <Pager page={page} totalPages={data.totalPages} onPage={setPage} />
      </div>

      {view && <OrderViewModal order={view} bill={settings.bill} onClose={() => setView(null)} />}
      {cancelling && <CancelModal api={api} target={cancelling} onClose={() => setCancelling(null)} onDone={() => { setCancelling(null); load(); }} />}
    </div>
  );
}

export function IconBtn({ children, danger, ...props }) {
  return <button type="button" className={cn("rounded-lg p-1.5 text-slate-500 hover:bg-slate-100", danger && "hover:bg-red-50 hover:text-red-600")} {...props}>{children}</button>;
}

export function OrderViewModal({ order, bill, onClose }) {
  return (
    <Modal isOpen onClose={onClose} title={`Bill ${order.invoiceNumber}`} size="lg"
      footer={<><Button variant="outline" onClick={() => printReceipt(order, bill)}><Printer size={15} className="mr-1" /> Receipt</Button><Button variant="outline" onClick={() => downloadInvoicePdf(order, bill)}><FileText size={15} className="mr-1" /> PDF</Button><Button onClick={onClose}>Close</Button></>}>
      <div className="mb-3 grid grid-cols-2 gap-2 text-sm text-slate-600">
        <p><b>Date:</b> {fmtDateTime(order.createdAt)}</p>
        <p><b>Customer:</b> {order.customerSnapshot?.name} {order.customerSnapshot?.phone}</p>
        <p><b>Payment:</b> {order.paymentMethod} ({order.paymentStatus})</p>
        <p><b>Status:</b> {order.status}{order.cancelReason ? ` — ${order.cancelReason}` : ""}</p>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-1">Item</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">GST</th><th className="text-right">Amount</th></tr></thead>
        <tbody>
          {order.items.map((it) => (
            <tr key={it._id} className="border-t border-slate-100">
              <td className="py-1.5">{it.name}{it.variantName ? ` (${it.variantName})` : ""}{!it.product && <span className="ml-1 text-[10px] text-slate-400">custom</span>}</td>
              <td className="text-right">{it.quantity}</td><td className="text-right">{rupees(it.unitPrice)}</td><td className="text-right">{it.gstRate || 0}%</td><td className="text-right font-semibold">{rupees(it.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 space-y-1 border-t border-slate-200 pt-2 text-right text-sm">
        <p>Subtotal {rupees(order.subtotal)}</p>
        {order.billDiscount > 0 && <p>Discount −{rupees(order.billDiscount)}</p>}
        {order.gstTotal > 0 && <p className="text-xs text-slate-500">Incl. GST {rupees(order.gstTotal)}</p>}
        <p className="text-lg font-black">Total {rupees(order.total)}</p>
      </div>
    </Modal>
  );
}

function CancelModal({ api, target, onClose, onDone }) {
  const [restore, setRestore] = useState(true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      if (target.ids.length === 1) {
        await api.cancelOrder(target.ids[0], { restoreStock: restore, reason });
        toast.success("Bill cancelled");
      } else {
        const res = await api.bulkCancel(target.ids, restore);
        const failed = res.results.filter((r) => !r.ok).length;
        toast[failed ? "warning" : "success"](`${res.results.length - failed} cancelled${failed ? `, ${failed} failed` : ""}`);
      }
      onDone();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen onClose={onClose} title={target.ids.length === 1 ? `Cancel ${target.label || "bill"}?` : `Cancel ${target.ids.length} bills?`} size="sm"
      footer={<><Button variant="outline" onClick={onClose}>Keep</Button><Button variant="danger" onClick={go} isLoading={busy}>Cancel bill</Button></>}>
      <div className="space-y-3 text-sm text-slate-600">
        <p>The bill stays in reports as cancelled. Udhaar bills are taken off the customer's due.</p>
        <label className="flex items-center gap-2 font-medium text-slate-700"><input type="checkbox" checked={restore} onChange={(e) => setRestore(e.target.checked)} /> Put the items back into stock</label>
        {target.ids.length === 1 && <Field label="Reason (optional)"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
      </div>
    </Modal>
  );
}

// ==================================================================== ledger
const LEDGER_TYPES = ["all", "POS Sale", "POS Edit Restore", "POS Edit Deduct", "POS Cancel Restore", "Purchase", "Exchange In", "Exchange Out", "Restock", "Sale", "Correction"];

function LedgerTab({ api, portal }) {
  const [filters, setFilters] = useState({ source: "pos", type: "all", from: "", to: "", search: "", sellerId: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], totalPages: 1 });
  const [sellers, setSellers] = useState([]);
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => {
    api.stockLedger({ ...filters, page, limit: 50 }).then(setData).catch((err) => toast.error(apiError(err)));
  }, [api, filters, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { if (portal === "admin") api.sellers().then(setSellers).catch(() => {}); }, [api, portal]);
  const setF = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })); };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Source">
          <select className={inputCls} value={filters.source} onChange={setF("source")}>
            <option value="pos">POS + purchases</option><option value="POS">POS only</option><option value="PURCHASE">Purchases only</option><option value="all">Everything (incl. online)</option>
          </select>
        </Field>
        <Field label="Type"><select className={inputCls} value={filters.type} onChange={setF("type")}>{LEDGER_TYPES.map((t) => <option key={t} value={t}>{t === "all" ? "All types" : t}</option>)}</select></Field>
        <Field label="From"><input type="date" className={inputCls} value={filters.from} onChange={setF("from")} /></Field>
        <Field label="To"><input type="date" className={inputCls} value={filters.to} onChange={setF("to")} /></Field>
        <Field label="Product"><input className={inputCls} placeholder="Name, SKU, barcode" value={filters.search} onChange={setF("search")} /></Field>
        {portal === "admin" && (
          <Field label="Store"><select className={inputCls} value={filters.sellerId} onChange={setF("sellerId")}><option value="">All stores</option>{sellers.map((s) => <option key={s._id} value={s._id}>{s.shopName}</option>)}</select></Field>
        )}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="p-3">Date</th><th className="p-3">Product</th><th className="p-3">Type</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Stock after</th><th className="p-3">Reference</th><th className="p-3">Note</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r._id} className="border-t border-slate-100">
                <td className="p-3 text-slate-600">{fmtDateTime(r.createdAt)}</td>
                <td className="p-3"><span className="font-medium text-slate-800">{r.product?.name || "(deleted)"}</span>{r.variantSku && <span className="text-xs text-slate-400"> · {r.variantSku}</span>}{portal === "admin" && <div className="text-xs text-slate-400">{r.seller?.shopName}</div>}</td>
                <td className="p-3">{r.type}</td>
                <td className={cn("p-3 text-right font-bold", r.quantity < 0 ? "text-red-600" : "text-emerald-700")}>{r.quantity > 0 ? `+${r.quantity}` : r.quantity}</td>
                <td className="p-3 text-right">{r.stockAfter ?? "-"}</td>
                <td className="p-3 text-slate-600">{r.posOrder?.invoiceNumber || "-"}</td>
                <td className="max-w-[220px] truncate p-3 text-slate-500" title={r.note}>{r.note}</td>
                <td className="p-3"><IconBtn title="Correct entry" onClick={() => setEditing(r)}><Pencil size={14} /></IconBtn></td>
              </tr>
            ))}
            {!data.items.length && <tr><td colSpan={8} className="p-10 text-center text-slate-500">No stock movements.</td></tr>}
          </tbody>
        </table>
        <Pager page={page} totalPages={data.totalPages} onPage={setPage} />
      </div>
      {editing && <LedgerEditModal api={api} entry={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function LedgerEditModal({ api, entry, onClose, onSaved }) {
  const [qty, setQty] = useState(String(entry.quantity));
  const [note, setNote] = useState(entry.note || "");
  const [sync, setSync] = useState(true);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.updateLedger(entry._id, { quantity: Number(qty), note, syncStock: sync });
      toast.success("Entry corrected");
      onSaved();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen onClose={onClose} title="Correct stock entry" size="sm"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} isLoading={busy}>Save</Button></>}>
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">{entry.product?.name} · {entry.type}</p>
        <Field label="Quantity (− out, + in)"><input className={inputCls} type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Note"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <label className="flex items-center gap-2 font-medium text-slate-700"><input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} /> Also change the product's stock by the difference</label>
      </div>
    </Modal>
  );
}

// ================================================================== exchange
function ExchangeTab({ api }) {
  const [returnItems, setReturnItems] = useState([]);
  const [newItems, setNewItems] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const total = (list) => round2(list.reduce((s, l) => s + l.price * l.quantity, 0));
  const diff = round2(total(newItems) - total(returnItems));
  const submit = async () => {
    setBusy(true);
    try {
      const strip = (l) => ({ productId: l.productId, variantSku: l.variantSku, name: l.name, quantity: l.quantity, price: l.price });
      const res = await api.exchange({ returnItems: returnItems.map(strip), newItems: newItems.map(strip), note });
      toast.success(res.difference > 0 ? `Exchange saved. Collect ${rupees(res.difference)}` : res.difference < 0 ? `Exchange saved. Return ${rupees(-res.difference)}` : "Exchange saved");
      setReturnItems([]); setNewItems([]); setNote("");
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ItemListEditor api={api} title="Items coming back (stock in)" items={returnItems} setItems={setReturnItems} />
      <ItemListEditor api={api} title="Items going out (stock out)" items={newItems} setItems={setNewItems} />
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm lg:col-span-2">
        <Field label="Note" className="min-w-[200px] flex-1"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. size change, bill S-000123" /></Field>
        <div className="text-sm">
          <p className="text-slate-500">Returned {rupees(total(returnItems))} · New {rupees(total(newItems))}</p>
          <p className={cn("text-lg font-bold", diff > 0 ? "text-slate-900" : "text-emerald-700")}>{diff > 0 ? `Collect ${rupees(diff)}` : diff < 0 ? `Give back ${rupees(-diff)}` : "No difference"}</p>
        </div>
        <Button onClick={submit} isLoading={busy} disabled={!returnItems.length && !newItems.length}>Save exchange</Button>
      </div>
    </div>
  );
}

/** Product search + small editable list (used by exchange). */
export function ItemListEditor({ api, title, items, setItems }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!q.trim()) return undefined;
    const t = setTimeout(() => api.searchProducts({ search: q, limit: 8 }).then(setRows).catch(() => setRows([])), 250);
    return () => clearTimeout(t);
  }, [q, api]);
  const add = (r) => {
    setItems((list) => [...list, { key: `${r.productId}-${r.variantSku}-${Date.now()}`, productId: r.productId, variantSku: r.variantSku, name: `${r.name}${r.variantName ? ` (${r.variantName})` : ""}`, quantity: 1, price: r.price }]);
    setQ("");
  };
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="mb-2 text-sm font-bold text-slate-800">{title}</p>
      <div className="relative">
        <input className={inputCls} placeholder="Search product" value={q} onChange={(e) => setQ(e.target.value)} />
        {q.trim() && rows.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg">
            {rows.map((r) => <button key={`${r.productId}-${r.variantSku}`} type="button" onClick={() => add(r)} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50">{r.name}{r.variantName ? ` (${r.variantName})` : ""} · {rupees(r.price)}</button>)}
          </div>
        )}
      </div>
      <div className="mt-3 space-y-2">
        {items.map((l) => (
          <div key={l.key} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{l.name}</span>
            <input className="w-16 rounded border border-slate-200 px-2 py-1 text-center" type="number" min="1" value={l.quantity} onChange={(e) => setItems((list) => list.map((x) => (x.key === l.key ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x)))} />
            <span className="w-20 text-right">{rupees(l.price * l.quantity)}</span>
            <IconBtn danger title="Remove" onClick={() => setItems((list) => list.filter((x) => x.key !== l.key))}><Ban size={14} /></IconBtn>
          </div>
        ))}
        {!items.length && <p className="text-xs text-slate-400">No items yet.</p>}
      </div>
    </div>
  );
}
