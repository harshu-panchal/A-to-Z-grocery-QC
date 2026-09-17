import React, { useEffect, useMemo } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "@shared/layout/DashboardLayout";
import { setActiveRole, ROLES } from "@core/auth/activeRoleStore";
import { useSidebarBadges } from "@core/context/SidebarBadgesContext";
import Orders from "../pages/Orders";
import {
  HiOutlineSquares2X2,
  HiOutlineCube,
  HiOutlineCurrencyDollar,
  HiOutlineUser,
  HiOutlineTruck,
  HiOutlineArchiveBox,
  HiOutlineChartBarSquare,
  HiOutlineCreditCard,
  HiOutlineMapPin,
  HiOutlineQuestionMarkCircle,
} from "react-icons/hi2";

const Dashboard = React.lazy(() => import("../pages/Dashboard"));
const ProductManagement = React.lazy(
  () => import("../pages/ProductManagement"),
);
const StockManagement = React.lazy(() => import("../pages/StockManagement"));
const AddProduct = React.lazy(() => import("../pages/AddProduct"));
// Note: Orders is imported eagerly above to avoid dynamic import issues
const Returns = React.lazy(() => import("../pages/Returns"));
const Earnings = React.lazy(() => import("../pages/Earnings"));
const Analytics = React.lazy(() => import("../pages/Analytics"));
const Transactions = React.lazy(() => import("../pages/Transactions"));
const DeliveryTracking = React.lazy(() => import("../pages/DeliveryTracking"));
const Profile = React.lazy(() => import("../pages/Profile"));
const Withdrawals = React.lazy(() => import("../pages/Withdrawals"));
const SellerSupportPage = React.lazy(() => import("../pages/SellerSupportPage"));
const SellerAboutPage = React.lazy(() => import("../pages/SellerAboutPage"));
const SellerTermsPage = React.lazy(() => import("../pages/SellerTermsPage"));
const SellerPrivacyPage = React.lazy(() => import("../pages/SellerPrivacyPage"));

const navItems = [
  { label: "Dashboard", path: "/seller", icon: HiOutlineSquares2X2, group: "Overview", end: true },
  { label: "Products", path: "/seller/products", icon: HiOutlineCube, group: "Catalog" },
  { label: "Stock", path: "/seller/inventory", icon: HiOutlineArchiveBox, group: "Catalog" },
  { label: "Orders", path: "/seller/orders", icon: HiOutlineTruck, group: "Orders" },
  { label: "Returns", path: "/seller/returns", icon: HiOutlineArchiveBox, group: "Orders" },
  { label: "Track Orders", path: "/seller/tracking", icon: HiOutlineMapPin, group: "Orders" },
  {
    label: "Sales Reports",
    path: "/seller/analytics",
    icon: HiOutlineChartBarSquare,
    group: "Finance",
  },
  {
    label: "Money Request",
    path: "/seller/withdrawals",
    icon: HiOutlineCurrencyDollar,
    group: "Finance",
  },
  {
    label: "Payment History",
    path: "/seller/transactions",
    icon: HiOutlineCreditCard,
    group: "Finance",
  },
  {
    label: "Earnings",
    path: "/seller/earnings",
    icon: HiOutlineCurrencyDollar,
    group: "Finance",
  },
  { label: "Support", path: "/seller/support", icon: HiOutlineQuestionMarkCircle, group: "Account" },
  { label: "Profile", path: "/seller/profile", icon: HiOutlineUser, group: "Account" },
];

const SellerRoutes = () => {
  useEffect(() => {
    setActiveRole(ROLES.SELLER);
  }, []);

  const { badges } = useSidebarBadges();

  const navItemsWithBadges = useMemo(() => {
    const pendingOrders = Number(badges?.pendingOrders || 0);
    const pendingReturns = Number(badges?.pendingReturns || 0);
    const pendingWithdrawals = Number(badges?.pendingWithdrawals || 0);

    return navItems.map((item) => {
      if (item.label === "Orders" && pendingOrders > 0) {
        return { ...item, badgeCount: pendingOrders };
      }
      if (item.label === "Returns" && pendingReturns > 0) {
        return { ...item, badgeCount: pendingReturns };
      }
      if (item.label === "Money Request" && pendingWithdrawals > 0) {
        return { ...item, badgeCount: pendingWithdrawals };
      }
      return item;
    });
  }, [badges]);

  return (
    <DashboardLayout navItems={navItemsWithBadges} title="Seller Panel">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<ProductManagement />} />
        <Route path="/products/add" element={<AddProduct />} />
        <Route path="/inventory" element={<StockManagement />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/returns" element={<Returns />} />
        <Route path="/tracking" element={<DeliveryTracking />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/earnings" element={<Earnings />} />
        <Route path="/withdrawals" element={<Withdrawals />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/support" element={<SellerSupportPage />} />
        <Route path="/about" element={<SellerAboutPage />} />
        <Route path="/terms" element={<SellerTermsPage />} />
        <Route path="/privacy" element={<SellerPrivacyPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DashboardLayout>
  );
};

export default SellerRoutes;
