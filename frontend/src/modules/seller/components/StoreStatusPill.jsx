import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { sellerApi } from "../services/sellerApi";

export const SELLER_PROFILE_KEY = ["seller", "profile"];

const fmtTime = (hhmm) => {
  const [h, m] = (hhmm || "").split(":").map(Number);
  if (Number.isNaN(h)) return "";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** Top bar "STORE OPEN / CLOSED / AUTO" switch. */
export default function StoreStatusPill() {
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: SELLER_PROFILE_KEY,
    queryFn: async () => (await sellerApi.getProfile()).data.result,
    staleTime: 60000,
  });
  if (!profile) return null;

  const auto = profile.autoStoreSchedule?.enabled;
  const open = profile.storeOpen !== false;

  const toggleManual = async () => {
    try {
      await sellerApi.updateProfile({ storeOpen: !open });
      queryClient.setQueryData(SELLER_PROFILE_KEY, (prev) => ({ ...prev, storeOpen: !open }));
      toast.success(!open ? "Store is open. Customers can order." : "Store is closed. Customers can't order now.");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not change store status");
    }
  };

  const toggleAuto = async () => {
    const next = !auto;
    try {
      await sellerApi.updateProfile({
        autoStoreSchedule: {
          enabled: next,
          openTime: profile.autoStoreSchedule?.openTime || profile.businessHours?.open || "09:00",
          closeTime: profile.autoStoreSchedule?.closeTime || profile.businessHours?.close || "22:00",
        },
      });
      queryClient.setQueryData(SELLER_PROFILE_KEY, (prev) => ({
        ...prev,
        autoStoreSchedule: {
          ...prev.autoStoreSchedule,
          enabled: next,
          openTime: prev.autoStoreSchedule?.openTime || prev.businessHours?.open || "09:00",
          closeTime: prev.autoStoreSchedule?.closeTime || prev.businessHours?.close || "22:00",
        },
      }));
      toast.success(next ? "Auto mode on — store opens & closes on schedule" : "Auto mode off — control store manually");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not change auto mode");
    }
  };

  if (auto) {
    const sched = profile.autoStoreSchedule || {};
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={toggleAuto}
          title="Auto mode is on — click to switch to manual"
          className="flex items-center gap-2 rounded-full border border-blue-300 bg-blue-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-blue-700 transition-colors hover:bg-blue-100"
        >
          <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          Auto
        </button>
        <span className="hidden sm:block text-[10px] font-semibold text-slate-400">
          {fmtTime(sched.openTime)} – {fmtTime(sched.closeTime)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggleManual}
        title={open ? "Click to close the store" : "Click to open the store"}
        className={cn(
          "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition-colors",
          open ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100",
        )}
      >
        <span className={cn("h-2 w-2 rounded-full", open ? "bg-emerald-600" : "bg-red-600")} />
        {open ? "Store open" : "Store closed"}
      </button>
      <button
        type="button"
        onClick={toggleAuto}
        title="Turn on auto mode — store opens & closes on schedule"
        className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-bold text-slate-400 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
      >
        Auto
      </button>
    </div>
  );
}
