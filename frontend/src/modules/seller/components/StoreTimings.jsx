import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";
import { sellerApi } from "../services/sellerApi";
import { SELLER_PROFILE_KEY } from "./StoreStatusPill";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const inputCls = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary focus:bg-white";

/**
 * Business hours, working days and vacation. Hours/days are shown to
 * customers ("Opens 10:00 AM", "Accepting orders until 10:30 PM"); the Store
 * Open/Closed switch and vacation decide if the shop takes orders.
 */
export default function StoreTimings({ profile }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile || form) return;
    setForm({
      open: profile.businessHours?.open || "09:00",
      close: profile.businessHours?.close || "22:00",
      days: Array.isArray(profile.workingDays) && profile.workingDays.length ? profile.workingDays : [0, 1, 2, 3, 4, 5, 6],
      autoEnabled: Boolean(profile.autoStoreSchedule?.enabled),
      autoOpen: profile.autoStoreSchedule?.openTime || profile.businessHours?.open || "09:00",
      autoClose: profile.autoStoreSchedule?.closeTime || profile.businessHours?.close || "22:00",
      vacation: Boolean(profile.vacation?.enabled),
      from: dateInput(profile.vacation?.from),
      to: dateInput(profile.vacation?.to),
      message: profile.vacation?.message || "",
    });
  }, [profile, form]);
  if (!form) return null;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleDay = (d) => set({ days: form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d].sort() });

  const save = async () => {
    if (!form.days.length) return toast.error("Pick at least one working day");
    if (form.vacation && (!form.from || !form.to)) return toast.error("Choose the vacation start and end date");
    setSaving(true);
    try {
      const body = {
        businessHours: { open: form.open, close: form.close },
        workingDays: form.days,
        autoStoreSchedule: { enabled: form.autoEnabled, openTime: form.autoOpen, closeTime: form.autoClose },
        vacation: { enabled: form.vacation, from: form.from || null, to: form.to || null, message: form.message },
      };
      await sellerApi.updateProfile(body);
      queryClient.setQueryData(SELLER_PROFILE_KEY, (prev) => ({ ...prev, ...body }));
      toast.success("Store timings saved");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not save store timings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-5 p-6">
      <div>
        <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">Business hours</h3>
        <p className="text-xs text-slate-500">Shown to customers. Use the Store Open / Closed switch at the top to start or stop taking orders.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-bold text-slate-600">
          Open
          <input type="time" className={inputCls} value={form.open} onChange={(e) => set({ open: e.target.value })} />
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-600">
          Close
          <input type="time" className={inputCls} value={form.close} onChange={(e) => set({ close: e.target.value })} />
        </label>
      </div>

      <div>
        <p className="mb-2 text-xs font-bold text-slate-600">Working days <span className="font-normal text-slate-400">(unselected days are your weekly off)</span></p>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d, i) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(i)}
              className={cn(
                "rounded-xl px-3.5 py-1.5 text-sm font-bold",
                form.days.includes(i) ? "bg-primary text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200",
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">Auto open &amp; close</h3>
        <p className="text-xs text-slate-500">When enabled, the store automatically opens and closes at the set times on working days. The manual Open/Closed switch is ignored.</p>
        <label className="flex items-center gap-3 cursor-pointer group select-none">
          <span className="relative flex items-center">
            <input type="checkbox" checked={form.autoEnabled} onChange={(e) => set({ autoEnabled: e.target.checked })} className="sr-only peer" />
            <span className="w-9 h-5 bg-slate-200 peer-checked:bg-blue-500 rounded-full transition-colors" />
            <span className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
          </span>
          <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
            {form.autoEnabled ? "Auto mode is ON" : "Auto mode is OFF (manual control)"}
          </span>
        </label>
        {form.autoEnabled && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-bold text-slate-600">
              Auto open at
              <input type="time" className={inputCls} value={form.autoOpen} onChange={(e) => set({ autoOpen: e.target.value })} />
            </label>
            <label className="space-y-1 text-xs font-bold text-slate-600">
              Auto close at
              <input type="time" className={inputCls} value={form.autoClose} onChange={(e) => set({ autoClose: e.target.value })} />
            </label>
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">Vacation &amp; temporary closure</h3>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={form.vacation} onChange={(e) => set({ vacation: e.target.checked })} />
          Vacation mode (closed for these dates)
        </label>
        {form.vacation && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-bold text-slate-600">
              From
              <input type="date" className={inputCls} value={form.from} onChange={(e) => set({ from: e.target.value })} />
            </label>
            <label className="space-y-1 text-xs font-bold text-slate-600">
              Till (back after this day)
              <input type="date" className={inputCls} value={form.to} min={form.from || undefined} onChange={(e) => set({ to: e.target.value })} />
            </label>
            <label className="space-y-1 text-xs font-bold text-slate-600 sm:col-span-2">
              Message for customers (optional)
              <input className={inputCls} maxLength={120} value={form.message} onChange={(e) => set({ message: e.target.value })} placeholder="e.g. Closed for Diwali, back on 5 Nov" />
            </label>
          </div>
        )}
      </div>

      <Button onClick={save} isLoading={saving}>Save store timings</Button>
    </Card>
  );
}
