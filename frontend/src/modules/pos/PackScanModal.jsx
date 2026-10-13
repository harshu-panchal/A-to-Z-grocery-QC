import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ScanLine, CheckCircle2, MapPin } from "lucide-react";
import Modal from "@shared/components/ui/Modal";
import Button from "@shared/components/ui/Button";
import { cn } from "@/lib/utils";
import { makePosApi, apiError } from "./posApi";
import { useBarcodeWedge, BarcodeScannerModal } from "./PosComponents";

/**
 * Scan-to-pack for an app order: every scan ticks one unit of the matching
 * line; scanning something that isn't in the order (or one too many) warns
 * straight away, so the wrong pack size never leaves the shop.
 */
export default function PackScanModal({ portal = "seller", orderId, onClose, onPacked }) {
  const api = useMemo(() => makePosApi(portal), [portal]);
  const [data, setData] = useState(null);
  const [packed, setPacked] = useState({});
  const [lastScan, setLastScan] = useState(null);
  const [camera, setCamera] = useState(false);

  useEffect(() => {
    api.packList(orderId).then(setData).catch((err) => { toast.error(apiError(err)); onClose(); });
  }, [api, orderId, onClose]);

  const items = data?.items || [];
  const total = items.reduce((s, i) => s + i.quantity, 0);
  const done = items.reduce((s, i, idx) => s + Math.min(packed[idx] || 0, i.quantity), 0);
  const complete = items.length > 0 && done === total;

  const onCode = useCallback((raw) => {
    const code = String(raw).trim();
    const idx = items.findIndex((i, n) => i.barcodes.includes(code) && (packed[n] || 0) < i.quantity);
    const any = items.findIndex((i) => i.barcodes.includes(code));
    if (idx !== -1) {
      setPacked((p) => ({ ...p, [idx]: (p[idx] || 0) + 1 }));
      setLastScan({ ok: true, text: `${items[idx].name} ${items[idx].variantName ? `(${items[idx].variantName})` : ""} ✓` });
    } else if (any !== -1) {
      setLastScan({ ok: false, text: `Extra: ${items[any].name} is already fully packed` });
      toast.warning("Already packed enough of this item");
    } else {
      setLastScan({ ok: false, text: `Wrong item — ${code} is not in this order` });
      toast.error("This item is not in the order");
    }
  }, [items, packed]);
  useBarcodeWedge(onCode, Boolean(data) && !camera);

  return (
    <Modal isOpen onClose={onClose} title={`Scan & pack ${data?.orderId || ""}`} size="lg"
      footer={<>
        <Button variant="outline" onClick={() => setCamera(true)}><ScanLine size={15} className="mr-1" /> Camera</Button>
        <Button variant="outline" onClick={onClose}>Close</Button>
        {onPacked && <Button disabled={!complete} onClick={() => onPacked()}>Mark as packed</Button>}
      </>}>
      {!data ? <p className="p-6 text-center text-slate-500">Loading…</p> : (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm">
            <span className="text-slate-600">Scan each item with the scanner{data.customer ? ` · for ${data.customer}` : ""}</span>
            <span className={cn("font-bold", complete ? "text-emerald-700" : "text-slate-900")}>{done} / {total} packed</span>
          </div>
          {lastScan && <p className={cn("rounded-lg px-3 py-2 text-sm font-semibold", lastScan.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>{lastScan.text}</p>}
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {items.map((it, idx) => {
              const got = packed[idx] || 0;
              const ok = got >= it.quantity;
              return (
                <div key={idx} className={cn("flex items-center gap-3 p-3", ok && "bg-emerald-50/50")}>
                  <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-50">{it.image ? <img src={it.image} alt="" className="h-full w-full object-contain" /> : null}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{it.name}{it.variantName ? <span className="text-slate-500"> · {it.variantName}</span> : ""}</p>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {it.rackCode && <span className="inline-flex items-center gap-0.5 font-semibold text-violet-700"><MapPin size={11} /> Rack {it.rackCode}</span>}
                      <span className="font-mono">{it.barcodes[0] || "no barcode — tick manually"}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-bold", ok ? "text-emerald-700" : "text-slate-700")}>{got}/{it.quantity}</span>
                    {ok ? <CheckCircle2 className="text-emerald-600" size={20} /> : (
                      <button type="button" className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={() => setPacked((p) => ({ ...p, [idx]: (p[idx] || 0) + 1 }))}>+1</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {complete && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-sm font-bold text-emerald-700">All items packed correctly ✓</p>}
        </div>
      )}
      <BarcodeScannerModal isOpen={camera} onClose={() => setCamera(false)} onDetected={onCode} />
    </Modal>
  );
}
