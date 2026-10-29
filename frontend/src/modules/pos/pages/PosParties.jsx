import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Phone, FileText, Pencil, Trash2, Eye } from "lucide-react";
import PageHeader from "@shared/components/ui/PageHeader";
import Button from "@shared/components/ui/Button";
import Modal from "@shared/components/ui/Modal";
import Badge from "@shared/components/ui/Badge";
import { cn } from "@/lib/utils";
import { apiError } from "../posApi";
import { rupees, fmtDate, fmtDateTime } from "../posUtils";
import { downloadTablePdf } from "../posPrint";
import { usePosApi, usePosSettings, StatTile, Pager, inputCls, Field, CustomerFormModal, AmountModal } from "../PosComponents";
import { IconBtn, OrderViewModal } from "./PosReport";

const PAY_METHODS = ["Cash", "UPI", "Card", "Bank transfer"];
const balanceBadge = (bal, dueWord = "Due", advWord = "Advance") =>
  bal > 0.009 ? <Badge variant="danger">{dueWord} {rupees(bal)}</Badge> : bal < -0.009 ? <Badge variant="success">{advWord} {rupees(-bal)}</Badge> : <Badge variant="secondary">Settled</Badge>;

function FilterPills({ value, onChange, options }) {
  return (
    <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
      {options.map(([k, label]) => <button key={k} type="button" onClick={() => onChange(k)} className={cn("rounded-lg px-3 py-1.5", value === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>{label}</button>)}
    </div>
  );
}

// ================================================================ customers
export function PosCustomers({ portal }) {
  const api = usePosApi(portal);
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], totals: {}, totalPages: 1 });
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => api.customers({ search, filter, page, limit: 50 }).then(setData).catch((e) => toast.error(apiError(e))), [api, search, filter, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  return (
    <div className="space-y-4">
      <PageHeader title="Customers & Udhaar" description="Store customers and the money they owe." actions={<Button onClick={() => setAdding(true)}><Plus size={16} className="mr-1" /> New customer</Button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Total udhaar (due)" value={rupees(data.totals?.due || 0)} tone="red" />
        <StatTile label="Advances held" value={rupees(data.totals?.advance || 0)} tone="green" />
        <StatTile label="Customers" value={data.total ?? 0} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input className={cn(inputCls, "max-w-xs")} placeholder="Search name, phone, GSTIN" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
        <FilterPills value={filter} onChange={(v) => { setPage(1); setFilter(v); }} options={[["all", "All"], ["due", "Has due"], ["advance", "Has advance"]]} />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-3">Name</th><th className="p-3">Phone</th><th className="p-3">GSTIN</th><th className="p-3">Balance</th><th className="p-3">Updated</th></tr></thead>
          <tbody>
            {data.items.map((c) => (
              <tr key={c._id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => navigate(`/${portal}/pos/customers/${c._id}`)}>
                <td className="p-3 font-semibold text-slate-800">{c.name}</td><td className="p-3">{c.phone || "-"}</td><td className="p-3">{c.gstin || "-"}</td><td className="p-3">{balanceBadge(c.creditBalance)}</td><td className="p-3 text-slate-500">{fmtDate(c.updatedAt)}</td>
              </tr>
            ))}
            {!data.items.length && <tr><td colSpan={5} className="p-10 text-center text-slate-500">No customers yet.</td></tr>}
          </tbody>
        </table>
        <Pager page={page} totalPages={data.totalPages} onPage={setPage} />
      </div>
      <CustomerFormModal api={api} isOpen={adding} onClose={() => setAdding(false)} onSaved={load} />
    </div>
  );
}

const CREDIT_LABEL = { sale: "Udhaar bill", payment: "Payment received", add: "Due added", advance: "Advance taken", adjust: "Bill edited", reversal: "Bill cancelled" };

export function PosCustomerDetail({ portal }) {
  const api = usePosApi(portal);
  const [settings] = usePosSettings(api);
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [orders, setOrders] = useState({ items: [], totalPages: 1 });
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null); // pay | due | advance | edit
  const [view, setView] = useState(null);
  const load = useCallback(() => api.getCustomer(id).then(setData).catch((e) => toast.error(apiError(e))), [api, id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.customerOrders(id, { page, limit: 10 }).then(setOrders).catch(() => {}); }, [api, id, page]);
  if (!data) return <p className="p-6 text-slate-500">Loading…</p>;
  const { customer, ledger, stats } = data;

  const remove = async () => {
    if (!window.confirm(`Delete ${customer.name}?`)) return;
    try { await api.deleteCustomer(id); toast.success("Customer deleted"); navigate(`/${portal}/pos/customers`); } catch (e) { toast.error(apiError(e)); }
  };
  const statement = () => downloadTablePdf({
    title: `Udhaar statement — ${customer.name}`,
    subtitle: `${customer.phone || ""} · Balance ${rupees(customer.creditBalance)} · ${new Date().toLocaleDateString("en-IN")}`,
    head: ["Date", "Entry", "Amount", "Balance", "Note"],
    body: [...ledger].reverse().map((t) => [fmtDateTime(t.createdAt), CREDIT_LABEL[t.type] || t.type, t.amount.toFixed(2), t.balanceAfter.toFixed(2), [t.method, t.note].filter(Boolean).join(" · ")]),
    fileName: `udhaar-${customer.name}.pdf`,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title={customer.name}
        description={<span className="flex flex-wrap items-center gap-3">{customer.phone && <a href={`tel:${customer.phone}`} className="flex items-center gap-1 text-primary"><Phone size={13} /> {customer.phone}</a>}{customer.gstin && <span>GSTIN {customer.gstin}</span>}{customer.address && <span>{customer.address}</span>}</span>}
        actions={<>
          <Button variant="outline" onClick={() => setDialog("edit")}><Pencil size={15} className="mr-1" /> Edit</Button>
          <Button variant="outline" onClick={statement}><FileText size={15} className="mr-1" /> Statement</Button>
          <Button variant="outline" onClick={remove}><Trash2 size={15} /></Button>
        </>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={customer.creditBalance >= 0 ? "Udhaar due" : "Advance"} value={rupees(Math.abs(customer.creditBalance))} tone={customer.creditBalance > 0 ? "red" : "green"} />
        <StatTile label="Bills" value={stats.bills} />
        <StatTile label="Total spent" value={rupees(stats.spent)} />
        <StatTile label="Last bill" value={stats.lastBill ? fmtDate(stats.lastBill) : "-"} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setDialog("pay")}>Receive payment</Button>
        <Button variant="outline" onClick={() => setDialog("due")}>Add old due</Button>
        <Button variant="outline" onClick={() => setDialog("advance")}>Take advance</Button>
        <Link to={`/${portal}/pos`} className="ml-auto text-sm font-semibold text-primary underline">New bill</Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <p className="border-b border-slate-100 p-3 text-sm font-bold">Udhaar ledger</p>
          <div className="max-h-[480px] overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {ledger.map((t) => (
                  <tr key={t._id} className="border-b border-slate-50">
                    <td className="p-3"><p className="font-medium text-slate-800">{CREDIT_LABEL[t.type] || t.type}</p><p className="text-xs text-slate-400">{fmtDateTime(t.createdAt)}{t.method ? ` · ${t.method}` : ""}{t.note ? ` · ${t.note}` : ""}</p></td>
                    <td className={cn("p-3 text-right font-bold", t.amount > 0 ? "text-red-600" : "text-emerald-700")}>{t.amount > 0 ? "+" : "−"}{rupees(Math.abs(t.amount))}</td>
                    <td className="p-3 text-right text-xs text-slate-500">Bal {rupees(t.balanceAfter)}</td>
                  </tr>
                ))}
                {!ledger.length && <tr><td className="p-8 text-center text-slate-500">No udhaar entries.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <p className="border-b border-slate-100 p-3 text-sm font-bold">Bills</p>
          <table className="w-full text-sm">
            <tbody>
              {orders.items.map((o) => (
                <tr key={o._id} className="border-b border-slate-50">
                  <td className="p-3"><p className="font-medium">{o.invoiceNumber}</p><p className="text-xs text-slate-400">{fmtDateTime(o.createdAt)} · {o.paymentMethod}</p></td>
                  <td className="p-3">{o.status === "cancelled" ? <Badge variant="danger">cancelled</Badge> : null}</td>
                  <td className="p-3 text-right font-bold">{rupees(o.total)}</td>
                  <td className="p-3 text-right"><IconBtn title="View" onClick={() => setView(o)}><Eye size={15} /></IconBtn></td>
                </tr>
              ))}
              {!orders.items.length && <tr><td className="p-8 text-center text-slate-500">No bills yet.</td></tr>}
            </tbody>
          </table>
          <Pager page={page} totalPages={orders.totalPages} onPage={setPage} />
        </div>
      </div>

      <AmountModal isOpen={dialog === "pay"} onClose={() => setDialog(null)} title="Receive payment" methods={PAY_METHODS} submitLabel="Receive"
        onSubmit={async (f) => { await api.receivePayment({ customerId: id, amount: f.amount, method: f.method, reference: f.reference, note: f.note }); toast.success("Payment received"); load(); }} />
      <AmountModal isOpen={dialog === "due"} onClose={() => setDialog(null)} title="Add old due (udhaar)"
        onSubmit={async (f) => { await api.addCredit({ customerId: id, amount: f.amount, kind: "due", note: f.note || f.reference }); toast.success("Due added"); load(); }} />
      <AmountModal isOpen={dialog === "advance"} onClose={() => setDialog(null)} title="Take advance" methods={PAY_METHODS}
        onSubmit={async (f) => { await api.addCredit({ customerId: id, amount: f.amount, kind: "advance", method: f.method, note: f.note || f.reference }); toast.success("Advance recorded"); load(); }} />
      <CustomerFormModal api={api} isOpen={dialog === "edit"} initial={customer} onClose={() => setDialog(null)} onSaved={load} />
      {view && <OrderViewModal order={view} bill={settings.bill} onClose={() => setView(null)} />}
    </div>
  );
}

// ================================================================ suppliers
export function SupplierFormModal({ api, isOpen, onClose, onSaved, initial }) {
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (isOpen) setForm({ name: "", phone: "", email: "", address: "", gstin: "", notes: "", openingBalance: "", ...(initial || {}) }); }, [isOpen, initial]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    if (!form.name?.trim()) return toast.error("Supplier name is required");
    setBusy(true);
    try {
      const s = initial?._id ? await api.updateSupplier(initial._id, form) : await api.createSupplier(form);
      toast.success("Supplier saved");
      onSaved?.(s);
      onClose();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initial?._id ? "Edit supplier" : "New supplier"}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} isLoading={busy}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name *"><input className={inputCls} value={form.name || ""} onChange={set("name")} autoFocus /></Field>
        <Field label="Phone"><input className={inputCls} value={form.phone || ""} onChange={set("phone")} /></Field>
        <Field label="GSTIN"><input className={inputCls} value={form.gstin || ""} onChange={set("gstin")} /></Field>
        <Field label="Email"><input className={inputCls} value={form.email || ""} onChange={set("email")} /></Field>
        <Field label="Address" className="sm:col-span-2"><input className={inputCls} value={form.address || ""} onChange={set("address")} /></Field>
        {!initial?._id && <Field label="Opening balance (₹ you owe)"><input className={inputCls} type="number" value={form.openingBalance || ""} onChange={set("openingBalance")} /></Field>}
        <Field label="Notes"><input className={inputCls} value={form.notes || ""} onChange={set("notes")} /></Field>
      </div>
    </Modal>
  );
}

export function PosSuppliers({ portal }) {
  const api = usePosApi(portal);
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], totals: {}, totalPages: 1 });
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => api.suppliers({ search, filter, page, limit: 50 }).then(setData).catch((e) => toast.error(apiError(e))), [api, search, filter, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  return (
    <div className="space-y-4">
      <PageHeader title="Suppliers" description="Who you buy from and what you owe them." actions={<Button onClick={() => setAdding(true)}><Plus size={16} className="mr-1" /> New supplier</Button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="You owe" value={rupees(data.totals?.payable || 0)} tone="red" />
        <StatTile label="Advance paid" value={rupees(data.totals?.advance || 0)} tone="green" />
        <StatTile label="Suppliers" value={data.total ?? 0} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input className={cn(inputCls, "max-w-xs")} placeholder="Search name, phone, GSTIN" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
        <FilterPills value={filter} onChange={(v) => { setPage(1); setFilter(v); }} options={[["all", "All"], ["due", "You owe"], ["advance", "Advance paid"]]} />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-3">Name</th><th className="p-3">Phone</th><th className="p-3">GSTIN</th><th className="p-3">Balance</th></tr></thead>
          <tbody>
            {data.items.map((s) => (
              <tr key={s._id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => navigate(`/${portal}/pos/suppliers/${s._id}`)}>
                <td className="p-3 font-semibold text-slate-800">{s.name}</td><td className="p-3">{s.phone || "-"}</td><td className="p-3">{s.gstin || "-"}</td><td className="p-3">{balanceBadge(s.balance, "You owe", "Advance")}</td>
              </tr>
            ))}
            {!data.items.length && <tr><td colSpan={4} className="p-10 text-center text-slate-500">No suppliers yet.</td></tr>}
          </tbody>
        </table>
        <Pager page={page} totalPages={data.totalPages} onPage={setPage} />
      </div>
      <SupplierFormModal api={api} isOpen={adding} onClose={() => setAdding(false)} onSaved={load} />
    </div>
  );
}

const SUP_LABEL = { purchase: "Purchase bill", debt: "Bill added", payment: "Payment made", adjust: "Adjustment" };

export function PosSupplierDetail({ portal }) {
  const api = usePosApi(portal);
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [dialog, setDialog] = useState(null);
  const load = useCallback(() => api.getSupplier(id).then(setData).catch((e) => toast.error(apiError(e))), [api, id]);
  useEffect(() => { load(); }, [load]);
  if (!data) return <p className="p-6 text-slate-500">Loading…</p>;
  const { supplier, ledger } = data;
  const remove = async () => {
    if (!window.confirm(`Delete ${supplier.name}?`)) return;
    try { await api.deleteSupplier(id); toast.success("Supplier deleted"); navigate(`/${portal}/pos/suppliers`); } catch (e) { toast.error(apiError(e)); }
  };
  const undo = async (t) => {
    const what = t.type === "payment" ? `payment of ${rupees(Math.abs(t.amount))}` : `bill amount of ${rupees(t.amount)}`;
    if (!window.confirm(`Undo this ${what}? An opposite entry is added and the balance goes back.`)) return;
    try { await api.reverseSupplierTxn(id, t._id); toast.success("Entry undone"); load(); } catch (e) { toast.error(apiError(e)); }
  };
  const after = (delta) => {
    const v = Math.round((supplier.balance + delta) * 100) / 100;
    const label = v > 0.004 ? ["You owe", "text-red-600"] : v < -0.004 ? ["Advance paid", "text-emerald-700"] : ["Settled", "text-slate-600"];
    return (
      <div className="rounded-lg border border-slate-100 p-3 text-sm">
        <div className="flex justify-between text-slate-600"><span>Now: {supplier.balance > 0.004 ? "You owe" : supplier.balance < -0.004 ? "Advance paid" : "Settled"}</span><span>{rupees(Math.abs(supplier.balance))}</span></div>
        <div className="flex justify-between font-bold"><span>After: {label[0]}</span><span className={label[1]}>{rupees(Math.abs(v))}</span></div>
      </div>
    );
  };
  const statement = () => downloadTablePdf({
    title: `Supplier statement — ${supplier.name}`,
    subtitle: `${supplier.gstin ? `GSTIN ${supplier.gstin} · ` : ""}Balance ${rupees(supplier.balance)} · ${new Date().toLocaleDateString("en-IN")}`,
    head: ["Date", "Entry", "Reference", "Amount", "Balance", "Note"],
    body: [...ledger].reverse().map((t) => [fmtDate(t.date), SUP_LABEL[t.type] || t.type, t.reference || "", t.amount.toFixed(2), t.balanceAfter.toFixed(2), [t.method, t.note].filter(Boolean).join(" · ")]),
    fileName: `supplier-${supplier.name}.pdf`,
  });
  return (
    <div className="space-y-4">
      <PageHeader title={supplier.name} description={[supplier.phone, supplier.gstin && `GSTIN ${supplier.gstin}`, supplier.address].filter(Boolean).join(" · ")}
        actions={<>
          <Button variant="outline" onClick={() => setDialog("edit")}><Pencil size={15} className="mr-1" /> Edit</Button>
          <Button variant="outline" onClick={statement}><FileText size={15} className="mr-1" /> Statement</Button>
          <Button variant="outline" onClick={remove}><Trash2 size={15} /></Button>
        </>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label={supplier.balance >= 0 ? "You owe" : "Advance paid"} value={rupees(Math.abs(supplier.balance))} tone={supplier.balance > 0 ? "red" : "green"} />
        <StatTile label="Entries" value={ledger.length} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setDialog("pay")}>Pay supplier (you owe −)</Button>
        <Button variant="outline" onClick={() => setDialog("debt")}>Add bill without entry (you owe +)</Button>
        <Button variant="outline" onClick={() => navigate(`/${portal}/pos/purchases/new?type=purchase&supplier=${id}`)}>New purchase entry</Button>
      </div>
      {data.supplied?.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
          <p className="px-4 pt-4 font-bold text-slate-800">Products supplied</p>
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-3">Product</th><th className="p-3 text-right">Total received</th><th className="p-3 text-right">Deliveries</th><th className="p-3 text-right">Last rate</th><th className="p-3">Last received</th></tr></thead>
            <tbody>
              {data.supplied.map((s) => (
                <tr key={`${s.productId}-${s.variantSku}-${s.name}`} className="border-t border-slate-100">
                  <td className="p-3 font-medium text-slate-800">{s.name}{s.variantName ? <span className="text-slate-500"> · {s.variantName}</span> : ""}</td>
                  <td className="p-3 text-right font-bold">{s.quantity}</td>
                  <td className="p-3 text-right text-slate-600">{s.deliveries}</td>
                  <td className="p-3 text-right text-slate-600">{s.lastRate ? rupees(s.lastRate) : "-"}</td>
                  <td className="p-3 text-slate-600">{fmtDate(s.lastDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Entry</th><th className="p-3">Reference</th><th className="p-3 text-right">Amount</th><th className="p-3 text-right">Balance</th></tr></thead>
          <tbody>
            {ledger.map((t) => (
              <tr key={t._id} className="border-t border-slate-100">
                <td className="p-3 text-slate-600">{fmtDate(t.date)}</td>
                <td className="p-3">
                  <p className={cn("font-medium", t.reversedBy && "text-slate-400 line-through")}>{SUP_LABEL[t.type] || t.type}</p>
                  {(t.method || t.note) && <p className="text-xs text-slate-400">{[t.method, t.note].filter(Boolean).join(" · ")}</p>}
                  {t.reversedBy && <p className="text-xs font-semibold text-amber-600">Undone</p>}
                  {!t.reversedBy && !t.purchaseEntry && ["payment", "debt"].includes(t.type) && (
                    <button type="button" className="text-xs font-semibold text-red-600 underline" onClick={() => undo(t)}>Undo (entered by mistake)</button>
                  )}
                </td>
                <td className="p-3">{t.purchaseEntry ? <Link className="text-primary underline" to={`/${portal}/pos/purchases/${t.purchaseEntry}`}>{t.reference || "Purchase"}</Link> : t.reference || "-"}</td>
                <td className={cn("p-3 text-right font-bold", t.amount > 0 ? "text-red-600" : "text-emerald-700")}>{t.amount > 0 ? "+" : "−"}{rupees(Math.abs(t.amount))}</td>
                <td className="p-3 text-right text-slate-600">{t.balanceAfter < 0 ? <span className="text-emerald-700">{rupees(-t.balanceAfter)} advance</span> : rupees(t.balanceAfter)}</td>
              </tr>
            ))}
            {!ledger.length && <tr><td colSpan={5} className="p-10 text-center text-slate-500">No entries yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <AmountModal isOpen={dialog === "pay"} onClose={() => setDialog(null)} title="Pay supplier" methods={PAY_METHODS} showDate submitLabel="Record payment"
        hint="Money you gave the supplier. It reduces what you owe; paying more than you owe leaves an advance."
        preview={(amt) => after(-amt)}
        onSubmit={async (f) => { await api.paySupplier(id, { amount: f.amount, method: f.method, reference: f.reference, note: f.note, date: f.date || undefined }); toast.success("Payment recorded"); load(); }} />
      <AmountModal isOpen={dialog === "debt"} onClose={() => setDialog(null)} title="Add bill without a purchase entry" showDate submitLabel="Add to what I owe"
        hint="Only for a supplier bill you did not enter in Purchase Entries. This INCREASES what you owe. To record money you paid, use Pay supplier."
        preview={(amt) => after(amt)}
        onSubmit={async (f) => { await api.supplierDebt(id, { amount: f.amount, reference: f.reference, note: f.note, date: f.date || undefined }); toast.success("Bill added"); load(); }} />
      <SupplierFormModal api={api} isOpen={dialog === "edit"} initial={supplier} onClose={() => setDialog(null)} onSaved={load} />
    </div>
  );
}
