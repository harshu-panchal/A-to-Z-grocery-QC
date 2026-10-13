import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, Printer, FileText } from "lucide-react";
import Button from "@shared/components/ui/Button";
import { apiError } from "../posApi";
import { rupees, storageKey, loadLocal, saveLocal } from "../posUtils";
import { printReceipt, downloadInvoicePdf } from "../posPrint";
import { usePosApi, usePosSettings } from "../PosComponents";

/** PhonePe sends the cashier back here; confirm the payment with the server. */
export default function PosPaymentReturn({ portal }) {
  const api = usePosApi(portal);
  const [settings] = usePosSettings(api);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const mo = params.get("mo");
  const [state, setState] = useState({ status: "checking" });
  const tries = useRef(0);

  useEffect(() => {
    if (!mo) return undefined;
    let timer;
    const check = async () => {
      try {
        const res = await api.verifyPayment(mo);
        if (res.status === "pending" && tries.current < 20) {
          tries.current += 1;
          setState({ status: "pending", ...res });
          timer = setTimeout(check, 3000);
          return;
        }
        setState(res);
        if (res.status === "completed" && res.kind === "sale") {
          // clear the bill tab that started this payment
          const pending = loadLocal(storageKey(portal, "pending_online"), null);
          if (pending?.merchantOrderId === mo) {
            const bills = loadLocal(storageKey(portal, "bills"), []);
            saveLocal(storageKey(portal, "bills"), bills.map((b) => (b.id === pending.billId ? { ...b, items: [], customer: null, billDiscount: 0 } : b)));
            localStorage.removeItem(storageKey(portal, "pending_online"));
          }
        }
      } catch (err) {
        setState({ status: "error", message: apiError(err) });
      }
    };
    check();
    return () => clearTimeout(timer);
  }, [mo, api, portal]);

  const order = state.order;
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      {(state.status === "checking" || state.status === "pending") && (
        <>
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
          <p className="mt-4 text-lg font-semibold text-slate-800">Confirming payment with PhonePe…</p>
          {state.status === "pending" && <p className="mt-1 text-sm text-slate-500">The payment is still processing. This page checks again automatically.</p>}
        </>
      )}
      {state.status === "completed" && (
        <>
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
          <p className="mt-3 text-2xl font-bold text-slate-900">Payment received</p>
          <p className="mt-1 text-3xl font-black">{rupees(state.amount)}</p>
          {order && <p className="mt-1 text-sm text-slate-500">Bill {order.invoiceNumber}</p>}
          {state.kind === "credit" && <p className="mt-1 text-sm text-slate-500">The customer's udhaar has been reduced.</p>}
          {order && (
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => printReceipt(order, settings.bill)}><Printer size={16} className="mr-1" /> Receipt</Button>
              <Button variant="outline" onClick={() => downloadInvoicePdf(order, settings.bill)}><FileText size={16} className="mr-1" /> PDF</Button>
            </div>
          )}
        </>
      )}
      {(state.status === "failed" || state.status === "error" || (!mo && state.status === "checking")) && (
        <>
          <XCircle className="mx-auto h-14 w-14 text-red-500" />
          <p className="mt-3 text-2xl font-bold text-slate-900">{state.status === "failed" ? "Payment failed" : "Could not confirm payment"}</p>
          <p className="mt-1 text-sm text-slate-500">{state.message || "No money was taken for this bill. The items are still in your bill tab."}</p>
        </>
      )}
      <div className="mt-8 flex justify-center gap-2">
        <Button onClick={() => navigate(`/${portal}/pos`)}>Back to billing</Button>
        <Button variant="outline" onClick={() => navigate(`/${portal}/pos/report`)}>All bills</Button>
      </div>
    </div>
  );
}
