import React, { useEffect, useMemo, useState } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Button from "@shared/components/ui/Button";
import Modal from "@shared/components/ui/Modal";
import PageHeader from "@shared/components/ui/PageHeader";
import EmptyState from "@shared/components/ui/EmptyState";
import { useToast } from "@shared/components/ui/Toast";
import {
  HiOutlinePlus,
  HiOutlinePhoto,
  HiOutlineTrash,
  HiOutlinePencilSquare,
} from "react-icons/hi2";
import { cn } from "@/lib/utils";
import { adminApi } from "../services/adminApi";
import {
  BACKGROUND_COLOR_OPTIONS,
  SIDE_IMAGE_OPTIONS,
} from "@/shared/constants/offerSectionOptions";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// Uses the same backend collection as offer sections,
// but presents it as a dedicated "Shop by Store" manager.

const SHOP_BY_STORE_QUERY_KEY = ["admin", "offerSections"];

const ShopByStoreManagement = () => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [productsFiltered, setProductsFiltered] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    backgroundColor: "#FCD34D",
    sideImageKey: "grocery",
    categoryIds: [],
    productIds: [],
    order: 0,
    status: "active",
  });

  // Perf audit Phase 8: migrated `categories` and `stores` to React Query
  // (both are simple one-time-on-mount fetches). `productsFiltered` is
  // left as a page-local fetch — it's transient, modal-form-scoped data
  // driven by whatever categories are currently selected in the open
  // modal, not a page data list, so there's no real caching benefit.
  const { data: categories = [] } = useQuery({
    queryKey: ["admin", "level2CategoriesForStores"],
    queryFn: async () => {
      const res = await adminApi.getCategories();
      const list = res.data.results || res.data.result || [];
      return (Array.isArray(list) ? list : []).filter((c) => c.type === "category");
    },
  });

  const { data: stores = [], isLoading, isError } = useQuery({
    queryKey: SHOP_BY_STORE_QUERY_KEY,
    queryFn: async () => {
      const res = await adminApi.getOfferSections();
      const list = res.data.results || res.data.result || res.data;
      return Array.isArray(list) ? list : [];
    },
  });

  useEffect(() => {
    if (isError) showToast("Failed to load stores", "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError]);

  const loadProductsByCategory = async (categoryIds) => {
    const hasCategories = Array.isArray(categoryIds) && categoryIds.length > 0;
    if (!hasCategories) {
      setProductsFiltered([]);
      return;
    }
    try {
      const params = { limit: 200, categoryIds: categoryIds.join(",") };
      const res = await adminApi.getProducts(params);
      const raw = res.data.result;
      const list = Array.isArray(res.data.results)
        ? res.data.results
        : Array.isArray(raw?.items)
        ? raw.items
        : Array.isArray(raw)
        ? raw
        : [];
      setProductsFiltered(list);
    } catch (e) {
      console.error(e);
      setProductsFiltered([]);
      showToast("Failed to load products", "error");
    }
  };

  useEffect(() => {
    loadProductsByCategory(formData.categoryIds);
  }, [formData.categoryIds]);

  const categoryMap = useMemo(() => {
    const m = {};
    categories.forEach((c) => (m[c._id] = c));
    return m;
  }, [categories]);

  const resetForm = () => {
    setFormData({
      title: "",
      backgroundColor: "#FCD34D",
      sideImageKey: "grocery",
      categoryIds: [],
      productIds: [],
      order: stores.length,
      status: "active",
    });
    setEditingStore(null);
  };

  const openCreateModal = () => {
    resetForm();
    setProductsFiltered([]);
    setIsModalOpen(true);
  };

  const openEditModal = (store) => {
    setEditingStore(store);
    const catIds = (store.categoryIds || [])
      .map((c) => (typeof c === "object" && c?._id ? c._id : c))
      .filter(Boolean);
    setFormData({
      title: store.title || "",
      backgroundColor: store.backgroundColor || "#FCD34D",
      sideImageKey: store.sideImageKey || "grocery",
      categoryIds: catIds,
      productIds: store.productIds || [],
      order: store.order ?? 0,
      status: store.status || "active",
    });
    loadProductsByCategory(catIds);
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      showToast("Store name is required", "warning");
      return;
    }
    if (!formData.categoryIds?.length) {
      showToast("Please select at least one category", "warning");
      return;
    }
    const payload = {
      title: formData.title.trim(),
      backgroundColor: formData.backgroundColor,
      sideImageKey: formData.sideImageKey,
      categoryIds: formData.categoryIds,
      productIds: formData.productIds,
      order: Number(formData.order) || 0,
      status: formData.status,
    };
    try {
      if (editingStore) {
        const res = await adminApi.updateOfferSection(editingStore._id, payload);
        const updated = res.data.result || res.data.results || res.data;
        queryClient.setQueryData(SHOP_BY_STORE_QUERY_KEY, (prev) =>
          Array.isArray(prev) ? prev.map((s) => (s._id === editingStore._id ? updated : s)) : prev,
        );
        showToast("Store updated", "success");
      } else {
        const res = await adminApi.createOfferSection(payload);
        const created = res.data.result || res.data.results || res.data;
        queryClient.setQueryData(SHOP_BY_STORE_QUERY_KEY, (prev) =>
          Array.isArray(prev) ? [...prev, created] : [created],
        );
        showToast("Store created", "success");
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      showToast(
        err.response?.data?.message || "Failed to save store",
        "error"
      );
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this store?")) return;
    try {
      await adminApi.deleteOfferSection(id);
      queryClient.setQueryData(SHOP_BY_STORE_QUERY_KEY, (prev) =>
        Array.isArray(prev) ? prev.filter((s) => s._id !== id) : prev,
      );
      showToast("Store deleted", "success");
    } catch (e) {
      console.error(e);
      showToast("Failed to delete store", "error");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Shop by Store
            <Badge variant="primary">Curated Storefronts</Badge>
          </span>
        }
        description={'Create themed stores like "Summer Coolers" or "Breakfast Essentials". Pick categories and hero products, choose banner colour and imagery — these power the customer "Shop by Store" page.'}
        actions={
          <Button onClick={openCreateModal}>
            <HiOutlinePlus className="h-4 w-4" />
            New Store
          </Button>
        }
      />

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Stores ({stores.length})
          </h2>
          {isLoading && (
            <span className="text-[10px] font-bold text-slate-400">
              Loading...
            </span>
          )}
        </div>
        <div className="divide-y divide-slate-50">
          {stores.map((store, idx) => {
            const sideOpt = SIDE_IMAGE_OPTIONS.find(
              (o) => o.key === store.sideImageKey
            );
            const catNames = (store.categoryIds || []).length
              ? (store.categoryIds || [])
                  .map((c) =>
                    typeof c === "object" && c?.name
                      ? c.name
                      : categoryMap[c]?.name || c
                  )
                  .join(", ")
              : "—";
            const productCount = (store.productIds || []).length;
            return (
              <div
                key={store._id}
                className="flex flex-col gap-4 px-4 py-4 transition-colors hover:bg-slate-50/40 md:flex-row md:items-center"
              >
                <div className="flex items-center gap-3 md:min-w-[200px]">
                  <div
                    className="h-12 w-12 flex-shrink-0 rounded-xl border border-slate-100 bg-cover bg-center"
                    style={{
                      backgroundColor: store.backgroundColor || "#FCD34D",
                      backgroundImage: sideOpt?.imageUrl
                        ? `url(${sideOpt.imageUrl})`
                        : undefined,
                    }}
                  />
                  <div>
                    <p className="text-sm font-black text-slate-900">
                      {idx + 1}. {store.title}
                    </p>
                    <p className="text-[10px] font-bold text-slate-500">
                      Categories: {catNames} · {productCount} product(s)
                    </p>
                  </div>
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(store)}
                    className="rounded-lg p-2 text-slate-400 transition-all hover:bg-primary/10 hover:text-primary"
                  >
                    <HiOutlinePencilSquare className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(store._id)}
                    className="rounded-lg p-2 text-slate-400 transition-all hover:bg-danger/10 hover:text-danger"
                  >
                    <HiOutlineTrash className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
          {stores.length === 0 && !isLoading && (
            <div className="p-4">
              <EmptyState
                icon={<HiOutlinePhoto className="h-6 w-6" />}
                title="No stores created yet"
                description={'Click "New Store" to design your first curated storefront.'}
              />
            </div>
          )}
        </div>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingStore ? "Edit Store" : "New Store"}
      >
        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Store name
            </label>
            <input
              value={formData.title}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder='E.g. "Summer Coolers"'
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Categories inside this store
            </label>
            <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/50 p-3">
              {categories.map((c) => {
                const selected = formData.categoryIds.includes(c._id);
                return (
                  <button
                    key={c._id}
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        categoryIds: selected
                          ? prev.categoryIds.filter((id) => id !== c._id)
                          : [...prev.categoryIds, c._id],
                        productIds: [],
                      }))
                    }
                    className={cn(
                      "rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition-all",
                      selected
                        ? "border-primary bg-primary text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          {formData.categoryIds.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Featured products (optional)
              </label>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/50 p-3 pr-1">
                {productsFiltered.length === 0 ? (
                  <span className="text-[11px] text-slate-400">
                    No products match. Add categories first.
                  </span>
                ) : (
                  productsFiltered.map((p) => {
                    const selected = formData.productIds.includes(p._id);
                    return (
                      <button
                        key={p._id}
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,
                            productIds: selected
                              ? prev.productIds.filter((id) => id !== p._id)
                              : [...prev.productIds, p._id],
                          }))
                        }
                        className={cn(
                          "rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition-all",
                          selected
                            ? "border-primary bg-primary text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        {p.name}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Banner colour
            </label>
            <div className="flex flex-wrap gap-2">
              {BACKGROUND_COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      backgroundColor: opt.value,
                    }))
                  }
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-[11px] font-bold transition-all",
                    formData.backgroundColor === opt.value
                      ? "border-primary ring-2 ring-primary/20 ring-offset-2"
                      : "border-slate-200 hover:border-slate-300"
                  )}
                  title={opt.label}
                >
                  <span
                    className="h-5 w-5 rounded-full border border-slate-200"
                    style={{ backgroundColor: opt.value }}
                  />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Hero image
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SIDE_IMAGE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      sideImageKey: opt.key,
                    }))
                  }
                  className={cn(
                    "aspect-square overflow-hidden rounded-xl border-2 bg-slate-100 transition-all",
                    formData.sideImageKey === opt.key
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-slate-200 hover:border-slate-300"
                  )}
                >
                  <img
                    src={opt.imageUrl}
                    alt={opt.label}
                    className="h-full w-full object-cover"
                  />
                  <span className="block truncate p-1 text-[10px] font-bold text-slate-600">
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Display order
              </label>
              <input
                type="number"
                min={0}
                value={formData.order}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, order: e.target.value }))
                }
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, status: e.target.value }))
                }
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1">
              {editingStore ? "Save changes" : "Create store"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ShopByStoreManagement;
