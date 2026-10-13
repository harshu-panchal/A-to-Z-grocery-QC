import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, RefreshCw, AlertTriangle } from "lucide-react";
import PageHeader from "@shared/components/ui/PageHeader";
import Button from "@shared/components/ui/Button";
import Badge from "@shared/components/ui/Badge";
import { cn } from "@/lib/utils";
import { apiError } from "../posApi";
import { rupees, fmtDate, todayLocal } from "../posUtils";
import { downloadCsv } from "../posPrint";
import { usePosApi, StatTile, inputCls, Field } from "../PosComponents";

function useSellers(api, portal) {
  const [sellers, setSellers] = useState([]);
  useEffect(() => { if (portal === "admin") api.sellers().then(setSellers).catch(() => {}); }, [api, portal]);
  return sellers;
}

// ================================================================= expiry
export function PosExpiry({ portal }) {
  const api = usePosApi(portal);
  const sellers = useSellers(api, portal);
  const [days, setDays] = useState(30);
  const [sellerId, setSellerId] = useState("");
  const [data, setData] = useState({ items: [] });
  const load = useCallback(() => api.expiry({ days, sellerId: sellerId || undefined }).then(setData).catch((e) => toast.error(apiError(e))), [api, days, sellerId]);
  useEffect(() => { load(); }, [load]);
  const expired = data.items.filter((i) => i.daysLeft < 0);
  const soon = data.items.filter((i) => i.daysLeft >= 0 && i.daysLeft <= 7);
  return (
    <div className="space-y-4">
      <PageHeader title="Expiry alerts" description="Batches still in stock that expire soon. Batches come from purchase entries with a batch no. or expiry date; older stock is assumed sold first." />
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Show expiring within">
          <select className={inputCls} value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 15, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}</select>
        </Field>
        {portal === "admin" && <Field label="Store"><select className={inputCls} value={sellerId} onChange={(e) => setSellerId(e.target.value)}><option value="">All stores</option>{sellers.map((s) => <option key={s._id} value={s._id}>{s.shopName}</option>)}</select></Field>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Already expired" value={expired.length} sub={`${expired.reduce((s, i) => s + i.remaining, 0)} units`} tone="red" />
        <StatTile label="Within 7 days" value={soon.length} sub={`${soon.reduce((s, i) => s + i.remaining, 0)} units`} tone="amber" />
        <StatTile label={`Within ${days} days`} value={data.items.length} />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-3">Item</th><th className="p-3">Batch</th><th className="p-3">Rack</th><th className="p-3">Expiry</th><th className="p-3 text-right">Units left</th><th className="p-3">Status</th></tr></thead>
          <tbody>
            {data.items.map((i, idx) => (
              <tr key={idx} className="border-t border-slate-100">
                <td className="p-3 font-medium text-slate-800">{i.name}{i.variantName ? <span className="text-slate-500"> · {i.variantName}</span> : ""}{i.sellerName && portal === "admin" && <div className="text-xs text-slate-400">{i.sellerName}</div>}</td>
                <td className="p-3">{i.batchNo || "-"}</td>
                <td className="p-3 text-slate-500">{i.rackCode || "-"}</td>
                <td className="p-3">{fmtDate(i.expiry)}</td>
                <td className="p-3 text-right font-bold">{i.remaining}</td>
                <td className="p-3">{i.daysLeft < 0 ? <Badge variant="danger">Expired {-i.daysLeft}d ago</Badge> : i.daysLeft <= 7 ? <Badge variant="warning">{i.daysLeft} days left</Badge> : <Badge variant="secondary">{i.daysLeft} days left</Badge>}</td>
              </tr>
            ))}
            {!data.items.length && <tr><td colSpan={6} className="p-10 text-center text-slate-500">Nothing expiring in this period. Add a batch no./expiry in purchase entries to track it.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ================================================================ reorder
export function PosReorder({ portal }) {
  const api = usePosApi(portal);
  const sellers = useSellers(api, portal);
  const [opts, setOpts] = useState({ days: 30, leadDays: 7, all: false, sellerId: "" });
  const [result, setResult] = useState(null); // null until the first answer
  const data = result || { items: [] };
  const loading = result === null;
  const load = useCallback(() => {
    api.reorder({ ...opts, all: opts.all ? "true" : undefined, sellerId: opts.sellerId || undefined }).then(setResult).catch((e) => { toast.error(apiError(e)); setResult({ items: [] }); });
  }, [api, opts]);
  useEffect(() => { load(); }, [load]);
  const toOrder = data.items.filter((i) => i.suggest > 0);
  const exportCsv = () => downloadCsv(`reorder-${todayLocal()}.csv`, ["Item", "Variant", "Rack", "Stock", "Sold app", "Sold counter", "Per day", "Days left", "Order qty", "Est. cost"],
    toOrder.map((i) => [i.name, i.variantName, i.rackCode, i.stock, i.soldOnline, i.soldCounter, i.perDay, i.daysLeft ?? "", i.suggest, i.estCost]));
  return (
    <div className="space-y-4">
      <PageHeader title="Low stock & reorder" description="Based on what sold on the app and at the counter. Suggested quantity covers your supplier lead time plus a week of safety stock."
        actions={<><Button variant="outline" onClick={load}><RefreshCw size={15} /></Button><Button variant="outline" onClick={exportCsv} disabled={!toOrder.length}><Download size={15} className="mr-1" /> Order list (CSV)</Button></>} />
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Sales period"><select className={inputCls} value={opts.days} onChange={(e) => setOpts({ ...opts, days: Number(e.target.value) })}>{[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select></Field>
        <Field label="Supplier lead time"><select className={inputCls} value={opts.leadDays} onChange={(e) => setOpts({ ...opts, leadDays: Number(e.target.value) })}>{[1, 2, 3, 5, 7, 10, 14, 21].map((d) => <option key={d} value={d}>{d} days</option>)}</select></Field>
        {portal === "admin" && <Field label="Store"><select className={inputCls} value={opts.sellerId} onChange={(e) => setOpts({ ...opts, sellerId: e.target.value })}><option value="">All stores</option>{sellers.map((s) => <option key={s._id} value={s._id}>{s.shopName}</option>)}</select></Field>}
        <label className="mb-2 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={opts.all} onChange={(e) => setOpts({ ...opts, all: e.target.checked })} /> Show all items</label>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Out of stock" value={data.items.filter((i) => i.outOfStock).length} tone="red" />
        <StatTile label="Need reorder" value={toOrder.length} tone="amber" />
        <StatTile label="Est. order cost" value={rupees(toOrder.reduce((s, i) => s + i.estCost, 0))} sub="at purchase rate" />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-3">Item</th><th className="p-3">Rack</th><th className="p-3 text-right">Stock</th><th className="p-3 text-right">Sold (app / counter)</th><th className="p-3 text-right">Per day</th><th className="p-3 text-right">Days left</th><th className="p-3 text-right">Order</th></tr></thead>
          <tbody>
            {data.items.map((i) => (
              <tr key={`${i.productId}-${i.variantSku}`} className="border-t border-slate-100">
                <td className="p-3 font-medium text-slate-800">{i.name}{i.variantName ? <span className="text-slate-500"> · {i.variantName}</span> : ""}{portal === "admin" && i.sellerName && <div className="text-xs text-slate-400">{i.sellerName}</div>}</td>
                <td className="p-3 text-slate-500">{i.rackCode || "-"}</td>
                <td className={cn("p-3 text-right font-bold", i.outOfStock ? "text-red-600" : i.stock <= i.threshold ? "text-amber-600" : "")}>{i.stock}</td>
                <td className="p-3 text-right">{i.soldOnline} / {i.soldCounter}</td>
                <td className="p-3 text-right">{i.perDay}</td>
                <td className="p-3 text-right">{i.daysLeft === null ? "-" : i.daysLeft}</td>
                <td className="p-3 text-right">{i.suggest > 0 ? <b className="text-primary">{i.suggest}</b> : "-"}</td>
              </tr>
            ))}
            {!data.items.length && <tr><td colSpan={7} className="p-10 text-center text-slate-500">{loading ? "Calculating…" : "Nothing is running low."}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ======================================================= app vs counter
export function ChannelReport({ api, portal }) {
  const sellers = useSellers(api, portal);
  const month = todayLocal().slice(0, 8) + "01";
  const [f, setF] = useState({ from: month, to: todayLocal(), sellerId: "" });
  const [data, setData] = useState({ rows: [], totals: {} });
  useEffect(() => { api.channelReport({ ...f, sellerId: f.sellerId || undefined }).then(setData).catch((e) => toast.error(apiError(e))); }, [api, f]);
  const t = data.totals || {};
  const total = (t.onlineSales || 0) + (t.counterSales || 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="From"><input type="date" className={inputCls} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="To"><input type="date" className={inputCls} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        {portal === "admin" && <Field label="Store"><select className={inputCls} value={f.sellerId} onChange={(e) => setF({ ...f, sellerId: e.target.value })}><option value="">All stores</option>{sellers.map((s) => <option key={s._id} value={s._id}>{s.shopName}</option>)}</select></Field>}
        <Button variant="outline" className="ml-auto" onClick={() => downloadCsv(`app-vs-counter-${f.from}-${f.to}.csv`, ["Item", "Variant", "App units", "App sales", "Counter units", "Counter sales", "Total units", "Total sales"], data.rows.map((r) => [r.name, r.variantName, r.online, r.onlineSales, r.counter, r.counterSales, r.total, r.totalSales]))}><Download size={15} className="mr-1" /> CSV</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="App sales" value={rupees(t.onlineSales || 0)} sub={`${t.online || 0} units`} />
        <StatTile label="Counter sales" value={rupees(t.counterSales || 0)} sub={`${t.counter || 0} units`} />
        <StatTile label="Total" value={rupees(total)} tone="green" />
        <StatTile label="Counter share" value={`${total ? Math.round(((t.counterSales || 0) / total) * 100) : 0}%`} />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-3">Item</th><th className="p-3 text-right">App</th><th className="p-3 text-right">Counter</th><th className="p-3 text-right">Total</th><th className="p-3">Split</th></tr></thead>
          <tbody>
            {data.rows.map((r) => {
              const share = r.totalSales ? Math.round((r.onlineSales / r.totalSales) * 100) : 0;
              return (
                <tr key={`${r.productId}-${r.variantName}`} className="border-t border-slate-100">
                  <td className="p-3 font-medium text-slate-800">{r.name}{r.variantName ? <span className="text-slate-500"> · {r.variantName}</span> : ""}</td>
                  <td className="p-3 text-right">{r.online} · {rupees(r.onlineSales)}</td>
                  <td className="p-3 text-right">{r.counter} · {rupees(r.counterSales)}</td>
                  <td className="p-3 text-right font-bold">{rupees(r.totalSales)}</td>
                  <td className="p-3"><div className="flex h-2 w-32 overflow-hidden rounded-full bg-amber-200" title={`App ${share}% / Counter ${100 - share}%`}><div className="bg-primary" style={{ width: `${share}%` }} /></div></td>
                </tr>
              );
            })}
            {!data.rows.length && <tr><td colSpan={5} className="p-10 text-center text-slate-500">No sales in this period.</td></tr>}
          </tbody>
        </table>
        <p className="flex items-center gap-1 p-3 text-xs text-slate-500"><AlertTriangle size={12} /> Green = app, amber = counter. App sales exclude cancelled orders.</p>
      </div>
    </div>
  );
}
