import React, { useState, useMemo, useRef, useEffect } from "react";
import Badge from "@shared/components/ui/Badge";
import Button from "@shared/components/ui/Button";
import PageHeader from "@shared/components/ui/PageHeader";
import StatCard from "@shared/components/ui/StatCard";
import FilterBar from "@shared/components/ui/FilterBar";
import DataTable from "@shared/components/ui/DataTable";
import { SkeletonStatCard, SkeletonCard } from "@shared/components/ui/Skeleton";
import {
  HiOutlinePlus,
  HiOutlineCube,
  HiOutlineMagnifyingGlass,
  HiOutlineFunnel,
  HiOutlineTrash,
  HiOutlinePencilSquare,
  HiOutlinePhoto,
  HiOutlineArchiveBox,
  HiOutlineTag,
  HiOutlineXMark,
  HiOutlineChevronRight,
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle,
  HiOutlineFolderOpen,
  HiOutlineSwatch,
} from "react-icons/hi2";
import Modal from "@shared/components/ui/Modal";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { sellerApi } from "../services/sellerApi";
import { toast } from "sonner";
import Pagination from "@shared/components/ui/Pagination";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";

const SELLER_PRODUCTS_QUERY_KEY = ["seller", "products"];

// Perf audit FE-R3-class fix: hoisted to module scope (was previously
// defined inside the component body, giving it a new function identity on
// every render — since it's rendered as a JSX component in a DataTable
// cell, that forced a full unmount/remount of every approval badge on
// every re-render, including every keystroke in the edit-product modal).
// Pure function of its props, safe to hoist with zero visual change.
const ApprovalBadge = ({ approvalStatus }) => {
  const normalized = String(approvalStatus || "approved").toLowerCase();
  if (normalized === "pending") {
    return <Badge variant="warning">Pending Approval</Badge>;
  }
  if (normalized === "rejected") {
    return <Badge variant="danger">Rejected</Badge>;
  }
  return <Badge variant="success">Approved</Badge>;
};

const ProductManagement = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const qFromUrl = searchParams.get("q") || "";

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: categories = [], isError: isCategoriesError } = useQuery({
    queryKey: ["seller", "categoryTree"],
    queryFn: async () => {
      const res = await sellerApi.getCategoryTree();
      if (!res.data.success) return [];
      return res.data.results || res.data.result || [];
    },
  });

  useEffect(() => {
    // Audit fix (pre-existing, preserved): this used to fail silently,
    // leaving the category dropdowns empty with no explanation — since
    // handleSave requires all three category levels to be filled, the
    // seller would hit a silent dead end on every Save click with no toast
    // telling them why. AddProduct.jsx already toasts on this same
    // failure; match it.
    if (isCategoriesError) {
      toast.error("Failed to load categories. Please refresh and try again.");
    }
  }, [isCategoriesError]);

  const [searchTerm, setSearchTerm] = useState(qFromUrl);

  React.useEffect(() => {
    if (qFromUrl !== searchTerm) setSearchTerm(qFromUrl);
  }, [qFromUrl]);

  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterApproval, setFilterApproval] = useState("all"); // all | approved | pending | rejected
  const [sortBy, setSortBy] = useState("newest");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterDropdownRef = useRef(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [viewingVariants, setViewingVariants] = useState(null);
  const [isVariantsViewModalOpen, setIsVariantsViewModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [modalTab, setModalTab] = useState("general");

  const makeSku = (name, index = 1) => {
    const prefix = String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 5) || "item";
    return `${prefix}-${String(index).padStart(3, "0")}`;
  };

  const isAutoSku = (sku, name, index = 1) =>
    String(sku || "").toLowerCase() === makeSku(name, index);

  const displaySku = (product) =>
    product.sku ||
    (Array.isArray(product.variants) && product.variants.length > 0 && product.variants[0]?.sku) ||
    makeSku(product.name, 1);

  const resolveLowStockThreshold = (product) => {
    const parsed = Number(product?.lowStockAlert);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
  };

  const handleModalScrollWheel = (event) => {
    const container = event.currentTarget;
    if (container.scrollHeight <= container.clientHeight) return;
    container.scrollTop += event.deltaY;
    event.preventDefault();
    event.stopPropagation();
  };

  React.useEffect(() => {
    if (!isProductModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isProductModalOpen]);

  // Close filter dropdown on outside click
  React.useEffect(() => {
    if (!isFilterOpen) return;
    const handleClickOutside = (event) => {
      if (
        filterDropdownRef.current &&
        !filterDropdownRef.current.contains(event.target)
      ) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isFilterOpen]);

  // Perf audit Phase 8: `sortBy`/`filterApproval` are the only filters this
  // page actually sends to the server — `search`/`filterCategory`/
  // `filterStatus`/`priceMin`/`priceMax` are all applied client-side below
  // in `filteredProducts` (unchanged). The original `useEffect` re-fetched
  // from the server on *every* dependency change including every single
  // keystroke in the search box (no debounce), even though search doesn't
  // affect the server request at all. Keying this query on only
  // page/pageSize/sortBy/filterApproval removes those redundant network
  // calls — the rendered result is identical either way, since
  // `filteredProducts` re-filters the same fetched page client-side
  // regardless of when it last actually re-fetched.
  useEffect(() => {
    setPage(1);
  }, [filterApproval, sortBy, pageSize]);

  const productsQueryParams = useMemo(
    () => ({ page, limit: pageSize, sort: sortBy, approvalStatus: filterApproval }),
    [page, pageSize, sortBy, filterApproval],
  );

  const {
    data: productsQueryData,
    isLoading,
    isFetching,
    isError: isProductsError,
  } = useQuery({
    queryKey: [...SELLER_PRODUCTS_QUERY_KEY, productsQueryParams],
    queryFn: async () => {
      const res = await sellerApi.getProducts(productsQueryParams);
      if (!res.data.success) throw new Error("Failed to fetch products");
      // Backend returns handleResponse(..., { items, page, limit, total, totalPages })
      const payload = res.data.result || {};
      const rawProducts = Array.isArray(payload.items) ? payload.items : (res.data.results || []);
      const safe = Array.isArray(rawProducts) ? rawProducts : [];
      return {
        items: safe,
        total: typeof payload.total === "number" ? payload.total : safe.length,
        page: typeof payload.page === "number" ? payload.page : productsQueryParams.page,
        summaryStats:
          payload.summary && typeof payload.summary === "object"
            ? {
              total: Number(payload.summary.total) || 0,
              active: Number(payload.summary.active) || 0,
              lowStock: Number(payload.summary.lowStock) || 0,
              outOfStock: Number(payload.summary.outOfStock) || 0,
            }
            : null,
      };
    },
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (isProductsError) toast.error("Failed to fetch products");
  }, [isProductsError]);

  const products = productsQueryData?.items ?? [];
  const total = productsQueryData?.total ?? 0;
  const summaryStats = productsQueryData?.summaryStats ?? null;
  const invalidateProducts = () => queryClient.invalidateQueries({ queryKey: SELLER_PRODUCTS_QUERY_KEY });

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    sku: "",
    description: "",
    mrp: "",
    sellingPrice: "",
    purchaseRate: "",
    stock: "",
    lowStockAlert: 5,
    category: "",
    header: "",
    subcategory: "",
    status: "active",
    tags: "",
    weight: "",
    brand: "",
    rackCode: "",
    mainImage: null,
    galleryImages: [],
    variants: [
      { id: Date.now(), name: "", mrp: "", sellingPrice: "", purchaseRate: "", stock: "", sku: "" },
    ],
  });

  const safeProducts = useMemo(
    () => (Array.isArray(products) ? products : []),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const min = priceMin ? Number(priceMin) : null;
    const max = priceMax ? Number(priceMax) : null;

    return safeProducts.filter((p) => {
      const variantSkus = Array.isArray(p.variants)
        ? p.variants
          .map((v) => (v?.sku || "").toString().toLowerCase())
          .filter(Boolean)
        : [];
      const skuCandidate =
        (p.sku || "").toString().toLowerCase() ||
        (variantSkus.length > 0 ? variantSkus[0] : "");

      const matchesSearch =
        !term ||
        p.name.toLowerCase().includes(term) ||
        (!!skuCandidate && skuCandidate.includes(term));
      const matchesCategory =
        filterCategory === "all" ||
        (p.categoryId?._id || p.categoryId) === filterCategory ||
        (p.headerId?._id || p.headerId) === filterCategory;

      let matchesStatus = filterStatus === "All";
      if (filterStatus === "Active") matchesStatus = p.status === "active";
      if (filterStatus === "Low Stock")
        matchesStatus = p.stock > 0 && p.stock <= resolveLowStockThreshold(p);
      if (filterStatus === "Out of Stock") matchesStatus = p.stock === 0;

      let matchesPrice = true;
      const effectivePrice = Number(p.sellingPrice ?? p.mrp ?? 0);
      if (min !== null && !Number.isNaN(min)) {
        matchesPrice = matchesPrice && effectivePrice >= min;
      }
      if (max !== null && !Number.isNaN(max)) {
        matchesPrice = matchesPrice && effectivePrice <= max;
      }

      const rawApproval = String(p.approvalStatus || "").trim().toLowerCase();
      const normalizedApproval = rawApproval || "approved"; // legacy products without moderation fields are treated as approved
      let matchesApproval = true;
      if (filterApproval !== "all") {
        matchesApproval = normalizedApproval === filterApproval;
      }

      return (
        matchesSearch &&
        matchesCategory &&
        matchesStatus &&
        matchesApproval &&
        matchesPrice
      );
    });
  }, [
    safeProducts,
    searchTerm,
    filterCategory,
    filterStatus,
    filterApproval,
    priceMin,
    priceMax,
  ]);

  const stats = useMemo(
    () => ({
      total:
        summaryStats?.total ??
        (typeof total === "number" ? total : safeProducts.length),
      lowStock:
        summaryStats?.lowStock ??
        safeProducts.filter((p) => p.stock > 0 && p.stock <= resolveLowStockThreshold(p)).length,
      outOfStock:
        summaryStats?.outOfStock ??
        safeProducts.filter((p) => p.stock === 0).length,
      active:
        summaryStats?.active ??
        safeProducts.filter((p) => p.status === "active").length,
    }),
    [safeProducts, summaryStats, total],
  );


  const handleSave = async () => {
    try {
      if (
        !formData.name ||
        formData.mrp === "" || formData.mrp === undefined ||
        formData.stock === "" || formData.stock === undefined ||
        !formData.header ||
        !formData.category ||
        !formData.subcategory
      ) {
        toast.error("Please fill all required fields, including categories");
        return;
      }

      // Audit fix: nothing blocked a selling price above MRP — a
      // fat-fingered entry shows as a live "discount" on the customer
      // product page instead of the markup it actually is.
      if (
        formData.sellingPrice !== "" &&
        formData.sellingPrice !== undefined &&
        formData.sellingPrice !== null &&
        Number(formData.sellingPrice) >= Number(formData.mrp)
      ) {
        toast.error("Selling price must be lower than the MRP");
        return;
      }

      const data = new FormData();
      data.append("name", formData.name);
      data.append("slug", formData.slug);
      data.append("sku", formData.sku);
      data.append("description", formData.description);
      data.append("mrp", Number(formData.mrp));
      data.append("sellingPrice", Number(formData.sellingPrice) || 0);
      data.append("purchaseRate", Number(formData.purchaseRate) || 0);
      data.append("stock", Number(formData.stock));
      data.append("headerId", formData.header);
      data.append("categoryId", formData.category);
      data.append("subcategoryId", formData.subcategory);
      data.append("status", formData.status);
      data.append("brand", formData.brand);
      data.append("weight", formData.weight);
      data.append("rackCode", formData.rackCode || "");
      data.append("tags", formData.tags);
      data.append("variants", JSON.stringify(formData.variants));

      if (formData.mainImageFile) {
        data.append("mainImage", formData.mainImageFile);
      }
      if (formData.galleryFiles && formData.galleryFiles.length > 0) {
        formData.galleryFiles.forEach((file) => data.append("galleryImages", file));
      }

      if (editingItem) {
        const response = await sellerApi.updateProduct(editingItem._id || editingItem.id, data);
        const approvalStatus = response?.data?.result?.approvalStatus;
        if (approvalStatus === "pending") {
          toast.success("Product changes submitted for admin approval");
        } else {
          toast.success(response?.data?.message || "Product updated successfully");
        }
      } else {
        const response = await sellerApi.createProduct(data);
        const approvalStatus = response?.data?.result?.approvalStatus;
        if (approvalStatus === "pending") {
          toast.success("Product submitted for admin approval");
        } else {
          toast.success(response?.data?.message || "Product created successfully");
        }
      }

      setIsProductModalOpen(false);
      setEditingItem(null);
      setPage(1);
      invalidateProducts();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save product");
    }
  };

  const handleImageUpload = (e, type) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === "main") {
          setFormData({ ...formData, mainImage: reader.result, mainImageFile: file });
        } else {
          setFormData({
            ...formData,
            galleryImages: [...formData.galleryImages, reader.result],
            galleryFiles: [...(formData.galleryFiles || []), file]
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const exportProducts = () => {
    console.log("Exporting products...");
    alert("Exporting " + safeProducts.length + " products as CSV (Simulation)");
  };

  const handleDeleteClick = (product) => {
    setItemToDelete(product);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    try {
      await sellerApi.deleteProduct(itemToDelete._id || itemToDelete.id);
      toast.success("Product deleted successfully");
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
      setPage(1);
      invalidateProducts();
    } catch (error) {
      toast.error("Failed to delete product");
    }
  };

  const openEditModal = (item = null) => {
    if (item) {
      setFormData({
        name: item.name || "",
        slug: item.slug || "",
        sku: item.sku || "",
        description: item.description || "",
        mrp: item.mrp ?? "",
        sellingPrice: item.sellingPrice ?? "",
        purchaseRate: item.purchaseRate ?? "",
        stock: item.stock ?? "",
        lowStockAlert: item.lowStockAlert ?? 5,
        header: item.headerId?._id || item.headerId || "",
        category: item.categoryId?._id || item.categoryId || "",
        subcategory: item.subcategoryId?._id || item.subcategoryId || "",
        status: item.status || "active",
        tags: Array.isArray(item.tags) ? item.tags.join(", ") : item.tags || "",
        weight: item.weight || "",
        brand: item.brand || "",
        rackCode: item.rackCode || "",
        mainImage: item.mainImage || null,
        galleryImages: item.galleryImages || [],
        variants: (item.variants && item.variants.length > 0) ? item.variants.map(v => ({ ...v, id: v._id || Date.now() })) : [
          {
            id: Date.now(),
            name: "",
            mrp: item.mrp ?? "",
            sellingPrice: item.sellingPrice ?? "",
            purchaseRate: item.purchaseRate ?? "",
            stock: item.stock ?? "",
            sku: item.sku || "",
          },
        ],
      });
      setEditingItem(item);
    } else {
      setFormData({
        name: "",
        slug: "",
        sku: "",
        description: "",
        mrp: "",
        sellingPrice: "",
        purchaseRate: "",
        stock: "",
        lowStockAlert: 5,
        category: "",
        header: "",
        status: "active",
        tags: "",
        weight: "",
        brand: "",
        rackCode: "",
        mainImage: null,
        galleryImages: [],
        variants: [
          {
            id: Date.now(),
            name: "",
            mrp: "",
            sellingPrice: "",
            purchaseRate: "",
            stock: "",
            sku: "",
          },
        ],
      });
      setEditingItem(null);
    }
    setModalTab("general");
    setIsProductModalOpen(true);
  };

  const productColumns = [
    {
      header: "Product",
      key: "product",
      cell: (p) => (
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg overflow-hidden bg-slate-100">
            <img
              src={p.mainImage || p.image || "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400"}
              alt={p.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">{p.name}</p>
            {String(p.approvalStatus || "").toLowerCase() === "pending" ? (
              <p className="text-[10px] font-medium text-warning">Hidden from customers until admin approval.</p>
            ) : null}
            {String(p.approvalStatus || "").toLowerCase() === "rejected" ? (
              <p className="text-[10px] font-medium text-danger">
                {p.approvalNote ? `Rejected: ${p.approvalNote}` : "Rejected by admin. Update and resubmit."}
              </p>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      header: "Product Code",
      key: "sku",
      cell: (p) => <span className="text-sm font-medium text-slate-700">{displaySku(p)}</span>,
    },
    {
      header: "Header",
      key: "header",
      cell: (p) => <Badge variant="outline">{p.headerId?.name || "N/A"}</Badge>,
    },
    {
      header: "Category",
      key: "category",
      cell: (p) => <span className="text-sm font-medium text-slate-700">{p.categoryId?.name || "N/A"}</span>,
    },
    {
      header: "Subcategory",
      key: "subcategory",
      cell: (p) => <span className="text-sm font-medium text-slate-700">{p.subcategoryId?.name || "N/A"}</span>,
    },
    {
      header: "Variants",
      key: "variants",
      align: "center",
      cell: (p) =>
        p.variants?.length > 0 ? (
          <button
            onClick={() => {
              setViewingVariants(p);
              setIsVariantsViewModalOpen(true);
            }}
            className="inline-flex"
          >
            <Badge variant="info">{p.variants.length} Variants</Badge>
          </button>
        ) : (
          <span className="text-xs italic text-slate-400">None</span>
        ),
    },
    {
      header: "Approval",
      key: "approval",
      align: "center",
      cell: (p) => (
        <div className="flex flex-col items-center gap-1">
          <ApprovalBadge approvalStatus={p.approvalStatus} />
          {p.approvalReviewedAt ? (
            <span className="text-[10px] text-slate-400">Reviewed</span>
          ) : p.approvalRequestedAt ? (
            <span className="text-[10px] text-slate-400">Submitted</span>
          ) : null}
        </div>
      ),
    },
    {
      header: "Actions",
      key: "actions",
      align: "right",
      cell: (p) => (
        <div className="flex items-center justify-end gap-1">
          <button onClick={() => openEditModal(p)} className="rounded-lg p-1.5 text-slate-500 transition-all hover:bg-primary/10 hover:text-primary">
            <HiOutlinePencilSquare className="h-4 w-4" />
          </button>
          <button onClick={() => handleDeleteClick(p)} className="rounded-lg p-1.5 text-slate-500 transition-all hover:bg-danger/10 hover:text-danger">
            <HiOutlineTrash className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Product List
            <Badge variant="primary">Live</Badge>
          </span>
        }
        description="Track your items, prices, and how many are left in stock."
        actions={
          <Button onClick={() => navigate("/seller/products/add")}>
            <HiOutlinePlus className="h-4 w-4" />
            Add New Product
          </Button>
        }
      />

      {isLoading && safeProducts.length === 0 ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
          </div>
          <SkeletonCard lines={6} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "All Items", val: stats.total, icon: HiOutlineCube, color: "text-primary", bg: "bg-primary/10", status: "All" },
              { label: "Active Items", val: stats.active, icon: HiOutlineCheckCircle, color: "text-success", bg: "bg-success/10", status: "Active" },
              { label: "Low Stock", val: stats.lowStock, icon: HiOutlineExclamationCircle, color: "text-warning", bg: "bg-warning/10", status: "Low Stock" },
              { label: "Out of Stock", val: stats.outOfStock, icon: HiOutlineArchiveBox, color: "text-danger", bg: "bg-danger/10", status: "Out of Stock" },
            ].map((stat, i) => (
              <StatCard
                key={i}
                label={stat.label}
                value={stat.val}
                icon={stat.icon}
                color={stat.color}
                bg={stat.bg}
                onClick={() => setFilterStatus(stat.status)}
                className={filterStatus === stat.status ? "ring-2 ring-primary" : undefined}
              />
            ))}
          </div>

          <FilterBar
            left={
              <div className="relative w-full sm:w-72">
                <HiOutlineMagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSearchTerm(value);
                    const next = new URLSearchParams(searchParams);
                    if (value) next.set("q", value);
                    else next.delete("q");
                    setSearchParams(next);
                  }}
                  placeholder="Search by name, SKU or slug..."
                  className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            }
            right={
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">All Categories</option>
                  {categories.map((h) => (
                    <optgroup key={h._id || h.id} label={h.name}>
                      <option value={h._id || h.id}>All {h.name}</option>
                      {(h.children || []).map((c) => (
                        <option key={c._id || c.id} value={c._id || c.id}>{c.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <select
                  value={filterApproval}
                  onChange={(e) => setFilterApproval(e.target.value)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                  aria-label="Filter by approval status"
                  title="Approval"
                >
                  <option value="all">All Approvals</option>
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                </select>
                <div className="relative" ref={filterDropdownRef}>
                  <button
                    onClick={() => setIsFilterOpen((prev) => !prev)}
                    className="flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-all hover:bg-slate-50"
                  >
                    <HiOutlineFunnel className="h-4 w-4" />
                    Filters
                  </button>
                  {isFilterOpen && (
                    <div className="absolute right-0 top-full z-50 mt-2 w-64 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                      <div>
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</p>
                        <select
                          value={filterStatus}
                          onChange={(e) => setFilterStatus(e.target.value)}
                          className="w-full rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                        >
                          <option value="All">All</option>
                          <option value="Active">Active</option>
                          <option value="Low Stock">Low Stock</option>
                          <option value="Out of Stock">Out of Stock</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Min Price</p>
                          <input
                            type="number"
                            value={priceMin}
                            onChange={(e) => setPriceMin(e.target.value)}
                            placeholder="e.g. 100"
                            className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </div>
                        <div>
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Max Price</p>
                          <input
                            type="number"
                            value={priceMax}
                            onChange={(e) => setPriceMax(e.target.value)}
                            placeholder="e.g. 1000"
                            className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setFilterCategory("all");
                            setFilterStatus("All");
                            setFilterApproval("all");
                            setPriceMin("");
                            setPriceMax("");
                            setSearchTerm("");
                            setSearchParams({});
                          }}
                          className="text-[11px] font-bold text-slate-500 hover:text-slate-700"
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsFilterOpen(false)}
                          className="rounded-md border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name-asc">Name A-Z</option>
                  <option value="name-desc">Name Z-A</option>
                  <option value="price-asc">Price Low-High</option>
                  <option value="price-desc">Price High-Low</option>
                  <option value="stock-asc">Stock Low-High</option>
                  <option value="stock-desc">Stock High-Low</option>
                </select>
              </div>
            }
          />

          <DataTable
            columns={productColumns}
            data={filteredProducts}
            rowKey={(p) => p._id || p.id}
            loading={isFetching && safeProducts.length > 0}
            emptyState={<div className="py-12 text-center text-sm text-slate-400">No products match these filters.</div>}
          />

          <Pagination
            page={productsQueryData?.page ?? page}
            totalPages={Math.ceil(total / pageSize) || 1}
            total={total}
            pageSize={pageSize}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
            loading={isFetching}
          />
        </>
      )}

      {/* Edit Modal */}
      <AnimatePresence>
        {isProductModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-12 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-md"
              onClick={() => setIsProductModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-5xl relative z-10 bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)]">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 bg-slate-900 text-white rounded-xl flex items-center justify-center">
                    <HiOutlineCube className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      Edit Product
                    </h3>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <Badge variant="primary">Seller</Badge>
                      <HiOutlineChevronRight className="h-2.5 w-2.5 text-slate-300" />
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        {formData.sku || "PENDING SKU"}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setIsProductModalOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
                  <HiOutlineXMark className="h-5 w-5" />
                </button>
              </div>

              <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
                {/* Modal Sidebar Tabs */}
                <div
                  className="md:w-1/4 bg-slate-50 border-r border-slate-100 p-4 space-y-1 overflow-y-auto min-h-0"
                  onWheel={handleModalScrollWheel}>
                  {[
                    { id: "general", label: "General Info", icon: HiOutlineTag },
                    { id: "variants", label: "Item Variants", icon: HiOutlineSwatch },
                    { id: "category", label: "Groups", icon: HiOutlineFolderOpen },
                    { id: "media", label: "Photos", icon: HiOutlinePhoto },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setModalTab(tab.id)}
                      className={cn(
                        "w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left",
                        modalTab === tab.id
                          ? "bg-white text-primary shadow-sm border border-slate-100"
                          : "text-slate-500 hover:bg-slate-100",
                      )}>
                      <tab.icon className="h-4 w-4" />
                      <span>{tab.label}</span>
                    </button>
                  ))}

                  <div className="pt-8 px-4">
                    <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                      <p className="text-[9px] font-bold text-primary uppercase tracking-widest mb-1">
                        Status
                      </p>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="w-full bg-transparent border-none text-xs font-bold text-primary outline-none p-0 cursor-pointer focus:ring-0">
                        <option value="active">PUBLISHED</option>
                        <option value="inactive">DRAFT</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Modal Content Area */}
                <div
                  className="flex-1 p-8 overflow-y-auto min-h-0 overscroll-contain custom-scrollbar"
                  onWheel={handleModalScrollWheel}>
                  {modalTab === "general" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5 flex flex-col">
                          <label className="text-xs font-medium text-slate-700">Product Title</label>
                          <input
                            value={formData.name}
                            onChange={(e) => {
                              const nextName = e.target.value;
                              setFormData((prev) => ({
                                ...prev,
                                name: nextName,
                                sku:
                                  !prev.sku || isAutoSku(prev.sku, prev.name, 1)
                                    ? makeSku(nextName, 1)
                                    : prev.sku,
                                variants: prev.variants.map((variant, idx) => {
                                  const variantIndex = idx + 1;
                                  const shouldAuto =
                                    !variant.sku ||
                                    isAutoSku(variant.sku, prev.name, variantIndex);
                                  return shouldAuto
                                    ? { ...variant, sku: makeSku(nextName, variantIndex) }
                                    : variant;
                                }),
                              }));
                            }}
                            className="w-full rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            placeholder="e.g. Premium Basmati Rice"
                          />
                        </div>
                        <div className="space-y-1.5 flex flex-col">
                          <label className="text-xs font-medium text-slate-700">Web Address</label>
                          <div className="flex items-center rounded-md border border-slate-200 bg-white px-3.5 py-2.5">
                            <span className="mr-1 text-xs font-semibold text-slate-400">/product/</span>
                            <input
                              value={formData.slug}
                              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                              className="flex-1 bg-transparent border-none text-sm text-slate-700 outline-none"
                              placeholder="premium-basmati-rice"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1.5 flex flex-col">
                        <label className="text-xs font-medium text-slate-700">About this item</label>
                        <textarea
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          onWheel={(e) => e.stopPropagation()}
                          onTouchMove={(e) => e.stopPropagation()}
                          className="w-full rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm min-h-[160px] max-h-[260px] outline-none resize-none overflow-y-auto custom-scrollbar transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                          placeholder="Describe the item here..."
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5 flex flex-col">
                          <label className="text-xs font-medium text-slate-700">Brand Name</label>
                          <input
                            value={formData.brand}
                            onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                            className="w-full rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            placeholder="e.g. Amul"
                          />
                        </div>
                        <div className="space-y-1.5 flex flex-col">
                          <label className="text-xs font-medium text-slate-700">Product Code</label>
                          <input
                            value={formData.sku}
                            onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                            className="w-full rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-mono font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            placeholder="AUTO-GENERATED"
                          />
                        </div>
                        <div className="space-y-1.5 flex flex-col">
                          <label className="text-xs font-medium text-slate-700">Rack Code</label>
                          <input
                            value={formData.rackCode}
                            onChange={(e) => setFormData({ ...formData, rackCode: e.target.value })}
                            className="w-full rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-mono font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            placeholder="e.g. A-12-3"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {modalTab === "category" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5 flex flex-col">
                          <label className="text-xs font-medium text-slate-700">Main Group <span className="text-danger">*</span></label>
                          <select
                            value={formData.header}
                            onChange={(e) => setFormData({ ...formData, header: e.target.value, category: "", subcategory: "" })}
                            className="w-full rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold outline-none cursor-pointer transition-all focus:border-primary focus:ring-2 focus:ring-primary/20">
                            <option value="">Select Main Group</option>
                            {categories.map((h) => (
                              <option key={h._id || h.id} value={h._id || h.id}>{h.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5 flex flex-col">
                          <label className="text-xs font-medium text-slate-700">Specific Category <span className="text-danger">*</span></label>
                          <select
                            value={formData.category}
                            onChange={(e) => setFormData({ ...formData, category: e.target.value, subcategory: "" })}
                            disabled={!formData.header}
                            className="w-full rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold outline-none cursor-pointer transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50">
                            <option value="">Select Category</option>
                            {categories
                              .find((h) => (h._id || h.id) === formData.header)
                              ?.children?.map((c) => (
                                <option key={c._id || c.id} value={c._id || c.id}>{c.name}</option>
                              ))}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1.5 flex flex-col">
                        <label className="text-xs font-medium text-slate-700">Sub-Category <span className="text-danger">*</span></label>
                        <select
                          value={formData.subcategory}
                          onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                          disabled={!formData.category}
                          className="w-full rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold outline-none cursor-pointer transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50">
                          <option value="">Select Sub-Category</option>
                          {categories
                            .find((h) => (h._id || h.id) === formData.header)
                            ?.children?.find((c) => (c._id || c.id) === formData.category)
                            ?.children?.map((sc) => (
                              <option key={sc._id || sc.id} value={sc._id || sc.id}>{sc.name}</option>
                            ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {modalTab === "media" && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
                      <div className="space-y-3">
                        <label className="text-xs font-medium text-slate-700">Main Cover Photo</label>
                        <div className="flex flex-col md:flex-row items-start gap-6">
                          <div className="w-40 aspect-square rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center group hover:border-primary hover:bg-primary/5 transition-all cursor-pointer overflow-hidden relative">
                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={(e) => handleImageUpload(e, "main")} />
                            {formData.mainImage ? (
                              <img src={formData.mainImage} alt="Main Preview" className="w-full h-full object-cover" />
                            ) : (
                              <div className="flex flex-col items-center">
                                <HiOutlinePhoto className="h-8 w-8 text-slate-300" />
                                <p className="text-[10px] text-slate-400 font-bold mt-2">UPLOAD</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <label className="text-xs font-medium text-slate-700">Gallery Photos</label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {(formData.galleryImages || []).slice(0, 4).map((img, idx) => (
                            <div key={`${img}-${idx}`} className="aspect-square rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 overflow-hidden relative">
                              <img src={img} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover" />
                            </div>
                          ))}
                          {Array.from({ length: Math.max(0, 4 - (formData.galleryImages || []).length) }).map((_, idx) => (
                            <div key={`upload-${idx}`} className="aspect-square rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center group hover:border-primary hover:bg-primary/5 transition-all cursor-pointer overflow-hidden relative">
                              <input type="file" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={(e) => handleImageUpload(e, "gallery")} />
                              <div className="flex flex-col items-center">
                                <HiOutlinePhoto className="h-7 w-7 text-slate-300" />
                                <p className="text-[10px] text-slate-400 font-bold mt-2">UPLOAD</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Existing gallery images are shown here. Uploading new images will append them to the gallery.
                        </p>
                      </div>
                    </div>
                  )}

                  {modalTab === "variants" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-slate-900">Product Variants</h4>
                        <button
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              variants: [
                                ...prev.variants,
                                { id: Date.now(), name: "", mrp: "", sellingPrice: "", purchaseRate: "", stock: "", sku: makeSku(prev.name, prev.variants.length + 1) },
                              ],
                            }))
                          }
                          className="rounded-lg bg-primary/10 px-3 py-1.5 text-[10px] font-bold text-primary"
                        >
                          + Add
                        </button>
                      </div>
                      <div className="space-y-3">
                        {formData.variants.map((v, i) => (
                          <div key={v.id} className="grid grid-cols-1 items-end gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3.5 md:grid-cols-7">
                            <div className="md:col-span-2 space-y-1">
                              <label className="ml-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Variant Name</label>
                              <input value={v.name} onChange={e => {
                                const news = [...formData.variants];
                                news[i].name = e.target.value;
                                setFormData({ ...formData, variants: news });
                              }} placeholder="e.g. 1kg, 1 pack, 1 liter..." className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20" />
                            </div>
                            <div className="space-y-1">
                              <label className="ml-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">MRP</label>
                              <input type="number" min="0" value={v.mrp} onChange={e => {
                                const val = e.target.value;
                                if (val !== '' && Number(val) < 0) return;
                                const news = [...formData.variants];
                                news[i].mrp = val;
                                setFormData({ ...formData, variants: news });
                              }} placeholder="MRP" className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20" />
                            </div>
                            <div className="space-y-1">
                              <label className="ml-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Selling Price</label>
                              <input type="number" min="0" value={v.sellingPrice} onChange={e => {
                                const val = e.target.value;
                                if (val !== '' && Number(val) < 0) return;
                                const news = [...formData.variants];
                                news[i].sellingPrice = val;
                                setFormData({ ...formData, variants: news });
                              }} placeholder="Selling" className="w-full rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs text-primary outline-none focus:border-primary focus:ring-1 focus:ring-primary/20" />
                            </div>
                            <div className="space-y-1">
                              <label className="ml-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600">Purchase Rate</label>
                              <input type="number" min="0" value={v.purchaseRate} onChange={e => {
                                const val = e.target.value;
                                if (val !== '' && Number(val) < 0) return;
                                const news = [...formData.variants];
                                news[i].purchaseRate = val;
                                setFormData({ ...formData, variants: news });
                              }} placeholder="Cost" title="Only visible to you and the admin" className="w-full rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200" />
                            </div>
                            <div className="space-y-1">
                              <label className="ml-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Stock</label>
                              <input type="number" min="0" value={v.stock} onChange={e => {
                                const val = e.target.value;
                                if (val !== '' && Number(val) < 0) return;
                                const news = [...formData.variants];
                                news[i].stock = val;
                                setFormData({ ...formData, variants: news });
                              }} placeholder="Stock" className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20" />
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 space-y-1">
                                <label className="ml-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">SKU</label>
                                <input value={v.sku} onChange={e => {
                                  const news = [...formData.variants];
                                  news[i].sku = e.target.value;
                                  setFormData({ ...formData, variants: news });
                                }} placeholder="SKU" className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20" />
                              </div>
                              <button type="button" onClick={() => {
                                setFormData((prev) => {
                                  const remaining = prev.variants
                                    .map((variant, idx) => ({ variant, oldIndex: idx + 1 }))
                                    .filter((item, idx) => idx !== i)
                                    .map((item, newIdx) => {
                                      const shouldAuto =
                                        !item.variant.sku ||
                                        isAutoSku(item.variant.sku, prev.name, item.oldIndex);
                                      return shouldAuto
                                        ? { ...item.variant, sku: makeSku(prev.name, newIdx + 1) }
                                        : item.variant;
                                    });
                                  return { ...prev, variants: remaining };
                                });
                              }} className="mb-0.5 shrink-0 rounded-lg p-2 text-danger hover:bg-danger/10">
                                <HiOutlineTrash className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
                <button
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100">
                  Close
                </button>
                <Button onClick={handleSave}>
                  Save Changes
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Confirm Deletion"
        size="sm"
        footer={
          <div className="flex gap-3 justify-end w-full">
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete}>Delete Product</Button>
          </div>
        }>
        <div className="px-2 py-2 flex flex-col items-center text-center space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-danger/10 text-danger">
            <HiOutlineTrash className="h-8 w-8" />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h4 className="text-base font-bold text-slate-900">Are you absolutely sure?</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              This action cannot be undone. This will permanently remove{" "}
              <span className="font-semibold text-slate-900">{itemToDelete?.name}</span>{" "}
              from the catalog.
            </p>
          </div>
        </div>
      </Modal>

      {/* Viewing Variants Modal */}
      <Modal
        isOpen={isVariantsViewModalOpen}
        onClose={() => setIsVariantsViewModalOpen(false)}
        title="Product Variants Details"
        size="lg"
      >
        <div className="py-1">
          <div className="mb-5 flex items-center gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-white">
              {viewingVariants?.mainImage || viewingVariants?.galleryImages?.[0] || viewingVariants?.image ? (
                <img src={viewingVariants.mainImage || viewingVariants.galleryImages?.[0] || viewingVariants.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <HiOutlineCube className="h-7 w-7 text-slate-300" />
              )}
            </div>
            <div>
              <h3 className="text-base font-black leading-tight text-slate-900">{viewingVariants?.name}</h3>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="primary">{viewingVariants?.categoryId?.name || 'Category'}</Badge>
                <span className="text-xs font-semibold text-slate-500">Master SKU: {viewingVariants?.sku || viewingVariants?._id?.slice(-6).toUpperCase() || 'N/A'}</span>
              </div>
            </div>
          </div>

          <DataTable
            columns={[
              {
                header: 'Variant Specification',
                key: 'name',
                cell: (v, idx) => (
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-700">{v.name}</span>
                  </div>
                ),
              },
              {
                header: 'Unit Price',
                key: 'mrp',
                align: 'center',
                cell: (v) => (
                  <div className="flex flex-col items-center">
                    <span className={cn("text-xs font-bold", v.sellingPrice > 0 ? "text-slate-400 line-through" : "text-slate-900")}>₹{v.mrp}</span>
                    {v.sellingPrice > 0 && <span className="text-xs font-bold text-primary">₹{v.sellingPrice}</span>}
                  </div>
                ),
              },
              {
                header: 'Purchase Rate',
                key: 'purchaseRate',
                align: 'center',
                cell: (v) => (
                  <span className="text-xs font-bold text-amber-700">
                    {v.purchaseRate ? `₹${v.purchaseRate}` : "—"}
                  </span>
                ),
              },
              {
                header: 'Available Stock',
                key: 'stock',
                align: 'center',
                cell: (v) => (
                  <Badge variant={v.stock === 0 ? 'danger' : v.stock <= 10 ? 'warning' : 'success'}>
                    {v.stock === 0 ? 'Out of Stock' : `${v.stock} Units`}
                  </Badge>
                ),
              },
              {
                header: 'Variant SKU',
                key: 'sku',
                align: 'right',
                cell: (v) => (
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-tight text-slate-500">
                    {v.sku || 'N/A'}
                  </span>
                ),
              },
            ]}
            data={viewingVariants?.variants || []}
            rowKey={(v, idx) => v._id || v.sku || idx}
          />

          <div className="mt-6 flex justify-end">
            <Button onClick={() => setIsVariantsViewModalOpen(false)}>
              Close Viewer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ProductManagement;
