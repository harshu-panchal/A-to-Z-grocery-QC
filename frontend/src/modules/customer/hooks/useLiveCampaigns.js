import { useQuery } from "@tanstack/react-query";
import { customerApi } from "../services/customerApi";
import { useLocation as useAppLocation } from "../context/LocationContext";

/**
 * Live sale campaigns for the customer's location. Shared by the Offers page
 * and every "Offers & Sales" entry point (same query key = one request), so
 * the entries hide themselves when there is nothing on sale.
 */
export function useLiveCampaigns() {
  const { currentLocation } = useAppLocation();
  const lat = currentLocation?.latitude;
  const lng = currentLocation?.longitude;
  const query = useQuery({
    queryKey: ["customer", "campaigns", lat, lng],
    queryFn: async () => {
      const params = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {};
      const res = await customerApi.getCampaigns(params).catch(() => ({ data: {} }));
      const list = res.data?.results || res.data?.result || [];
      return Array.isArray(list) ? list : [];
    },
    staleTime: 60 * 1000,
    // pick up a sale that starts while the page is open
    refetchInterval: 2 * 60 * 1000,
  });
  const campaigns = query.data || [];
  return {
    campaigns,
    isLoading: query.isLoading,
    hasLiveOffers: campaigns.some((c) => (c.products?.length || 0) > 0),
  };
}
