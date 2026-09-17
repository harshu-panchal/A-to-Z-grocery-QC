import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  Circle,
} from "@react-google-maps/api";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import PageHeader from "@shared/components/ui/PageHeader";
import StatCard from "@shared/components/ui/StatCard";
import Pagination from "@shared/components/ui/Pagination";
import {
  HiOutlineBuildingOffice2,
  HiOutlineMagnifyingGlass,
  HiOutlineArrowPath,
  HiOutlineInformationCircle,
  HiOutlineExclamationTriangle,
  HiOutlineGlobeAlt,
  HiOutlineMap,
  HiOutlineUsers,
  HiOutlineMapPin,
  HiOutlineClipboardDocumentList,
} from "react-icons/hi2";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { adminApi } from "../services/adminApi";
import { useQuery, keepPreviousData } from "@tanstack/react-query";

const MAP_LIBRARIES = ["geometry"];
const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };
const PAGE_SIZE = 25;
const TARGET_VIEW_RADIUS_KM = 25;

const LIFECYCLE_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active sellers" },
  { value: "pending", label: "Pending approval" },
  { value: "rejected", label: "Rejected" },
  { value: "inactive", label: "Inactive" },
];

const SORT_OPTIONS = [
  { value: "orders_desc", label: "Most active orders" },
  { value: "radius_desc", label: "Largest radius" },
  { value: "name_asc", label: "Store name A-Z" },
  { value: "city_asc", label: "City A-Z" },
  { value: "recent", label: "Newest first" },
];

const mapContainerStyle = {
  width: "100%",
  height: "100%",
  minHeight: "600px",
};

const lifecycleClassMap = {
  active: "bg-primary/10 text-primary border-primary/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  rejected: "bg-danger/10 text-danger border-danger/20",
  inactive: "bg-slate-100 text-slate-700 border-slate-200",
  verified: "bg-primary/10 text-primary border-primary/20",
  unverified: "bg-slate-100 text-slate-700 border-slate-200",
};

const SELLER_CIRCLE_PALETTE = [
  "#2563eb",
  "var(--primary)",
  "#ea580c",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#ca8a04",
  "#db2777",
  "#4f46e5",
  "#059669",
  "#b91c1c",
  "#9333ea",
];

function hashString(value = "") {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getSellerColor(sellerId = "") {
  return SELLER_CIRCLE_PALETTE[
    hashString(String(sellerId)) % SELLER_CIRCLE_PALETTE.length
  ];
}

function getBoundsForRadius(center, radiusKm = 10) {
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
    return null;
  }

  const latDelta = radiusKm / 111;
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const safeCosLat = Math.max(Math.abs(cosLat), 0.1);
  const lngDelta = radiusKm / (111 * safeCosLat);

  return {
    north: center.lat + latDelta,
    south: center.lat - latDelta,
    east: center.lng + lngDelta,
    west: center.lng - lngDelta,
  };
}

const ActiveSellerMap = ({
  googleMapApiKey,
  mapMeta,
  mapItems,
  selectedSeller,
  setSelectedSellerId,
  getCircleOptions,
}) => {
  const mapRef = useRef(null);
  const { isLoaded: mapLoaded, loadError: mapLoadError } = useJsApiLoader({
    id: "admin-seller-locations-map",
    googleMapsApiKey: googleMapApiKey,
    libraries: MAP_LIBRARIES,
  });

  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !window.google) return;

    if (selectedSeller?.hasValidLocation && selectedSeller?.location) {
      const focusBounds = getBoundsForRadius(
        {
          lat: selectedSeller.location.lat,
          lng: selectedSeller.location.lng,
        },
        TARGET_VIEW_RADIUS_KM,
      );

      if (focusBounds) {
        const bounds = new window.google.maps.LatLngBounds(
          { lat: focusBounds.south, lng: focusBounds.west },
          { lat: focusBounds.north, lng: focusBounds.east },
        );
        mapRef.current.fitBounds(bounds, 40);
      } else {
        mapRef.current.panTo({
          lat: selectedSeller.location.lat,
          lng: selectedSeller.location.lng,
        });
        mapRef.current.setZoom(12);
      }
      return;
    }

    if (mapMeta?.bounds) {
      const bounds = new window.google.maps.LatLngBounds(
        { lat: mapMeta.bounds.south, lng: mapMeta.bounds.west },
        { lat: mapMeta.bounds.north, lng: mapMeta.bounds.east },
      );
      mapRef.current.fitBounds(bounds, 60);
      window.google.maps.event.addListenerOnce(mapRef.current, "idle", () => {
        const currentZoom = mapRef.current?.getZoom?.();
        if (typeof currentZoom === "number" && currentZoom > 11) {
          mapRef.current.setZoom(11);
        }
      });
      return;
    }

    const center = mapMeta?.center || DEFAULT_CENTER;
    mapRef.current.panTo(center);
    mapRef.current.setZoom(11);
  }, [mapLoaded, mapMeta, mapItems.length, selectedSeller]);

  if (!googleMapApiKey || mapLoadError) {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 p-6 text-center text-white">
        <div className="max-w-md space-y-3">
          <HiOutlineExclamationTriangle className="mx-auto h-9 w-9 text-warning" />
          <p className="text-lg font-black">Google Maps is not available</p>
          <p className="text-sm text-slate-200">
            Set `VITE_GOOGLE_MAPS_API_KEY` with Maps JavaScript API enabled to
            render live coverage.
          </p>
        </div>
      </div>
    );
  }

  if (!mapLoaded) {
    return (
      <div className="flex h-full items-center justify-center font-bold text-slate-500">
        Loading map...
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={mapMeta.center || DEFAULT_CENTER}
      zoom={5}
      onLoad={(map) => {
        mapRef.current = map;
      }}
      options={{
        disableDefaultUI: true,
        zoomControl: true,
        streetViewControl: false,
        fullscreenControl: false,
        mapTypeControl: false,
        minZoom: 3,
        maxZoom: 14,
      }}>
      {mapItems.map((seller) => {
        if (!seller.hasValidLocation || !seller.location) return null;
        return (
          <React.Fragment key={seller.id}>
            <Circle
              center={{
                lat: seller.location.lat,
                lng: seller.location.lng,
              }}
              radius={Number(seller.serviceRadiusMeters || 0)}
              options={getCircleOptions(seller)}
            />
            <Marker
              position={{
                lat: seller.location.lat,
                lng: seller.location.lng,
              }}
              onClick={() => setSelectedSellerId(seller.id)}
              title={seller.shopName}
            />
          </React.Fragment>
        );
      })}
    </GoogleMap>
  );
};

const DEFAULT_SELLER_LOCATIONS_STATS = {
  totalSellers: 0,
  mappedSellers: 0,
  unmappedSellers: 0,
  citiesCovered: 0,
  totalActiveOrders: 0,
  averageRadiusKm: 0,
  maxRadiusKm: 0,
};
const DEFAULT_FILTERS_META = { categories: [], cities: [] };
const DEFAULT_MAP_META = { center: DEFAULT_CENTER, bounds: null };

const SellerLocations = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [lifecycle, setLifecycle] = useState("all");
  const [category, setCategory] = useState("all");
  const [city, setCity] = useState("all");
  const [sort, setSort] = useState("orders_desc");
  const [mapView, setMapView] = useState("coverage");
  const [page, setPage] = useState(1);
  const [selectedSellerId, setSelectedSellerId] = useState(null);
  const [mapUnlocked, setMapUnlocked] = useState(false);

  const googleMapApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

  // Perf audit Phase 8: migrated to React Query — same 300ms debounce and
  // page-reset-on-filter-change behavior. The old `requestSeq` ref guard
  // against out-of-order responses is no longer needed (React Query only
  // ever applies the latest request for a given query key). `refreshTick`
  // was dropped entirely — it was declared but never incremented anywhere
  // in this file, so it never affected anything.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [lifecycle, category, city, sort]);

  const queryParams = useMemo(
    () => ({
      q: debouncedSearch || undefined,
      lifecycle,
      category: category !== "all" ? category : undefined,
      city: city !== "all" ? city : undefined,
      sort,
      page,
      limit: PAGE_SIZE,
      mapLimit: mapUnlocked ? 300 : 0,
    }),
    [debouncedSearch, lifecycle, category, city, sort, page, mapUnlocked],
  );

  const {
    data: queryData,
    isLoading: loading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: ["admin", "sellerLocations", queryParams],
    queryFn: async () => {
      const response = await adminApi.getSellerLocations(queryParams);
      const payload = response.data?.result || {};
      const listItems = Array.isArray(payload.items) ? payload.items : [];
      const fullMapItems = Array.isArray(payload.mapItems) ? payload.mapItems : [];

      return {
        items: listItems,
        mapItems: fullMapItems,
        stats: {
          totalSellers: Number(payload.stats?.totalSellers || 0),
          mappedSellers: Number(payload.stats?.mappedSellers || 0),
          unmappedSellers: Number(payload.stats?.unmappedSellers || 0),
          citiesCovered: Number(payload.stats?.citiesCovered || 0),
          totalActiveOrders: Number(payload.stats?.totalActiveOrders || 0),
          averageRadiusKm: Number(payload.stats?.averageRadiusKm || 0),
          maxRadiusKm: Number(payload.stats?.maxRadiusKm || 0),
        },
        filtersMeta: {
          categories: Array.isArray(payload.filters?.categories) ? payload.filters.categories : [],
          cities: Array.isArray(payload.filters?.cities) ? payload.filters.cities : [],
        },
        mapMeta: {
          center: payload.map?.center || DEFAULT_CENTER,
          bounds: payload.map?.bounds || null,
        },
        total: Number(payload.total || listItems.length),
        totalPages: Number(payload.totalPages || 1),
      };
    },
    placeholderData: keepPreviousData,
  });

  const items = queryData?.items ?? [];
  const mapItems = queryData?.mapItems ?? [];
  const stats = queryData?.stats ?? DEFAULT_SELLER_LOCATIONS_STATS;
  const filtersMeta = queryData?.filtersMeta ?? DEFAULT_FILTERS_META;
  const mapMeta = queryData?.mapMeta ?? DEFAULT_MAP_META;
  const total = queryData?.total ?? 0;
  const totalPages = queryData?.totalPages ?? 1;
  const error = isError
    ? (queryError?.response?.data?.message || "Failed to load seller locations.")
    : "";

  useEffect(() => {
    if (isError) {
      console.error("Failed to load seller locations", queryError);
      toast.error(error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError]);

  // Auto-select a seller from the freshly loaded list — same logic as
  // before, now reacting to the query's `items` instead of running inline
  // inside the fetch.
  useEffect(() => {
    setSelectedSellerId((previous) => {
      if (!items.length) return null;
      if (!previous) return items[0].id;
      const stillExists = items.some((seller) => seller.id === previous);
      return stillExists ? previous : items[0].id;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const selectedSeller = useMemo(
    () =>
      mapItems.find((seller) => seller.id === selectedSellerId) ||
      items.find((seller) => seller.id === selectedSellerId) ||
      null,
    [mapItems, items, selectedSellerId],
  );

  const mapRowClass = (seller) =>
    cn(
      "w-full text-left rounded-xl px-3 py-3 transition-all border",
      selectedSellerId === seller.id
        ? "bg-primary text-white border-primary shadow-sm"
        : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50",
    );

  const getCircleOptions = (seller) => {
    const selected = selectedSellerId === seller.id;
    const baseColor = getSellerColor(seller.id);
    const density = Number(seller.densityScore || 1);

    let fillOpacity = selected ? 0.22 : 0.11;
    let strokeOpacity = selected ? 0.88 : 0.5;
    let strokeWeight = selected ? 2.2 : 1.4;

    if (mapView === "density") {
      if (density >= 4) {
        fillOpacity = selected ? 0.28 : 0.16;
        strokeOpacity = selected ? 0.95 : 0.62;
        strokeWeight = selected ? 2.8 : 1.8;
      } else if (density >= 3) {
        fillOpacity = selected ? 0.25 : 0.14;
        strokeOpacity = selected ? 0.92 : 0.56;
        strokeWeight = selected ? 2.5 : 1.6;
      } else if (density >= 2) {
        fillOpacity = selected ? 0.23 : 0.12;
        strokeOpacity = selected ? 0.9 : 0.52;
      }
    }

    return {
      fillColor: baseColor,
      fillOpacity,
      strokeColor: baseColor,
      strokeOpacity,
      strokeWeight,
    };
  };

  return (
    <div className="flex min-h-[calc(100vh-84px)] flex-col gap-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Seller Locations
            <Badge variant="primary">Google Maps</Badge>
          </span>
        }
        description="Global view of seller locations, radius coverage, and order density."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl bg-slate-100 p-1">
              <button
                onClick={() => setMapView("coverage")}
                disabled={!mapUnlocked}
                className={cn(
                  "rounded-lg px-4 py-1.5 text-[10px] font-bold transition-all",
                  !mapUnlocked
                    ? "cursor-not-allowed text-slate-400"
                    : mapView === "coverage"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700",
                )}>
                Coverage
              </button>
              <button
                onClick={() => setMapView("density")}
                disabled={!mapUnlocked}
                className={cn(
                  "rounded-lg px-4 py-1.5 text-[10px] font-bold transition-all",
                  !mapUnlocked
                    ? "cursor-not-allowed text-slate-400"
                    : mapView === "density"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700",
                )}>
                Density
              </button>
            </div>

            {mapUnlocked && (
              <button
                onClick={() => setMapUnlocked(false)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-bold text-slate-600 shadow-sm transition-all hover:text-slate-900"
                title="Lock map to save API cost">
                Lock Map
              </button>
            )}

            <button
              onClick={() => setRefreshTick((value) => value + 1)}
              className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition-all hover:text-primary"
              title="Refresh">
              <HiOutlineArrowPath className={cn("h-5 w-5", loading && "animate-spin")} />
            </button>
          </div>
        }
      />

      <div className="grid shrink-0 grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Sellers" value={stats.totalSellers.toLocaleString("en-IN")} icon={HiOutlineUsers} color="text-primary" bg="bg-primary/10" />
        <StatCard label="Mapped" value={stats.mappedSellers.toLocaleString("en-IN")} icon={HiOutlineMapPin} color="text-info" bg="bg-info/10" />
        <StatCard label="Avg Radius" value={`${stats.averageRadiusKm} km`} icon={HiOutlineGlobeAlt} color="text-warning" bg="bg-warning/10" />
        <StatCard label="Active Orders" value={stats.totalActiveOrders.toLocaleString("en-IN")} icon={HiOutlineClipboardDocumentList} color="text-success" bg="bg-success/10" />
      </div>

      <div className="grid min-h-[600px] flex-1 grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="flex min-h-0 flex-col overflow-hidden p-0">
          <div className="space-y-3 border-b border-slate-100 p-4">
            <div className="relative">
              <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by store, owner, city..."
                className="w-full rounded-md border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs font-semibold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={lifecycle}
                onChange={(event) => setLifecycle(event.target.value)}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 outline-none">
                {LIFECYCLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 outline-none">
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 outline-none">
                <option value="all">All categories</option>
                {filtersMeta.categories.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 outline-none">
                <option value="all">All cities</option>
                {filtersMeta.cities.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm font-bold text-slate-500">
                Loading seller nodes...
              </div>
            ) : error ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <HiOutlineExclamationTriangle className="h-8 w-8 text-danger" />
                <p className="text-sm font-bold text-slate-600">{error}</p>
              </div>
            ) : items.length ? (
                items.map((seller) => {
                const sellerColor = getSellerColor(seller.id);
                return (
                  <button
                    key={seller.id}
                    onClick={() => setSelectedSellerId(seller.id)}
                    className={mapRowClass(seller)}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border-2",
                          selectedSellerId === seller.id
                            ? "border-white/20 bg-white/10"
                            : "border-slate-50"
                        )}
                        style={selectedSellerId !== seller.id ? { backgroundColor: `${sellerColor}15`, color: sellerColor, borderColor: `${sellerColor}30` } : {}}
                      >
                        <HiOutlineBuildingOffice2 className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-xs font-black">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full shadow-sm"
                            style={{ backgroundColor: sellerColor }}
                          />
                          {seller.shopName}
                        </p>
                      <p
                        className={cn(
                          "text-[10px] mt-1 truncate",
                          selectedSellerId === seller.id
                            ? "text-white/70"
                            : "text-slate-500",
                        )}>
                        {seller.ownerName || "Owner not available"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wide",
                            selectedSellerId === seller.id
                              ? "bg-white/10 border-white/20 text-white"
                              : lifecycleClassMap[seller.lifecycle] ||
                                  lifecycleClassMap.unverified,
                          )}>
                          {seller.lifecycle}
                        </span>
                        <span
                          className={cn(
                            "text-[9px] font-bold",
                            selectedSellerId === seller.id
                              ? "text-white/80"
                              : "text-slate-500",
                          )}>
                          {seller.serviceRadiusKm}km
                        </span>
                        <span
                          className={cn(
                            "text-[9px] font-bold",
                            selectedSellerId === seller.id
                              ? "text-white/80"
                              : "text-slate-500",
                          )}>
                          {seller.activeOrders} active orders
                        </span>
                        {!seller.hasValidLocation && (
                          <span
                            className={cn(
                              "text-[9px] font-bold px-2 py-0.5 rounded-full border",
                              selectedSellerId === seller.id
                                ? "bg-white/10 border-white/20 text-white"
                                : "bg-warning/10 text-warning border-warning/20",
                            )}>
                            No map pin
                          </span>
                        )}
                      </div>
                    </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
                <HiOutlineGlobeAlt className="h-10 w-10 text-slate-300" />
                <p className="text-sm font-bold text-slate-500">
                  No sellers matched the selected filters.
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 px-3 pb-3 pt-1">
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              onPageSizeChange={() => {}}
              loading={loading}
            />
          </div>
        </Card>

        <Card className="relative min-h-0 overflow-hidden p-0">
          {!mapUnlocked ? (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-white p-6">
              <div className="max-w-xl space-y-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <HiOutlineMap className="h-6 w-6" />
                </div>
                <h3 className="text-2xl font-black text-slate-900">
                  Map Is Locked To Save API Cost
                </h3>
                <p className="text-sm font-semibold leading-relaxed text-slate-600">
                  Google Maps loads only when needed. Click below to open the
                  live map for this session.
                </p>
                <button
                  onClick={() => setMapUnlocked(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-black text-white transition-colors hover:bg-slate-800">
                  <HiOutlineMap className="h-4 w-4" />
                  Open Live Map
                </button>
                <p className="text-[11px] font-semibold text-slate-500">
                  Tip: keep map closed while filtering to minimize Google Maps
                  charges.
                </p>
              </div>
            </div>
          ) : (
            <ActiveSellerMap
              googleMapApiKey={googleMapApiKey}
              mapMeta={mapMeta}
              mapItems={mapItems}
              selectedSeller={selectedSeller}
              setSelectedSellerId={setSelectedSellerId}
              getCircleOptions={getCircleOptions}
            />
          )}

          {mapUnlocked && (
            <div className="absolute bottom-5 left-5 z-20">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-4 py-2 text-[10px] font-bold text-slate-700 shadow-lg backdrop-blur-md">
                <HiOutlineInformationCircle className="h-4 w-4 text-slate-500" />
                Circles represent seller service radius. Density colors indicate live order load.
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default SellerLocations;
