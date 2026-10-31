import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { sellerApi } from "../services/sellerApi";

export const SELLER_PROFILE_KEY = ["seller", "profile"];

/** Top bar "STORE OPEN / CLOSED" switch. Closed: customers see "Shop closed" and can't order. */
export default function StoreStatusPill() {
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: SELLER_PROFILE_KEY,
    queryFn: async () => (await sellerApi.getProfile()).data.result,
    staleTime: 60000,
  });
  if (!profile) return null;
  const open = profile.storeOpen !== false;

  const toggle = async () => {
    try {
      await sellerApi.updateProfile({ storeOpen: !open });
      queryClient.setQueryData(SELLER_PROFILE_KEY, (prev) => ({ ...prev, storeOpen: !open }));
      toast.success(!open ? "Store is open. Customers can order." : "Store is closed. Customers can't order now.");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not change store status");
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={open ? "Click to close the store" : "Click to open the store"}
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition-colors",
        open ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", open ? "bg-emerald-600" : "bg-red-600")} />
      {open ? "Store open" : "Store closed"}
    </button>
  );
}
