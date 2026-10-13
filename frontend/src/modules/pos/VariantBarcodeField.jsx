import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ScanLine, Wand2, Printer, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { makePosApi } from "./posApi";
import { printBarcodeLabels } from "./posPrint";
import { BarcodeScannerModal } from "./PosComponents";

/** EAN-13 check digit for 12 digits. */
const ean13 = (first12) => {
  const sum = first12.split("").reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return first12 + ((10 - (sum % 10)) % 10);
};
/** In-store EAN-13: prefix 29 (GS1 range for restricted/in-store use) + 10 random digits. */
const randomStoreCode = () => ean13(`29${Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join("")}`);

const labelSettingsCache = {};

/**
 * Barcode, rack number and (optional) wholesale price for one product variant: type/scan/generate the
 * code, live uniqueness check (other products of this seller and the other
 * variants in the same form), and label printing.
 */
export default function VariantBarcodeField({
  portal,
  value = "",
  onChange,
  rack = "",
  onRackChange,
  wholesale = "",
  onWholesaleChange,
  productId,
  sellerId,
  otherCodes = [],
  printName = "",
  mrp,
  price,
  copies = 1,
  required = true,
  showErrors = false,
}) {
  const api = useMemo(() => makePosApi(portal), [portal]);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState({ state: "idle" }); // idle | checking | ok | taken | error
  const code = String(value || "").trim();
  const dupInForm = code && otherCodes.map((c) => String(c || "").trim()).includes(code);

  // live check against other products (debounced)
  useEffect(() => {
    if (!code || dupInForm) return undefined;
    let alive = true;
    const t = setTimeout(() => {
      setStatus({ state: "checking" });
      api.barcodeCheck({ code, productId: productId || undefined, sellerId: sellerId || undefined })
        .then((r) => {
          if (!alive) return;
          if (r.unchecked) setStatus({ state: "idle" });
          else setStatus(r.available ? { state: "ok" } : { state: "taken", conflict: r.conflict });
        })
        .catch(() => alive && setStatus({ state: "error" }));
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [code, dupInForm, productId, sellerId, api]);

  const generate = async () => {
    for (let i = 0; i < 6; i += 1) {
      const candidate = randomStoreCode();
      if (otherCodes.includes(candidate)) continue;
      try {
        const r = await api.barcodeCheck({ code: candidate, productId: productId || undefined, sellerId: sellerId || undefined });
        if (r.available || r.unchecked) {
          onChange(candidate);
          toast.success(`Barcode ${candidate} generated`);
          return;
        }
      } catch {
        onChange(candidate); // offline/check failed: the server re-checks on save
        return;
      }
    }
    toast.error("Could not find a free barcode, try again");
  };

  const print = async () => {
    if (!code) return toast.error("Add or generate a barcode first");
    if (!labelSettingsCache[portal]) {
      labelSettingsCache[portal] = await api.getSettings().then((s) => s.barcode || {}).catch(() => ({}));
    }
    const n = window.prompt("How many labels?", String(Math.max(1, Math.min(Number(copies) || 1, 200))));
    if (!n) return;
    printBarcodeLabels([{ name: printName, barcode: code, mrp: Number(mrp) || 0, price: Number(price) || 0, copies: Number(n) || 1 }], labelSettingsCache[portal]);
  };

  const shown = dupInForm ? { state: "dup" } : code ? status : { state: required && showErrors ? "missing" : "idle" };

  const wholesaleNum = Number(wholesale) || 0;
  const wholesaleHigh = wholesaleNum > 0 && Number(price) > 0 && wholesaleNum > Number(price);

  return (
    <div className={cn("grid gap-3", onWholesaleChange ? "md:grid-cols-[minmax(0,140px)_minmax(0,140px)_1fr]" : "md:grid-cols-[minmax(0,180px)_1fr]")}>
      {onWholesaleChange && (
        <label className="block space-y-1">
          <span className="ml-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-600">Wholesale price</span>
          <input
            type="number"
            min="0"
            value={wholesale ?? ""}
            onKeyDown={(e) => { if (["-", "+", "e", "E"].includes(e.key) || e.key === "Enter") e.preventDefault(); }}
            onChange={(e) => {
              const val = e.target.value;
              if (val !== "" && Number(val) < 0) return;
              onWholesaleChange(val);
            }}
            placeholder="Optional"
            title="Used at the POS counter when Wholesale is selected. Leave empty to bill at the selling price."
            className={cn(
              "w-full rounded-md border bg-indigo-50/50 px-2.5 py-2 text-xs font-bold text-indigo-700 outline-none focus:ring-1",
              wholesaleHigh ? "border-amber-300 focus:ring-amber-200" : "border-indigo-200 focus:border-indigo-400 focus:ring-indigo-200",
            )}
          />
          <p className="text-[10px] leading-tight text-slate-400">
            {wholesaleHigh ? <span className="text-amber-600">Higher than the selling price</span> : "For bulk buyers at the POS counter"}
          </p>
        </label>
      )}
      <label className="block space-y-1">
        <span className="ml-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Rack number</span>
        <input
          value={rack || ""}
          onChange={(e) => onRackChange?.(e.target.value)}
          placeholder="e.g. A1, Shelf 3"
          className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
        />
      </label>
      <div className="space-y-1">
        <span className="ml-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Barcode {required && <span className="text-red-500">*</span>}
        </span>
        <div className="flex flex-wrap gap-2">
          <input
            value={value || ""}
            onChange={(e) => onChange(e.target.value.replace(/\s+/g, ""))}
            // barcode scanners press Enter after the code: don't submit the form
            onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
            placeholder="Scan, type or generate"
            className={cn(
              "min-w-[160px] flex-1 rounded-md border bg-white px-2.5 py-2 font-mono text-xs outline-none focus:ring-1",
              shown.state === "taken" || shown.state === "dup" || shown.state === "missing" ? "border-red-300 focus:border-red-400 focus:ring-red-200" : "border-slate-200 focus:border-primary focus:ring-primary/20",
            )}
          />
          <button type="button" onClick={() => setScanning(true)} className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700">
            <ScanLine size={14} /> Scan
          </button>
          <button type="button" onClick={generate} className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100">
            <Wand2 size={14} /> Generate
          </button>
          <button type="button" onClick={print} disabled={!code} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
            <Printer size={14} /> Print
          </button>
        </div>
        <p className="min-h-[16px] text-[11px]">
          {shown.state === "checking" && <span className="inline-flex items-center gap-1 text-slate-500"><Loader2 size={12} className="animate-spin" /> Checking…</span>}
          {shown.state === "ok" && <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 size={12} /> Barcode available</span>}
          {shown.state === "taken" && <span className="inline-flex items-center gap-1 text-red-600"><AlertCircle size={12} /> Already used by "{shown.conflict?.productName}{shown.conflict?.variantName ? ` (${shown.conflict.variantName})` : ""}"</span>}
          {shown.state === "dup" && <span className="inline-flex items-center gap-1 text-red-600"><AlertCircle size={12} /> Another variant of this product has the same barcode</span>}
          {shown.state === "missing" && <span className="text-red-600">Each variant needs a barcode — scan it or tap Generate</span>}
          {shown.state === "idle" && !code && <span className="text-slate-400">Each variant must have a unique barcode — scan or generate one</span>}
        </p>
      </div>
      <BarcodeScannerModal isOpen={scanning} onClose={() => setScanning(false)} onDetected={(c) => onChange(String(c).trim())} />
    </div>
  );
}

/**
 * Validate the variants of a product form before saving.
 * Returns an error message or null.
 */
export function variantBarcodeError(variants = [], { required = true } = {}) {
  const codes = variants.map((v) => String(v.barcode || "").trim());
  if (required) {
    const missing = codes.findIndex((c) => !c);
    if (missing !== -1) return `Variant ${missing + 1}${variants[missing]?.name ? ` (${variants[missing].name})` : ""} needs a barcode — scan it or tap Generate`;
  }
  const filled = codes.filter(Boolean);
  if (new Set(filled).size !== filled.length) return "Two variants have the same barcode; each variant needs its own";
  return null;
}
