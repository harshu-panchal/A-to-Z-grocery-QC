import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@core/context/AuthContext";
import { adminApi } from "@/modules/admin/services/adminApi";
import { sellerApi } from "@/modules/seller/services/sellerApi";
import {
  onNotificationNew,
  onOrderStatusUpdate,
} from "@core/services/orderSocket";

const EMPTY_ADMIN = Object.freeze({
  pendingOrders: 0,
  pendingSellers: 0,
  pendingDelivery: 0,
  pendingWithdrawals: 0,
  pendingProducts: 0,
  pendingReturns: 0,
});

const EMPTY_SELLER = Object.freeze({
  pendingOrders: 0,
  pendingReturns: 0,
  pendingWithdrawals: 0,
});

const SidebarBadgesContext = createContext(undefined);

const POLL_INTERVAL_MS = 45000;

function normalizeCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export const SidebarBadgesProvider = ({ children }) => {
  const { token, role } = useAuth();
  const [badges, setBadges] = useState(() =>
    role === "seller" ? { ...EMPTY_SELLER } : { ...EMPTY_ADMIN },
  );
  const fetchInFlightRef = useRef(false);
  const roleRef = useRef(role);
  const tokenRef = useRef(token);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const refreshBadges = useCallback(async () => {
    const currentRole = String(roleRef.current || "").toLowerCase();
    const currentToken = tokenRef.current;
    if (!currentToken || (currentRole !== "admin" && currentRole !== "seller")) {
      setBadges(currentRole === "seller" ? { ...EMPTY_SELLER } : { ...EMPTY_ADMIN });
      return;
    }
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    try {
      const response =
        currentRole === "seller"
          ? await sellerApi.getSidebarBadges()
          : await adminApi.getSidebarBadges();
      const result = response?.data?.result || {};
      if (currentRole === "seller") {
        setBadges({
          pendingOrders: normalizeCount(result.pendingOrders),
          pendingReturns: normalizeCount(result.pendingReturns),
          pendingWithdrawals: normalizeCount(result.pendingWithdrawals),
        });
      } else {
        setBadges({
          pendingOrders: normalizeCount(result.pendingOrders),
          pendingSellers: normalizeCount(result.pendingSellers),
          pendingDelivery: normalizeCount(result.pendingDelivery),
          pendingWithdrawals: normalizeCount(result.pendingWithdrawals),
          pendingProducts: normalizeCount(result.pendingProducts),
          pendingReturns: normalizeCount(result.pendingReturns),
        });
      }
    } catch (error) {
      console.error("Sidebar badges fetch failed:", error);
    } finally {
      fetchInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!token || (role !== "admin" && role !== "seller")) {
      setBadges(role === "seller" ? { ...EMPTY_SELLER } : { ...EMPTY_ADMIN });
      return undefined;
    }

    refreshBadges();

    const intervalId = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      refreshBadges();
    }, POLL_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") refreshBadges();
    };
    document.addEventListener("visibilitychange", onVisible);

    const getToken = () => tokenRef.current;
    const unsubNotif = onNotificationNew(getToken, () => refreshBadges());
    const unsubOrder = onOrderStatusUpdate(getToken, () => refreshBadges());

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      if (typeof unsubNotif === "function") unsubNotif();
      if (typeof unsubOrder === "function") unsubOrder();
    };
  }, [token, role, refreshBadges]);

  const value = useMemo(
    () => ({
      badges,
      refreshBadges,
    }),
    [badges, refreshBadges],
  );

  return (
    <SidebarBadgesContext.Provider value={value}>
      {children}
    </SidebarBadgesContext.Provider>
  );
};

export function useSidebarBadges() {
  const ctx = useContext(SidebarBadgesContext);
  if (!ctx) {
    return {
      badges: EMPTY_ADMIN,
      refreshBadges: async () => {},
    };
  }
  return ctx;
}

export default SidebarBadgesContext;
