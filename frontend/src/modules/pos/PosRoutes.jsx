import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

const PosTerminal = React.lazy(() => import("./pages/PosTerminal"));
const PosReport = React.lazy(() => import("./pages/PosReport"));
const PosCustomers = React.lazy(() => import("./pages/PosParties").then((m) => ({ default: m.PosCustomers })));
const PosCustomerDetail = React.lazy(() => import("./pages/PosParties").then((m) => ({ default: m.PosCustomerDetail })));
const PosSuppliers = React.lazy(() => import("./pages/PosParties").then((m) => ({ default: m.PosSuppliers })));
const PosSupplierDetail = React.lazy(() => import("./pages/PosParties").then((m) => ({ default: m.PosSupplierDetail })));
const PosEntries = React.lazy(() => import("./pages/PosEntries").then((m) => ({ default: m.PosEntries })));
const PosEntryEditor = React.lazy(() => import("./pages/PosEntries").then((m) => ({ default: m.PosEntryEditor })));
const PosGstRegister = React.lazy(() => import("./pages/PosGstAndSettings").then((m) => ({ default: m.PosGstRegister })));
const PosExpiry = React.lazy(() => import("./pages/PosInventory").then((m) => ({ default: m.PosExpiry })));
const PosReorder = React.lazy(() => import("./pages/PosInventory").then((m) => ({ default: m.PosReorder })));
const PosSettingsPage = React.lazy(() => import("./pages/PosGstAndSettings").then((m) => ({ default: m.PosSettingsPage })));

/** Every POS screen, mounted under /admin/pos/* and /seller/pos/*. */
export default function PosRoutes({ portal }) {
  return (
    <Routes>
      <Route index element={<PosTerminal portal={portal} />} />
      <Route path="report" element={<PosReport portal={portal} />} />
      <Route path="customers" element={<PosCustomers portal={portal} />} />
      <Route path="customers/:id" element={<PosCustomerDetail portal={portal} />} />
      <Route path="suppliers" element={<PosSuppliers portal={portal} />} />
      <Route path="suppliers/:id" element={<PosSupplierDetail portal={portal} />} />
      <Route path="purchases" element={<PosEntries portal={portal} type="purchase" />} />
      <Route path="quotations" element={<PosEntries portal={portal} type="quotation" />} />
      <Route path="purchases/:id" element={<PosEntryEditor portal={portal} />} />
      <Route path="gst-register" element={<PosGstRegister portal={portal} />} />
      <Route path="settings" element={<PosSettingsPage portal={portal} />} />
      <Route path="expiry" element={<PosExpiry portal={portal} />} />
      <Route path="reorder" element={<PosReorder portal={portal} />} />
      <Route path="*" element={<Navigate to="." replace />} />
    </Routes>
  );
}

/** Sidebar entry shared by both panels. */
export const posNavItem = (portal, icon, extra = {}) => ({
  label: "POS (Counter Billing)",
  icon,
  group: "POS",
  ...extra,
  children: [
    { label: "Billing", path: `/${portal}/pos`, end: true },
    { label: "Bills & Stock Report", path: `/${portal}/pos/report` },
    { label: "Low Stock & Reorder", path: `/${portal}/pos/reorder` },
    { label: "Expiry Alerts", path: `/${portal}/pos/expiry` },
    { label: "Customers & Udhaar", path: `/${portal}/pos/customers` },
    { label: "Suppliers", path: `/${portal}/pos/suppliers` },
    { label: "Purchase Entries", path: `/${portal}/pos/purchases` },
    { label: "Quotations", path: `/${portal}/pos/quotations` },
    { label: "GST Register", path: `/${portal}/pos/gst-register` },
    { label: "POS Settings", path: `/${portal}/pos/settings` },
  ],
});
