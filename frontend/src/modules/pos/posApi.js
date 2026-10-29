import axiosInstance from "@core/api/axios";

/** API result (objects come back as `result`, arrays as `results`). */
const unwrap = (res) => res.data?.result ?? res.data?.results;

/**
 * POS API for one portal. Admin and Seller hit the same endpoints under
 * /admin/pos and /seller/pos; the backend scopes data to the caller.
 */
export function makePosApi(portal) {
  const base = `/${portal}/pos`;
  const get = (url, params) => axiosInstance.get(base + url, { params }).then(unwrap);
  const post = (url, body) => axiosInstance.post(base + url, body).then(unwrap);
  const put = (url, body) => axiosInstance.put(base + url, body).then(unwrap);
  const patch = (url, body) => axiosInstance.patch(base + url, body).then(unwrap);
  const del = (url, params) => axiosInstance.delete(base + url, { params }).then(unwrap);

  return {
    portal,
    // catalogue
    searchProducts: (params) => get("/products", params),
    quickAddProduct: (body) => post("/products/quick", body),
    sellers: () => get("/sellers"),
    // bills
    summary: () => get("/summary"),
    listOrders: (params) => get("/orders", params),
    getOrder: (id) => get(`/orders/${id}`),
    createOrder: (body) => post("/orders", body),
    updateOrder: (id, body) => patch(`/orders/${id}/items`, body),
    cancelOrder: (id, params) => del(`/orders/${id}`, params),
    bulkCancel: (ids, restoreStock = true) => post("/orders/bulk-cancel", { ids, restoreStock }),
    exchange: (body) => post("/exchange", body),
    // inventory tools
    barcodeCheck: (params) => get("/barcode-check", params),
    packList: (orderId) => get(`/pack-list/${encodeURIComponent(orderId)}`),
    expiry: (params) => get("/expiry", params),
    reorder: (params) => get("/reorder", params),
    channelReport: (params) => get("/channel-report", params),
    // stock ledger
    stockLedger: (params) => get("/stock-ledger", params),
    updateLedger: (id, body) => put(`/stock-ledger/${id}`, body),
    // customers + udhaar
    customers: (params) => get("/customers", params),
    createCustomer: (body) => post("/customers", body),
    getCustomer: (id) => get(`/customers/${id}`),
    updateCustomer: (id, body) => put(`/customers/${id}`, body),
    deleteCustomer: (id) => del(`/customers/${id}`),
    customerOrders: (id, params) => get(`/customers/${id}/orders`, params),
    addCredit: (body) => post("/credit/add", body),
    receivePayment: (body) => post("/credit/payment", body),
    // suppliers
    suppliers: (params) => get("/suppliers", params),
    createSupplier: (body) => post("/suppliers", body),
    getSupplier: (id) => get(`/suppliers/${id}`),
    updateSupplier: (id, body) => put(`/suppliers/${id}`, body),
    deleteSupplier: (id) => del(`/suppliers/${id}`),
    supplierDebt: (id, body) => post(`/suppliers/${id}/debt`, body),
    paySupplier: (id, body) => post(`/suppliers/${id}/pay`, body),
    reverseSupplierTxn: (id, txnId) => post(`/suppliers/${id}/transactions/${txnId}/reverse`),
    // purchases + quotations
    entries: (params) => get("/purchase-entries", params),
    getEntry: (id) => get(`/purchase-entries/${id}`),
    createEntry: (body) => post("/purchase-entries", body),
    updateEntry: (id, body) => put(`/purchase-entries/${id}`, body),
    deleteEntry: (id) => del(`/purchase-entries/${id}`),
    completePurchase: (id) => post(`/purchase-entries/${id}/complete`),
    // GST register
    gstRegister: (params) => get("/gst-register", params),
    createGst: (body) => post("/gst-register", body),
    updateGst: (id, body) => patch(`/gst-register/${id}`, body),
    deleteGst: (id) => del(`/gst-register/${id}`),
    // terminal state + settings
    getState: () => get("/state"),
    saveState: (body) => put("/state", body),
    getSettings: () => get("/settings"),
    saveSettings: (body) => put("/settings", body),
  };
}

export const apiError = (err, fallback = "Something went wrong") =>
  err?.response?.data?.message || err?.message || fallback;
