import React, { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "@shared/layout/DashboardLayout";
import { useSupportUnread } from "@core/context/SupportUnreadContext";
import { useSidebarBadges } from "@core/context/SidebarBadgesContext";
import { setActiveRole, ROLES } from "@core/auth/activeRoleStore";
import {
  LayoutDashboard,
  Tag,
  Box,
  Building2,
  Truck,
  Wallet,
  Banknote,
  Receipt,
  CircleDollarSign,
  Users,
  HelpCircle,
  ScrollText,
  ClipboardList,
  RotateCcw,
  Settings,
  Terminal,
  Sparkles,
  User,
  Store,
} from "lucide-react";

const Dashboard = React.lazy(() => import("../pages/Dashboard"));
const CategoryManagement = React.lazy(
  () => import("../pages/CategoryManagement"),
);
const HeaderCategories = React.lazy(
  () => import("../pages/categories/HeaderCategories"),
);
const Level2Categories = React.lazy(
  () => import("../pages/categories/Level2Categories"),
);
const SubCategories = React.lazy(
  () => import("../pages/categories/SubCategories"),
);
const CategoryHierarchy = React.lazy(
  () => import("../pages/categories/CategoryHierarchy"),
);
const ProductManagement = React.lazy(
  () => import("../pages/ProductManagement"),
);
const ActiveSellers = React.lazy(() => import("../pages/ActiveSellers"));
const PendingSellers = React.lazy(() => import("../pages/PendingSellers"));
const SellerLocations = React.lazy(() => import("../pages/SellerLocations"));
const ActiveDeliveryBoys = React.lazy(
  () => import("../pages/ActiveDeliveryBoys"),
);
const PendingDeliveryBoys = React.lazy(
  () => import("../pages/PendingDeliveryBoys"),
);
const DeliveryFunds = React.lazy(() => import("../pages/DeliveryFunds"));
const AdminWallet = React.lazy(() => import("../pages/AdminWallet"));
const WithdrawalRequests = React.lazy(
  () => import("../pages/WithdrawalRequests"),
);
const SellerTransactions = React.lazy(
  () => import("../pages/SellerTransactions"),
);
const CashCollection = React.lazy(() => import("../pages/CashCollection"));
const CustomerManagement = React.lazy(
  () => import("../pages/CustomerManagement"),
);
const CustomerDetail = React.lazy(() => import("../pages/CustomerDetail"));
// Audit fix: UserManagement was a non-functional, unreachable-from-nav
// page — "Add Internal User" and every row's "Manage" button had no
// onClick handler at all, and it duplicated CustomerManagement.jsx (the
// real, working, nav-linked page for this data) with a hardcoded "role:
// CUSTOMER" column. Route removed rather than left reachable by direct URL
// with dead buttons; the file itself is left in place in case internal
// (non-customer) platform-user management is built out later.
// const UserManagement = React.lazy(() => import("../pages/UserManagement"));
const Profile = React.lazy(() => import("@/pages/Profile"));
const FAQManagement = React.lazy(() => import("../pages/FAQManagement"));
const AdminLegalPages = React.lazy(() => import("../pages/AdminLegalPages"));
const OrdersList = React.lazy(() => import("../pages/OrdersList"));
const OrderDetail = React.lazy(() => import("../pages/OrderDetail"));
const Returns = React.lazy(() => import("../pages/Returns"));
const SellerDetail = React.lazy(() => import("../pages/SellerDetail"));
const SupportTickets = React.lazy(() => import("../pages/SupportTickets"));
const ReviewModeration = React.lazy(() => import("../pages/ReviewModeration"));
const FleetTracking = React.lazy(() => import("../pages/FleetTracking"));
const CouponManagement = React.lazy(() => import("../pages/CouponManagement"));
const ContentManager = React.lazy(() => import("../pages/ContentManager"));
const HeroCategoriesPerPage = React.lazy(() => import("../pages/HeroCategoriesPerPage"));
const NotificationComposer = React.lazy(
  () => import("../pages/NotificationComposer"),
);
const OffersManagement = React.lazy(
  () => import("../pages/OffersManagement"),
);
const OfferSectionsManagement = React.lazy(
  () => import("../pages/OfferSectionsManagement"),
);
const ShopByStoreManagement = React.lazy(
  () => import("../pages/ShopByStoreManagement"),
);
const AdminSettings = React.lazy(() => import("../pages/AdminSettings"));
const EnvSettings = React.lazy(() => import("../pages/EnvSettings"));
const AdminProfile = React.lazy(() => import("../pages/AdminProfile"));

const navItems = [
  {
    label: "Dashboard",
    path: "/admin",
    icon: LayoutDashboard,
    color: "indigo",
    group: "Overview",
    end: true,
  },
  {
    label: "Categories",
    icon: Tag,
    color: "rose",
    group: "Catalog & Growth",
    children: [
      { label: "All Categories", path: "/admin/categories/hierarchy" },
      { label: "Header Categories", path: "/admin/categories/header" },
      { label: "Main Categories", path: "/admin/categories/level2" },
      { label: "Sub-Categories", path: "/admin/categories/sub" },
    ],
  },
  { label: "Products", path: "/admin/products", icon: Box, color: "amber", group: "Catalog & Growth" },
  {
    label: "Marketing Tools",
    icon: Sparkles,
    color: "amber",
    group: "Catalog & Growth",
    children: [
      { label: "Create Sections", path: "/admin/experience-studio" },
      { label: "Hero & categories per page", path: "/admin/hero-categories" },
      { label: "Send Notifications", path: "/admin/notifications" },
      { label: "Coupons & Promos", path: "/admin/coupons" },
      { label: "Offer Sections", path: "/admin/offer-sections" },
      { label: "Shop by Store", path: "/admin/shop-by-store" },
    ],
  },
  {
    label: "Customer Support",
    icon: Receipt,
    color: "emerald",
    group: "Orders & Support",
    children: [
      { label: "Help Tickets", path: "/admin/support-tickets" },
      { label: "Review Content", path: "/admin/moderation" },
    ],
  },
  {
    label: "Sellers",
    icon: Store,
    color: "blue",
    group: "People",
    children: [
      { label: "Active Sellers", path: "/admin/sellers/active" },
      { label: "Waiting for Review", path: "/admin/sellers/pending" },
      { label: "Seller Locations", path: "/admin/seller-locations" },
    ],
  },
  {
    label: "Delivery Drivers",
    icon: Truck,
    color: "emerald",
    group: "People",
    children: [
      { label: "Active Drivers", path: "/admin/delivery-boys/active" },
      { label: "Waiting for Review", path: "/admin/delivery-boys/pending" },
      { label: "Track Drivers", path: "/admin/tracking" },
      { label: "Send Money", path: "/admin/delivery-funds" },
    ],
  },
  { label: "Wallet", path: "/admin/wallet", icon: Wallet, color: "violet", group: "Finance" },
  {
    label: "Money Requests",
    path: "/admin/withdrawals",
    icon: Banknote,
    color: "cyan",
    group: "Finance",
  },
  {
    label: "Seller Payments",
    path: "/admin/seller-transactions",
    icon: Receipt,
    color: "orange",
    group: "Finance",
  },
  {
    label: "Collect Cash",
    path: "/admin/cash-collection",
    icon: CircleDollarSign,
    color: "green",
    group: "Finance",
  },
  { label: "Customers", path: "/admin/customers", icon: Users, color: "sky", group: "People" },
  { label: "FAQs", path: "/admin/faqs", icon: HelpCircle, color: "pink", group: "Orders & Support" },
  {
    label: "Legal Pages",
    path: "/admin/legal-pages",
    icon: ScrollText,
    color: "violet",
    group: "System",
  },
  {
    label: "Orders",
    icon: ClipboardList,
    color: "fuchsia",
    group: "Orders & Support",
    children: [
      { label: "All Orders", path: "/admin/orders/all" },
      { label: "New Orders", path: "/admin/orders/pending" },
      { label: "Being Prepared", path: "/admin/orders/processed" },
      { label: "On the Way", path: "/admin/orders/out-for-delivery" },
      { label: "Delivered", path: "/admin/orders/delivered" },
      { label: "Cancelled", path: "/admin/orders/cancelled" },
      { label: "Returned", path: "/admin/orders/returned" },
      { label: "Return Requests", path: "/admin/returns" },
    ],
  },
  {
    label: "Fees & Charges",
    path: "/admin/billing",
    icon: RotateCcw,
    color: "red",
    group: "Finance",
  },
  {
    label: "Settings",
    path: "/admin/settings",
    icon: Settings,
    color: "slate",
    group: "System",
  },
  { label: "My Profile", path: "/admin/profile", icon: User, color: "indigo", group: "System" },
  { label: "System Settings", path: "/admin/env", icon: Terminal, color: "dark", group: "System" },
];

const BillingCharges = React.lazy(() => import("../pages/BillingCharges"));

const AdminRoutes = () => {
  useEffect(() => {
    setActiveRole(ROLES.ADMIN);
  }, []);

  const { totalUnread } = useSupportUnread();
  const { badges } = useSidebarBadges();

  const navItemsWithBadges = React.useMemo(() => {
    const supportUnread = Number.isFinite(totalUnread) ? totalUnread : 0;
    const pendingOrders = Number(badges?.pendingOrders || 0);
    const pendingSellers = Number(badges?.pendingSellers || 0);
    const pendingDelivery = Number(badges?.pendingDelivery || 0);
    const pendingWithdrawals = Number(badges?.pendingWithdrawals || 0);
    const pendingProducts = Number(badges?.pendingProducts || 0);
    const pendingReturns = Number(badges?.pendingReturns || 0);

    return navItems.map((item) => {
      if (item?.label === "Customer Support") {
        if (supportUnread <= 0) return item;
        return {
          ...item,
          badgeCount: supportUnread,
          children: (item.children || []).map((child) =>
            child.path === "/admin/support-tickets"
              ? { ...child, badgeCount: supportUnread }
              : child,
          ),
        };
      }

      if (item?.label === "Products") {
        return pendingProducts > 0
          ? { ...item, badgeCount: pendingProducts }
          : item;
      }

      if (item?.label === "Sellers") {
        if (pendingSellers <= 0) return item;
        return {
          ...item,
          badgeCount: pendingSellers,
          children: (item.children || []).map((child) =>
            child.path === "/admin/sellers/pending"
              ? { ...child, badgeCount: pendingSellers }
              : child,
          ),
        };
      }

      if (item?.label === "Delivery Drivers") {
        if (pendingDelivery <= 0) return item;
        return {
          ...item,
          badgeCount: pendingDelivery,
          children: (item.children || []).map((child) =>
            child.path === "/admin/delivery-boys/pending"
              ? { ...child, badgeCount: pendingDelivery }
              : child,
          ),
        };
      }

      if (item?.label === "Money Requests") {
        return pendingWithdrawals > 0
          ? { ...item, badgeCount: pendingWithdrawals }
          : item;
      }

      if (item?.label === "Orders") {
        const ordersBadge = pendingOrders + pendingReturns;
        if (ordersBadge <= 0) return item;
        return {
          ...item,
          badgeCount: ordersBadge,
          children: (item.children || []).map((child) => {
            if (child.path === "/admin/orders/pending" && pendingOrders > 0) {
              return { ...child, badgeCount: pendingOrders };
            }
            if (child.path === "/admin/returns" && pendingReturns > 0) {
              return { ...child, badgeCount: pendingReturns };
            }
            return child;
          }),
        };
      }

      return item;
    });
  }, [totalUnread, badges]);

  return (
    <DashboardLayout navItems={navItemsWithBadges} title="Admin Center">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/profile" element={<AdminProfile />} />
        {/* Lazy routes for new sections */}
        <Route
          path="/categories"
          element={<Navigate to="/admin/categories/header" replace />}
        />
        <Route path="/categories/header" element={<HeaderCategories />} />
        <Route path="/categories/level2" element={<Level2Categories />} />
        <Route path="/categories/sub" element={<SubCategories />} />
        <Route path="/categories/hierarchy" element={<CategoryHierarchy />} />
        <Route path="/products" element={<ProductManagement />} />
        <Route path="/sellers/active" element={<ActiveSellers />} />
        <Route path="/sellers/active/:id" element={<SellerDetail />} />
        <Route path="/support-tickets" element={<SupportTickets />} />
        <Route path="/moderation" element={<ReviewModeration />} />
        <Route path="/experience-studio" element={<ContentManager />} />
        <Route path="/hero-categories" element={<HeroCategoriesPerPage />} />
        <Route path="/notifications" element={<NotificationComposer />} />
        <Route path="/offers" element={<OffersManagement />} />
        <Route path="/offer-sections" element={<OfferSectionsManagement />} />
        <Route path="/shop-by-store" element={<ShopByStoreManagement />} />
        <Route path="/coupons" element={<CouponManagement />} />
        <Route path="/sellers/pending" element={<PendingSellers />} />
        <Route path="/seller-locations" element={<SellerLocations />} />
        <Route path="/delivery-boys/active" element={<ActiveDeliveryBoys />} />
        <Route
          path="/delivery-boys/pending"
          element={<PendingDeliveryBoys />}
        />
        <Route path="/tracking" element={<FleetTracking />} />
        <Route path="/delivery-funds" element={<DeliveryFunds />} />
        <Route path="/wallet" element={<AdminWallet />} />
        <Route path="/withdrawals" element={<WithdrawalRequests />} />
        <Route path="/seller-transactions" element={<SellerTransactions />} />
        <Route path="/cash-collection" element={<CashCollection />} />
        <Route path="/customers" element={<CustomerManagement />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/faqs" element={<FAQManagement />} />
        <Route path="/legal-pages" element={<AdminLegalPages />} />
        <Route path="/orders/:status" element={<OrdersList />} />
        <Route path="/orders/view/:orderId" element={<OrderDetail />} />
        <Route path="/returns" element={<Returns />} />
        <Route path="/billing" element={<BillingCharges />} />
        <Route path="/settings" element={<AdminSettings />} />
        <Route path="/env" element={<EnvSettings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DashboardLayout>
  );
};

export default AdminRoutes;
