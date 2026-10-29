import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Search, ScanLine, Plus, Minus, Trash2, X, Printer, FileText, PauseCircle, ShoppingCart, PackagePlus, TrendingUp } from "lucide-react";
import Button from "@shared/components/ui/Button";
import Modal from "@shared/components/ui/Modal";
import { cn } from "@/lib/utils";
import { apiError } from "../posApi";
import { useStaffAccess } from "@/modules/staff/staffAccess";
import { useFillViewport } from "../useFillViewport";
import {
  rupees, round2, WALK_IN, lineFromRow, lineTotal, billTotals, toApiLine, linesFromOrder,
  storageKey, loadLocal, saveLocal,
} from "../posUtils";
import { printReceipt, downloadInvoicePdf } from "../posPrint";
import { cacheRows, searchCache, isNetworkError, queueBill, loadQueue, syncQueue, newClientRef, parseScaleBarcode } from "../posOffline";
import {
  usePosApi, usePosSettings, useBarcodeWedge, BarcodeScannerModal, CustomerPicker, QuickAddModal, inputCls,
} from "../PosComponents";

const newBill = (n = 1) => ({ id: `b${Date.now()}${Math.random().toString(36).slice(2, 5)}`, name: `Bill ${n}`, items: [], customer: null, billDiscount: 0, priceMode: "retail" });

export default function PosTerminal({ portal }) {
  const api = usePosApi(portal);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [settings] = usePosSettings(api);
  const LS_BILLS = storageKey(portal, "bills");
  const LS_ACTIVE = storageKey(portal, "active_bill");

  // ------------------------------------------------------------ bill tabs
  const [bills, setBills] = useState(() => {
    const saved = loadLocal(LS_BILLS, null);
    return Array.isArray(saved) && saved.length ? saved : [newBill(1)];
  });
  const [activeId, setActiveId] = useState(() => loadLocal(LS_ACTIVE, null));
  const active = bills.find((b) => b.id === activeId) || bills[0];
  const serverLoaded = useRef(false);

  // Server copy of open bills (lets the counter continue on another device)
  useEffect(() => {
    api.getState().then((s) => {
      if (!serverLoaded.current && Array.isArray(s?.bills) && s.bills.length && !loadLocal(LS_BILLS, null)?.some((b) => b.items?.length)) {
        setBills(s.bills);
        if (s.activeBillId) setActiveId(s.activeBillId);
      }
    }).catch(() => {}).finally(() => { serverLoaded.current = true; });
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    saveLocal(LS_BILLS, bills);
    saveLocal(LS_ACTIVE, active?.id);
    if (!serverLoaded.current) return undefined;
    const t = setTimeout(() => api.saveState({ bills: bills.filter((b) => !b.editOrderId), activeBillId: active?.id }).catch(() => {}), 800);
    return () => clearTimeout(t);
  }, [bills, active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateActive = useCallback((fn) => setBills((all) => all.map((b) => (b.id === (active?.id) ? fn(b) : b))), [active?.id]);
  const addTab = (bill) => {
    const b = bill || newBill(bills.length + 1);
    setBills((all) => [...all, b]);
    setActiveId(b.id);
    return b;
  };
  const closeTab = (id) => {
    const bill = bills.find((b) => b.id === id);
    if (bill?.items?.length && !window.confirm(`Close "${bill.name}"? Its ${bill.items.length} item(s) will be removed.`)) return;
    setBills((all) => {
      const rest = all.filter((b) => b.id !== id);
      return rest.length ? rest : [newBill(1)];
    });
  };

  // --------------------------------------------------- deep links (edit/quote)
  useEffect(() => {
    const editId = params.get("edit");
    const quoteId = params.get("quotation");
    if (!editId && !quoteId) return;
    (async () => {
      try {
        if (editId) {
          const order = await api.getOrder(editId);
          const existing = bills.find((b) => b.editOrderId === editId);
          if (existing) setActiveId(existing.id);
          else addTab({ ...newBill(), name: `Edit ${order.invoiceNumber}`, editOrderId: editId, items: linesFromOrder(order), billDiscount: order.billDiscount || 0, customer: order.customer || null, paymentMethod: order.paymentMethod });
        } else {
          const q = await api.getEntry(quoteId);
          const lines = (q.data?.lines || []).map((l) => ({ ...lineFromRow({ productId: l.productId, variantSku: l.variantSku, variantName: l.variantName, name: l.name, price: l.price, mrp: l.mrp, gstRate: l.gstRate, hsnCode: l.hsnCode }), quantity: Number(l.quantity) || 1 }));
          addTab({ ...newBill(), name: `Quote ${q.number}`, quotationId: q._id, items: lines, customer: q.customer || null });
        }
      } catch (err) {
        toast.error(apiError(err, "Could not open that bill"));
      } finally {
        setParams({}, { replace: true });
      }
    })();
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  // --------------------------------------------------------- catalogue
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sellerFilter, setSellerFilter] = useState("");
  const [sellers, setSellers] = useState([]);
  const searchRef = useRef(null);

  useEffect(() => {
    if (portal === "admin") api.sellers().then((s) => setSellers(s || [])).catch(() => {});
  }, [api, portal]);

  // ------------------------------------------------------------ offline
  const [online, setOnline] = useState(() => navigator.onLine);
  const [queued, setQueued] = useState(() => loadQueue(portal).length);
  const syncNow = useCallback(async (quiet = false) => {
    if (!loadQueue(portal).length) return;
    const r = await syncQueue(portal, api);
    setQueued(r.left);
    if (r.synced) toast.success(`${r.synced} offline bill(s) uploaded`);
    if (r.failed && !quiet) toast.error(`${r.failed} offline bill(s) need attention`);
  }, [api, portal]);
  useEffect(() => {
    const up = () => { setOnline(true); syncNow(true); };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    syncNow(true);
    const t = setInterval(() => syncNow(true), 30000);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); clearInterval(t); };
  }, [syncNow]);

  useEffect(() => {
    setSearching(true);
    // out-of-stock items stay hidden until the cashier searches for them
    const inStock = (rows) => (query.trim() ? rows || [] : (rows || []).filter((r) => r.stock == null || r.stock > 0));
    const t = setTimeout(() => {
      api.searchProducts({ search: query, sellerId: sellerFilter || undefined, limit: 48 })
        .then((rows) => { setResults(inStock(rows)); cacheRows(portal, rows); setOnline(true); })
        .catch((err) => {
          // no internet: search the products saved on this device
          if (isNetworkError(err)) { setOnline(false); setResults(inStock(searchCache(portal, { search: query }))); }
          else setResults([]);
        })
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query, sellerFilter, api, portal]);

  // --------------------------------------------------------------- cart
  const staffAccess = useStaffAccess();
  const isStaff = staffAccess.isStaff;
  const addRow = useCallback((row, qty = 1) => {
    if (!active) return;
    updateActive((b) => {
      // staff always bill at the shop price (wholesale is owner-only)
      const line = lineFromRow(row, { priceType: isStaff ? "retail" : b.priceMode, quantity: qty });
      const existing = row.productId && b.items.find((l) => l.id === line.id);
      if (existing) {
        const nextQty = Number(existing.quantity) + qty;
        if (existing.stock != null && nextQty > existing.stock) toast.warning(`Only ${existing.stock} in stock for ${existing.name}`);
        return { ...b, items: b.items.map((l) => (l.id === line.id ? { ...l, quantity: nextQty } : l)) };
      }
      if (line.stock != null && line.stock < qty) toast.warning(`${line.name}: only ${line.stock} in stock`);
      return { ...b, items: [line, ...b.items] };
    });
  }, [active, updateActive, isStaff]);

  const setLine = (id, patch) => updateActive((b) => ({ ...b, items: b.items.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const removeLine = (id) => updateActive((b) => ({ ...b, items: b.items.filter((l) => l.id !== id) }));
  const setPriceMode = (mode) => updateActive((b) => ({
    ...b,
    priceMode: mode,
    items: b.items.map((l) => {
      if (!l.productId || l.priceType === "custom") return l;
      const wholesale = mode === "wholesale" && Number(l.wholesalePrice) > 0;
      return { ...l, priceType: wholesale ? "wholesale" : "retail", price: wholesale ? l.wholesalePrice : l.retailPrice };
    }),
  }));

  const totals = useMemo(() => billTotals(active?.items || [], active?.billDiscount), [active]);
  // Staff only get the extras the owner switched on; owners always have them.
  const canSeeCost = staffAccess.special("pos.cost");
  const canQuickAdd = staffAccess.special("pos.quickadd");
  const canChangePrice = staffAccess.special("pos.price");
  const rootRef = useRef(null);
  const fill = useFillViewport(rootRef);
  const [showProfit, setShowProfit] = useState(false);
  // phones show either the item grid or the bill
  const [mobileView, setMobileView] = useState("items");

  // ----------------------------------------------------------- scanning
  const [scannerOpen, setScannerOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState({ open: false, barcode: "" });
  const lookupCode = useCallback(async (code) => {
    try {
      const rows = await api.searchProducts({ barcode: code, sellerId: sellerFilter || undefined });
      cacheRows(portal, rows);
      return rows || [];
    } catch (err) {
      if (isNetworkError(err)) { setOnline(false); return searchCache(portal, { barcode: code }); }
      throw err;
    }
  }, [api, sellerFilter, portal]);

  const handleCode = useCallback(async (code) => {
    try {
      let rows = await lookupCode(code);
      // loose items: barcode printed by the weighing scale (PLU + weight/price)
      const scale = !rows.length ? parseScaleBarcode(code, settings.bill?.scale) : null;
      if (scale) {
        rows = await lookupCode(scale.plu);
        if (rows.length === 1) {
          const qty = scale.quantity ?? round2(scale.amount / (Number(rows[0].price) || 1));
          addRow(rows[0], qty);
          toast.success(`Added ${rows[0].name} — ${qty} ${scale.quantity ? "kg" : "units"}`, { id: "pos-scan" });
          return;
        }
      }
      if (rows?.length === 1) {
        addRow(rows[0]);
        toast.success(`Added ${rows[0].name}`, { id: "pos-scan" });
      } else if (rows?.length > 1) {
        setQuery(code);
        toast.info("Several items match this code; pick one");
      } else {
        if (canQuickAdd) {
          toast.info("No item with this barcode — add it now");
          setQuickAdd({ open: true, barcode: code });
        } else {
          toast.error("No item with this barcode");
        }
      }
    } catch (err) {
      toast.error(apiError(err));
    }
  }, [lookupCode, addRow, settings.bill?.scale, canQuickAdd]);
  useBarcodeWedge(handleCode, !scannerOpen && !quickAdd.open);

  const onSearchKey = (e) => {
    if (e.key !== "Enter") return;
    const term = query.trim();
    if (!term) return;
    const exact = results.filter((r) => r.barcode === term || r.sku === term);
    if (exact.length === 1) { addRow(exact[0]); setQuery(""); }
    else if (results.length === 1) { addRow(results[0]); setQuery(""); }
    else if (/^\d{6,}$/.test(term)) { handleCode(term); setQuery(""); }
  };

  // ------------------------------------------------------------ checkout
  const [payOpen, setPayOpen] = useState(false);
  const [done, setDone] = useState(null); // saved order

  const startPay = () => {
    if (!active?.items.length) return toast.error("Add items first");
    if (active.items.some((l) => !(Number(l.quantity) > 0))) return toast.error("Every item needs a quantity");
    setPayOpen(true);
  };

  const finishBill = (order) => {
    setPayOpen(false);
    setDone(order);
    setMobileView("items");
    // reset the tab for the next customer
    updateActive((b) => ({ ...newBill(), id: b.id, name: b.editOrderId || b.quotationId ? `Bill ${bills.length}` : b.name, priceMode: b.priceMode }));
  };

  const previewReceipt = () => {
    if (!active?.items.length) return toast.error("Add items first");
    printReceipt({
      _preview: true,
      invoiceNumber: "ESTIMATE",
      createdAt: new Date(),
      customerSnapshot: { name: active.customer?.name || "Walk-in Customer", phone: active.customer?.phone },
      items: active.items.map((l) => ({ ...l, unitPrice: l.price, total: lineTotal(l) })),
      ...totals,
      billDiscount: totals.discount,
      paymentMethod: "-",
    }, settings.bill);
  };

  // ------------------------------------------------------------- render
  return (
    <div
      ref={rootRef}
      style={fill ? { height: fill.height, paddingTop: fill.shiftTop || undefined } : { minHeight: "calc(100vh - 64px)" }}
      className="-m-4 flex flex-col overflow-hidden bg-slate-50 md:-m-6 lg:flex-row"
    >
      {/* ---------------- catalogue: search stays on top, the items scroll ---------------- */}
      <section className={cn("min-h-0 min-w-0 flex-1 flex-col border-slate-200 lg:flex lg:border-r", mobileView === "items" ? "flex" : "hidden")}>
        <div className="shrink-0 space-y-3 border-b border-slate-200 bg-white p-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                className={cn(inputCls, "h-11 pl-9 text-base")}
                placeholder="Search name, SKU or scan barcode…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKey}
                autoFocus
              />
            </div>
            <Button variant="outline" className="h-11" onClick={() => setScannerOpen(true)} title="Scan with camera"><ScanLine size={18} /></Button>
            {canQuickAdd && <Button variant="outline" className="h-11" onClick={() => setQuickAdd({ open: true, barcode: "" })} title="Quick add item"><PackagePlus size={18} /></Button>}
          </div>
          {portal === "admin" && (
            <select className={cn(inputCls, "h-9")} value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)}>
              <option value="">All stores</option>
              {sellers.map((s) => <option key={s._id} value={s._id}>{s.shopName || s.name}</option>)}
            </select>
          )}
        </div>
        {(!online || queued > 0) && (
          <div className={cn("flex shrink-0 items-center justify-between gap-2 px-3 py-2 text-xs font-semibold", online ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700")}>
            <span>{online ? "" : "Offline — billing continues; bills are saved on this device. "}{queued > 0 ? `${queued} bill(s) waiting to upload.` : ""}</span>
            {queued > 0 && online && <button type="button" className="underline" onClick={() => syncNow()}>Upload now</button>}
          </div>
        )}
        <div data-lenis-prevent className="grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-2 overflow-y-auto overscroll-contain p-3 sm:grid-cols-3 xl:grid-cols-4">
          {results.map((r) => (
            <button
              key={`${r.productId}-${r.variantSku}`}
              type="button"
              onClick={() => addRow(r)}
              className={cn("flex flex-col rounded-xl border bg-white p-2 text-left transition hover:border-primary hover:shadow-md", r.stock <= 0 ? "border-red-100 opacity-70" : "border-slate-200")}
            >
              <div className="mb-2 grid h-20 place-items-center overflow-hidden rounded-lg bg-slate-50">
                {r.image ? <img src={r.image} alt="" className="h-full w-full object-contain" loading="lazy" /> : <ShoppingCart className="text-slate-300" />}
              </div>
              <p className="line-clamp-2 text-sm font-semibold leading-tight text-slate-800">{r.name}</p>
              {r.variantName && <p className="text-xs text-slate-500">{r.variantName}</p>}
              {portal === "admin" && r.sellerName && <p className="truncate text-[10px] text-slate-400">{r.sellerName}</p>}
              <div className="mt-auto flex items-end justify-between pt-1">
                <span className="text-sm font-bold text-slate-900">{rupees(r.price)}</span>
                <span className={cn("text-[10px] font-semibold", r.stock <= 0 ? "text-red-600" : r.stock <= 5 ? "text-amber-600" : "text-slate-400")}>
                  {r.stock <= 0 ? "Out of stock" : `${r.stock} left`}
                </span>
              </div>
              <div className="flex justify-between text-[10px]">
                {r.heldQty > 0 ? <span className="font-semibold text-sky-700" title="Units in app orders not yet dispatched">{r.heldQty} on app orders</span> : <span />}
                {r.rackCode && <span className="text-violet-600">Rack {r.rackCode}</span>}
              </div>
            </button>
          ))}
          {!results.length && !searching && (
            <div className="col-span-full py-16 text-center text-sm text-slate-500">
              No items found.{canQuickAdd && <> <button type="button" className="font-semibold text-primary underline" onClick={() => setQuickAdd({ open: true, barcode: "" })}>Quick add one</button></>}
            </div>
          )}
        </div>
        {active?.items.length > 0 && (
          <button type="button" onClick={() => setMobileView("bill")} className="mx-3 mb-3 flex shrink-0 items-center justify-between rounded-xl bg-primary px-4 py-3 text-white shadow-lg lg:hidden">
            <span className="text-sm font-semibold">{round2(totals.itemCount)} item(s) in bill</span>
            <span className="text-base font-bold">{rupees(totals.total)} →</span>
          </button>
        )}
      </section>

      {/* ---------------- bill ---------------- */}
      <section className={cn("min-h-0 w-full flex-1 flex-col bg-white lg:flex lg:w-[440px] lg:flex-none xl:w-[480px]", mobileView === "bill" ? "flex" : "hidden")}>
        <button type="button" className="flex shrink-0 items-center gap-1 border-b border-slate-200 px-3 py-2 text-sm font-semibold text-primary lg:hidden" onClick={() => setMobileView("items")}>← Add more items</button>
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-200 px-2 pt-2">
          {bills.map((b) => (
            <div key={b.id} className={cn("group flex shrink-0 items-center gap-1 rounded-t-lg border border-b-0 px-3 py-1.5 text-sm", b.id === active?.id ? "border-slate-200 bg-white font-semibold text-slate-900" : "border-transparent bg-slate-100 text-slate-500")}>
              <button type="button" onClick={() => setActiveId(b.id)}>{b.name}{b.items.length ? ` (${b.items.length})` : ""}</button>
              <button type="button" aria-label={`Close ${b.name}`} className="rounded p-0.5 hover:bg-slate-200" onClick={() => closeTab(b.id)}><X size={12} /></button>
            </div>
          ))}
          <button type="button" className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => addTab()} title="New bill (hold current)"><Plus size={16} /></button>
        </div>

        <div className="shrink-0 space-y-2 border-b border-slate-100 p-3">
          {active?.editOrderId && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">Editing a saved bill — stock is adjusted when you update.</p>}
          {active?.quotationId && <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700">Billing from a quotation.</p>}
          <CustomerPicker api={api} value={active?.customer} onChange={(c) => updateActive((b) => ({ ...b, customer: c?._id === WALK_IN ? null : c }))} />
          {/* wholesale pricing is for the owner only; staff always bill at the shop price */}
          {!isStaff && (
            <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-semibold">
              {["retail", "wholesale"].map((m) => (
                <button key={m} type="button" onClick={() => setPriceMode(m)} className={cn("flex-1 rounded-md py-1.5 capitalize", active?.priceMode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>{m} price</button>
              ))}
            </div>
          )}
        </div>

        <div data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {!active?.items.length && (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-slate-400">
              <ShoppingCart size={36} />
              Tap an item or scan a barcode to start the bill.
            </div>
          )}
          {active?.items.map((l) => (
            <div key={l.id} className="border-b border-slate-100 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{l.name}</p>
                  <p className="text-xs text-slate-500">
                    {[l.variantName, l.priceType === "wholesale" && "wholesale", l.mrp > l.price && `MRP ${rupees(l.mrp)}`, l.gstRate ? `GST ${l.gstRate}%` : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button type="button" aria-label={`Remove ${l.name}`} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500" onClick={() => removeLine(l.id)}><Trash2 size={15} /></button>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex items-center rounded-lg border border-slate-200">
                  <button type="button" aria-label="Less" className="p-1.5 text-slate-600" onClick={() => (l.quantity > 1 ? setLine(l.id, { quantity: round2(l.quantity - 1) }) : removeLine(l.id))}><Minus size={14} /></button>
                  <input
                    className="w-12 border-x border-slate-200 bg-transparent py-1 text-center text-sm font-semibold outline-none"
                    inputMode="decimal"
                    value={l.quantity}
                    onChange={(e) => setLine(l.id, { quantity: e.target.value.replace(/[^\d.]/g, "") })}
                    onBlur={(e) => { const q = Number(e.target.value); if (!(q > 0)) removeLine(l.id); else setLine(l.id, { quantity: q }); }}
                    aria-label={`${l.name} quantity`}
                  />
                  <button type="button" aria-label="More" className="p-1.5 text-slate-600" onClick={() => setLine(l.id, { quantity: round2(Number(l.quantity) + 1) })}><Plus size={14} /></button>
                </div>
                <span className="text-xs text-slate-400">×</span>
                {canChangePrice || !l.productId ? (
                  <input
                    className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm outline-none focus:border-primary"
                    inputMode="decimal"
                    value={l.price}
                    onChange={(e) => setLine(l.id, { price: e.target.value.replace(/[^\d.]/g, ""), priceType: "custom" })}
                    onBlur={(e) => setLine(l.id, { price: Number(e.target.value) || 0 })}
                    aria-label={`${l.name} price`}
                  />
                ) : (
                  <span className="w-20 px-2 py-1 text-right text-sm font-semibold text-slate-700" aria-label={`${l.name} price`}>{rupees(l.price)}</span>
                )}
                <span className="ml-auto text-sm font-bold text-slate-900">{rupees(lineTotal(l))}</span>
              </div>
              {l.stock != null && Number(l.quantity) > l.stock && <p className="mt-1 text-[11px] font-semibold text-red-600">Only {l.stock} in stock</p>}
            </div>
          ))}
        </div>

        {/* totals + Pay stay pinned at the bottom, whatever the length of the bill */}
        <div data-lenis-prevent className="max-h-[60%] shrink-0 space-y-2 overflow-y-auto border-t border-slate-200 bg-slate-50 p-3 text-sm shadow-[0_-6px_12px_-8px_rgba(15,23,42,0.18)]">
          <div className="flex justify-between text-slate-600"><span>Items</span><span>{round2(totals.itemCount)}</span></div>
          <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{rupees(totals.subtotal)}</span></div>
          <div className="flex items-center justify-between text-slate-600">
            <span>Discount (₹)</span>
            <input className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right outline-none focus:border-primary" inputMode="decimal" value={active?.billDiscount || ""} placeholder="0"
              onChange={(e) => updateActive((b) => ({ ...b, billDiscount: e.target.value.replace(/[^\d.]/g, "") }))} />
          </div>
          {totals.gstTotal > 0 && <div className="flex justify-between text-xs text-slate-500"><span>Incl. GST</span><span>{rupees(totals.gstTotal)}</span></div>}
          {totals.roundOff !== 0 && <div className="flex justify-between text-xs text-slate-500"><span>Round off</span><span>{rupees(totals.roundOff)}</span></div>}
          {showProfit && <div className="flex justify-between text-xs font-semibold text-emerald-700"><span>Profit on bill</span><span>{rupees(totals.profit)}</span></div>}
          <div className="flex items-end justify-between border-t border-slate-200 pt-2">
            <div>
              <p className="text-xs text-slate-500">Total</p>
              <p className="text-3xl font-black text-slate-900">{rupees(totals.total)}</p>
              {totals.savings > 0 && <p className="text-xs font-semibold text-emerald-700">Customer saves {rupees(totals.savings)}</p>}
            </div>
            {canSeeCost && <button type="button" className={cn("rounded-lg p-2", showProfit ? "bg-emerald-100 text-emerald-700" : "text-slate-400 hover:bg-slate-100")} onClick={() => setShowProfit((s) => !s)} title="Show profit"><TrendingUp size={18} /></button>}
          </div>
          <div className="grid grid-cols-4 gap-2 pt-1">
            <Button variant="outline" onClick={previewReceipt} title="Print estimate"><Printer size={16} /></Button>
            <Button variant="outline" onClick={() => addTab()} title="Hold & start new bill"><PauseCircle size={16} /></Button>
            <Button className="col-span-2 h-11 text-base" onClick={startPay} disabled={!active?.items.length}>
              {active?.editOrderId ? "Update bill" : `Pay ${rupees(totals.total)}`}
            </Button>
          </div>
        </div>
      </section>

      <BarcodeScannerModal isOpen={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={handleCode} />
      <QuickAddModal api={api} isOpen={quickAdd.open} initialBarcode={quickAdd.barcode} sellers={sellers} onClose={() => setQuickAdd({ open: false, barcode: "" })} onAdd={(row) => addRow(row)} />
      {payOpen && active && (
        <PaymentModal api={api} portal={portal} bill={active} totals={totals} onClose={() => setPayOpen(false)} onDone={finishBill} onQueued={setQueued} />
      )}
      <SuccessModal order={done} bill={settings.bill} onClose={() => { setDone(null); searchRef.current?.focus(); }} onOpenReport={() => navigate(`/${portal}/pos/report`)} />
    </div>
  );
}

// =================================================================== payment
const METHODS = [
  { key: "Cash", label: "Cash" },
  { key: "UPI", label: "UPI" },
  { key: "Card", label: "Card" },
  { key: "Credit", label: "Udhaar" },
];

function PaymentModal({ api, portal, bill, totals, onClose, onDone, onQueued }) {
  const showDues = useStaffAccess().can("pos.customers");
  // one id per checkout: a retried/double-tapped save can't create two bills
  const [clientRef] = useState(() => newClientRef(portal));
  const editing = Boolean(bill.editOrderId);
  const [method, setMethod] = useState(editing ? bill.paymentMethod || "Cash" : "Cash");
  const [received, setReceived] = useState(String(totals.total));
  const [busy, setBusy] = useState(false);
  const change = round2(Number(received || 0) - totals.total);
  const hasCustomer = Boolean(bill.customer?._id);

  const payload = {
    customerId: bill.customer?._id || WALK_IN,
    items: bill.items.map(toApiLine),
    billDiscount: Number(bill.billDiscount) || 0,
    quotationId: bill.quotationId,
  };

  const submit = async () => {
    if (method === "Credit" && !hasCustomer) return toast.error("Pick a customer for udhaar");
    if (method === "Cash" && Number(received) < totals.total) return toast.error("Cash received is less than the total");
    setBusy(true);
    try {
      if (editing) {
        const order = await api.updateOrder(bill.editOrderId, { items: payload.items, billDiscount: payload.billDiscount, customerId: payload.customerId });
        toast.success("Bill updated");
        return onDone(order);
      }
      const body = { ...payload, paymentMethod: method, amountReceived: method === "Cash" ? Number(received) : undefined, clientRef };
      try {
        const order = await api.createOrder(body);
        toast.success(`Bill ${order.invoiceNumber} saved`);
        return onDone(order);
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        // no internet: keep the bill on this device and upload it later
        const billedAt = new Date().toISOString();
        onQueued?.(queueBill(portal, { clientRef, payload: body, billedAt, total: totals.total }));
        toast.warning("No internet — bill saved on this device and will upload automatically");
        return onDone({
          _offline: true,
          invoiceNumber: `OFFLINE-${clientRef.slice(-6).toUpperCase()}`,
          createdAt: billedAt,
          customerSnapshot: { name: bill.customer?.name || "Walk-in Customer", phone: bill.customer?.phone },
          items: bill.items.map((l) => ({ ...l, unitPrice: l.price, total: lineTotal(l) })),
          ...totals,
          billDiscount: totals.discount,
          paymentMethod: method,
          paymentStatus: method === "Credit" ? "Pending" : "Paid",
          amountReceived: method === "Cash" ? Number(received) : totals.total,
          changeReturned: method === "Cash" ? round2(Number(received) - totals.total) : 0,
        });
      }
    } catch (err) {
      toast.error(apiError(err, "Could not save the bill"));
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  const quick = [...new Set([totals.total, Math.ceil(totals.total / 100) * 100, Math.ceil(totals.total / 500) * 500, 2000])].filter((v) => v >= totals.total).slice(0, 4);

  return (
    <Modal isOpen onClose={onClose} title={editing ? "Update bill" : `Collect ${rupees(totals.total)}`} size="md"
      footer={<><Button variant="outline" onClick={onClose}>Back</Button><Button onClick={submit} isLoading={busy} className="min-w-[140px]">{editing ? "Update bill" : "Confirm & save"}</Button></>}>
      {!editing && (
        <div className="grid grid-cols-4 gap-2">
          {METHODS.map((m) => (
            <button key={m.key} type="button" onClick={() => setMethod(m.key)} className={cn("rounded-xl border px-2 py-3 text-sm font-semibold", method === m.key ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-600 hover:border-slate-300")}>{m.label}</button>
          ))}
        </div>
      )}
      <div className="mt-4 space-y-3 text-sm">
        {editing && <p className="text-slate-600">Payment method stays <b>{bill.paymentMethod}</b>. {bill.paymentMethod === "Credit" ? "The customer's due will change by the difference." : ""}</p>}
        {!editing && method === "Cash" && (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Cash received</span>
              <input className={cn(inputCls, "h-12 text-xl font-bold")} inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value.replace(/[^\d.]/g, ""))} autoFocus onFocus={(e) => e.target.select()} />
            </label>
            <div className="flex gap-2">{quick.map((v) => <button key={v} type="button" className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200" onClick={() => setReceived(String(v))}>{rupees(v)}</button>)}</div>
            <p className={cn("text-lg font-bold", change < 0 ? "text-red-600" : "text-emerald-700")}>{change < 0 ? `Short by ${rupees(-change)}` : `Return change: ${rupees(change)}`}</p>
          </>
        )}
        {!editing && method === "Credit" && (
          hasCustomer
            ? <p className="text-slate-600">{rupees(totals.total)} will be added to <b>{bill.customer.name}</b>'s udhaar{showDues && Number(bill.customer.creditBalance) ? ` (current balance ${rupees(bill.customer.creditBalance)})` : ""}.</p>
            : <p className="font-semibold text-red-600">Pick a saved customer in the bill to give udhaar.</p>
        )}
        {!editing && (method === "UPI" || method === "Card") && <p className="text-slate-600">Collect {rupees(totals.total)} by {method} on your machine/app, then confirm.</p>}
      </div>
    </Modal>
  );
}

// =================================================================== success
function SuccessModal({ order, bill, onClose, onOpenReport }) {
  if (!order) return null;
  return (
    <Modal isOpen onClose={onClose} title="Bill saved" size="sm"
      footer={<Button className="w-full" onClick={onClose}>New bill</Button>}>
      <div className="text-center">
        <p className="text-sm text-slate-500">{order.invoiceNumber} · {order.paymentMethod}</p>
        {order._offline && <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Saved on this device — uploads when internet is back</p>}
        <p className="mt-1 text-4xl font-black text-slate-900">{rupees(order.total)}</p>
        {order.paymentMethod === "Cash" && order.changeReturned > 0 && <p className="mt-1 text-lg font-bold text-emerald-700">Return {rupees(order.changeReturned)}</p>}
        {order.paymentMethod === "Credit" && <p className="mt-1 text-sm font-semibold text-amber-600">Added to udhaar</p>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => printReceipt(order, bill)}><Printer size={16} className="mr-1" /> Receipt</Button>
          <Button variant="outline" onClick={() => downloadInvoicePdf(order, bill)}><FileText size={16} className="mr-1" /> PDF invoice</Button>
        </div>
        <button type="button" className="mt-3 text-xs font-semibold text-primary underline" onClick={onOpenReport}>View all bills</button>
      </div>
    </Modal>
  );
}
