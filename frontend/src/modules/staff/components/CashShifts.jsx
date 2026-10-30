import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import Card from "@shared/components/ui/Card";
import Modal from "@shared/components/ui/Modal";
import Button from "@shared/components/ui/Button";
import Input from "@shared/components/ui/Input";
import { useToast } from "@shared/components/ui/Toast";
import { apiMessage } from "../staffApi";

const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const when = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-");
const duration = (min) => (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`);

/**
 * Cash & Shifts: what each staff member took at the counter since the owner
 * last collected, their login -> logout shifts, and "Collect cash".
 */
export default function CashShifts({ api }) {
  const [openId, setOpenId] = useState(null);
  const [collecting, setCollecting] = useState(null);
  const cashQuery = useQuery({ queryKey: ["staff", api.portal, "cash"], queryFn: () => api.cash().then((r) => r.data.result), refetchInterval: 30000 });
  const items = cashQuery.data?.items || [];

  if (cashQuery.isLoading) return <p className="p-8 text-center text-sm text-slate-400">Loading…</p>;
  if (cashQuery.isError) return <p className="p-8 text-center text-sm text-red-500">{apiMessage(cashQuery.error, "Could not load cash")}</p>;
  if (!items.length) return <p className="p-8 text-center text-sm text-slate-400">No staff yet.</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Cash each staff member took at the POS counter since you last collected it. UPI, card and online payments go straight to your account, so they are shown but not collected.
      </p>
      {items.map((s) => (
        <StaffCashCard key={s.staffId} api={api} s={s} open={openId === s.staffId} onToggle={() => setOpenId(openId === s.staffId ? null : s.staffId)} onCollect={() => setCollecting(s)} />
      ))}
      <CollectionHistory api={api} />
      <CollectModal api={api} staff={collecting} onClose={() => setCollecting(null)} />
    </div>
  );
}

function StaffCashCard({ api, s, open, onToggle, onCollect }) {
  const b = s.breakdown || {};
  const shiftsQuery = useQuery({
    queryKey: ["staff", api.portal, "cash", "shifts", s.staffId],
    queryFn: () => api.cash({ staffId: s.staffId }).then((r) => r.data.result.shifts || []),
    enabled: open,
  });
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-900">{s.name}{!s.isActive && <span className="ml-2 text-[10px] font-semibold text-slate-400">(switched off)</span>}</p>
          <p className="text-xs text-slate-500">{s.jobTitle || "Staff"} · since {when(s.from)}{s.lastCollection ? " (last collection)" : ""}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cash to collect</p>
          <p className={cn("text-2xl font-black", s.cashToCollect > 0 ? "text-slate-900" : "text-slate-400")}>{rupees(s.cashToCollect)}</p>
        </div>
        <Button onClick={onCollect} disabled={s.cashToCollect <= 0 && !b.floatIn}>
          <Wallet size={16} className="mr-1.5" /> Collect cash
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Stat label="Cash bills" value={rupees(b.cashBills)} />
        <Stat label="Udhaar paid in cash" value={rupees(b.udhaarCash)} />
        <Stat label="Exchange cash in / out" value={`${rupees(b.exchangeCollected)} / ${rupees(b.exchangeGiven)}`} />
        <Stat label="Change from last time" value={rupees(b.floatIn)} />
        <Stat label="UPI" value={rupees(b.upi)} muted />
        <Stat label="Card" value={rupees(b.card)} muted />
        <Stat label="Udhaar given" value={rupees(b.udhaarGiven)} muted />
        <Stat label="Bills" value={b.bills || 0} muted />
      </div>

      <button type="button" onClick={onToggle} className="mt-3 flex items-center gap-1 text-xs font-bold text-primary">
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Shifts (login to logout)
      </button>
      {open && (
        <div className="mt-2 overflow-x-auto">
          {shiftsQuery.isLoading ? (
            <p className="py-3 text-xs text-slate-400">Loading shifts…</p>
          ) : !shiftsQuery.data?.length ? (
            <p className="py-3 text-xs text-slate-400">No logins recorded in this period.</p>
          ) : (
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-slate-400">
                <tr><th className="py-1.5">Login</th><th>Logout</th><th>Time</th><th className="text-right">Bills</th><th className="text-right">Cash</th><th className="text-right">UPI</th><th className="text-right">Card</th></tr>
              </thead>
              <tbody>
                {shiftsQuery.data.map((sh) => (
                  <tr key={String(sh.start)} className="border-t border-slate-100">
                    <td className="py-1.5">{sh.startUnknown ? "before this period" : when(sh.start)}</td>
                    <td>{sh.open ? <span className="font-semibold text-emerald-600">still logged in</span> : `${when(sh.end)}${sh.noLogout ? " (no logout)" : ""}`}</td>
                    <td>{duration(sh.minutes)}</td>
                    <td className="text-right">{sh.bills}</td>
                    <td className="text-right font-semibold">{rupees(sh.cash)}</td>
                    <td className="text-right">{rupees(sh.upi)}</td>
                    <td className="text-right">{rupees(sh.card)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Card>
  );
}

const Stat = ({ label, value, muted }) => (
  <div className={cn("rounded-lg px-2.5 py-1.5", muted ? "bg-slate-50 text-slate-500" : "bg-primary/5 text-slate-800")}>
    <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
    <p className="font-bold">{value}</p>
  </div>
);

function CollectModal({ api, staff, onClose }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [received, setReceived] = useState("");
  const [floatLeft, setFloatLeft] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const expected = Number(staff?.cashToCollect || 0);
  const diff = received === "" ? 0 : Math.round((Number(received) - expected) * 100) / 100;

  const close = () => { if (saving) return; setReceived(""); setFloatLeft(""); setNote(""); onClose(); };
  const save = async () => {
    setSaving(true);
    try {
      const r = await api.collectCash(staff.staffId, { received: Number(received), floatLeft: Number(floatLeft || 0), note });
      showToast(r.data.message, "success");
      queryClient.invalidateQueries({ queryKey: ["staff", api.portal, "cash"] });
      setSaving(false);
      close();
    } catch (err) {
      showToast(apiMessage(err), "error");
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={Boolean(staff)}
      onClose={close}
      title={`Collect cash: ${staff?.name || ""}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close} disabled={saving}>Cancel</Button>
          <Button onClick={save} isLoading={saving} disabled={received === "" || (Math.abs(diff) >= 1 && !note.trim())}>Save collection</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="text-slate-500">From {when(staff?.from)} to now</p>
          <p className="text-lg font-black text-slate-900">Expected cash: {rupees(expected)}</p>
        </div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Cash you counted</label>
        <Input inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value.replace(/[^\d.]/g, ""))} placeholder={String(expected)} autoFocus />
        {received !== "" && (
          <p className={cn("text-sm font-bold", diff === 0 ? "text-emerald-600" : diff < 0 ? "text-red-600" : "text-amber-600")}>
            {diff === 0 ? "Matches" : diff < 0 ? `Short by ${rupees(-diff)}` : `Extra ${rupees(diff)}`}
          </p>
        )}
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Change left in the drawer (optional)</label>
        <Input inputMode="decimal" value={floatLeft} onChange={(e) => setFloatLeft(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" />
        <p className="text-xs text-slate-400">Counted again in their next collection.</p>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Note {Math.abs(diff) >= 1 ? "(required: cash doesn't match)" : "(optional)"}</label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. ₹50 given as change to a customer" />
        <p className="text-xs text-slate-500">After saving, their cash starts again from ₹0.</p>
      </div>
    </Modal>
  );
}

function CollectionHistory({ api }) {
  const historyQuery = useQuery({ queryKey: ["staff", api.portal, "cash", "history"], queryFn: () => api.cashHistory().then((r) => r.data.result) });
  const rows = historyQuery.data?.items || [];
  return (
    <Card className="p-4">
      <p className="mb-2 font-bold text-slate-900">Collection history</p>
      {!rows.length ? (
        <p className="text-xs text-slate-400">No cash collected yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-slate-400">
              <tr><th className="py-1.5">Staff</th><th>Period</th><th className="text-right">Expected</th><th className="text-right">Received</th><th className="text-right">Difference</th><th>Note</th></tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c._id} className="border-t border-slate-100">
                  <td className="py-1.5 font-semibold">{c.staffName}</td>
                  <td>{when(c.from)} → {when(c.to)}</td>
                  <td className="text-right">{rupees(c.expected)}</td>
                  <td className="text-right font-semibold">{rupees(c.received)}</td>
                  <td className={cn("text-right font-bold", c.difference < 0 ? "text-red-600" : c.difference > 0 ? "text-amber-600" : "text-emerald-600")}>
                    {c.difference === 0 ? "-" : `${c.difference < 0 ? "short" : "extra"} ${rupees(Math.abs(c.difference))}`}
                  </td>
                  <td className="text-slate-500">{[c.note, c.floatLeft ? `left ${rupees(c.floatLeft)} change` : ""].filter(Boolean).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
