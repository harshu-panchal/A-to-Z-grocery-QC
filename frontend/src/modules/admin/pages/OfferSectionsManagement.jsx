import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  HiOutlineArrowUpCircle,
  HiOutlineArrowDownCircle,
} from "react-icons/hi2";
import { cn } from "@/lib/utils";
import { adminApi } from "../services/adminApi";
import {
  BACKGROUND_COLOR_OPTIONS,
  SIDE_IMAGE_OPTIONS,
} from "@/shared/constants/offerSectionOptions";

const OFFER_SECTIONS_QUERY_KEY = ["admin", "offerSections"];

const OfferSectionsManagement = () => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [productsFiltered, setProductsFiltered] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSection, setEditingSection] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    backgroundColor: "#FCD34D",
    sideImageKey: "hair-care",
    categoryIds: [],
    sellerIds: [],
    productIds: [],
    order: 0,
    status: "active",
  });

  const { data: categories = [], isError: isCategoriesError } = useQuery({
    queryKey: ["admin", "categoriesForOfferSections"],
    queryFn: async () => {
      const res = await adminApi.getCategories();
      const list = res.data.results || res.data.result || [];
      return (Array.isArray(list) ? list : []).filter(
        (c) => c.type === "category"
      );
    },
  });

  const { data: sellers = [], isError: isSellersError } = useQuery({
    queryKey: ["admin", "sellersForOfferSections"],
    queryFn: async () => {
      const res = await adminApi.getSellers();
      const list = res.data.results || res.data.result || res.data;
      return Array.isArray(list) ? list : [];
    },
  });

  const { data: sections = [], isLoading, isError: isSectionsError } = useQuery({
    queryKey: OFFER_SECTIONS_QUERY_KEY,
    queryFn: async () => {
      const res = await adminApi.getOfferSections();
      const list = res.data.results || res.data.result || res.data;
      return Array.isArray(list) ? list : [];
    },
  });

  useEffect(() => {
    if (isCategoriesError) showToast("Failed to load categories", "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCategoriesError]);

  useEffect(() => {
    if (isSellersError) showToast("Failed to load sellers", "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSellersError]);

  useEffect(() => {
    if (isSectionsError) showToast("Failed to load offer sections", "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSectionsError]);

  const loadProductsByCategoryAndSellers = async (categoryIds, sellerIds) => {
    const hasCategories = Array.isArray(categoryIds) && categoryIds.length > 0;
    const hasSellers = Array.isArray(sellerIds) && sellerIds.length > 0;
    if (!hasCategories && !hasSellers) {
      setProductsFiltered([]);
      return;
    }
    try {
      const params = { limit: 200 };
      if (hasCategories) params.categoryIds = categoryIds.join(",");
      if (hasSellers) params.sellerIds = sellerIds.join(",");
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
    loadProductsByCategoryAndSellers(formData.categoryIds, formData.sellerIds);
  }, [formData.categoryIds, formData.sellerIds]);

  const categoryMap = useMemo(() => {
    const m = {};
    categories.forEach((c) => (m[c._id] = c));
    return m;
  }, [categories]);
  const sellerMap = useMemo(() => {
    const m = {};
    sellers.forEach((s) => (m[s._id] = s));
    return m;
  }, [sellers]);

  const resetForm = () => {
    setFormData({
      title: "",
      backgroundColor: "#FCD34D",
      sideImageKey: "hair-care",
      categoryIds: [],
      sellerIds: [],
      productIds: [],
      order: sections.length,
      status: "active",
    });
    setEditingSection(null);
  };

  const openCreateModal = () => {
    resetForm();
    setProductsFiltered([]);
    setIsModalOpen(true);
  };

  const openEditModal = (section) => {
    setEditingSection(section);
    const catIds = (section.categoryIds || []).map((c) => (typeof c === "object" && c?._id ? c._id : c)).filter(Boolean);
    if (!catIds.length && (section.categoryId?._id || section.categoryId)) {
      catIds.push(section.categoryId?._id || section.categoryId);
    }
    const selIds = (section.sellerIds || []).map((s) => (typeof s === "object" && s?._id ? s._id : s)).filter(Boolean);
    setFormData({
      title: section.title || "",
      backgroundColor: section.backgroundColor || "#FCD34D",
      sideImageKey: section.sideImageKey || "hair-care",
      categoryIds: catIds,
      sellerIds: selIds,
      productIds: section.productIds || [],
      order: section.order ?? 0,
      status: section.status || "active",
    });
    loadProductsByCategoryAndSellers(catIds, selIds);
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      showToast("Section title is required", "warning");
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
      sellerIds: formData.sellerIds || [],
      productIds: formData.productIds,
      order: Number(formData.order) || 0,
      status: formData.status,
    };
    try {
      if (editingSection) {
        const res = await adminApi.updateOfferSection(editingSection._id, payload);
        const updated = res.data.result || res.data.results || res.data;
        queryClient.setQueryData(OFFER_SECTIONS_QUERY_KEY, (prev) =>
          (prev || []).map((s) => (s._id === editingSection._id ? updated : s))
        );
        showToast("Section updated", "success");
      } else {
        const res = await adminApi.createOfferSection(payload);
        const created = res.data.result || res.data.results || res.data;
        queryClient.setQueryData(OFFER_SECTIONS_QUERY_KEY, (prev) => [...(prev || []), created]);
        showToast("Section created", "success");
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      showToast(
        err.response?.data?.message || "Failed to save section",
        "error"
      );
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this offer section?")) return;
    try {
      await adminApi.deleteOfferSection(id);
      queryClient.setQueryData(OFFER_SECTIONS_QUERY_KEY, (prev) => (prev || []).filter((s) => s._id !== id));
      showToast("Section deleted", "success");
    } catch (e) {
      console.error(e);
      showToast("Failed to delete section", "error");
    }
  };

  const handleReorder = async (direction, section) => {
    const idx = sections.findIndex((s) => s._id === section._id);
    if (idx < 0) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= sections.length) return;
    const copy = [...sections];
    const [removed] = copy.splice(idx, 1);
    copy.splice(newIdx, 0, removed);
    const items = copy.map((s, i) => ({ id: s._id, order: i }));
    try {
      await adminApi.reorderOfferSections(items);
      queryClient.setQueryData(OFFER_SECTIONS_QUERY_KEY, copy.map((s, i) => ({ ...s, order: i })));
    } catch (e) {
      console.error(e);
      showToast("Failed to reorder", "error");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Offer Sections
            <Badge variant="primary">Category → Products</Badge>
          </span>
        }
        description="Categories → Sellers → Products. Pick multiple categories and sellers, then choose products. Set banner colour and side image per section."
        actions={
          <Button onClick={openCreateModal}>
            <HiOutlinePlus className="h-4 w-4" />
            New Section
          </Button>
        }
      />

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Sections ({sections.length})
          </h2>
          {isLoading && (
            <span className="text-[10px] font-bold text-slate-400">
              Loading...
            </span>
          )}
        </div>
        <div className="divide-y divide-slate-50">
          {sections.map((section, idx) => {
            const sideOpt = SIDE_IMAGE_OPTIONS.find(
              (o) => o.key === section.sideImageKey
            );
            const catNames = (section.categoryIds || []).length
              ? (section.categoryIds || []).map((c) => (typeof c === "object" && c?.name ? c.name : categoryMap[c]?.name || c)).join(", ")
              : (section.categoryId?.name || "—");
            const sellerNames = (section.sellerIds || []).length
              ? (section.sellerIds || []).map((s) => (typeof s === "object" && (s?.shopName || s?.name) ? (s.shopName || s.name) : (sellerMap[s]?.shopName || sellerMap[s]?.name || s))).join(", ")
              : "—";
            const productCount = (section.productIds || []).length;
            return (
              <div
                key={section._id}
                className="flex flex-col gap-4 px-4 py-4 transition-colors hover:bg-slate-50/40 md:flex-row md:items-center"
              >
                <div className="flex items-center gap-3 md:min-w-[200px]">
                  <div
                    className="h-12 w-12 flex-shrink-0 rounded-xl border border-slate-100 bg-cover bg-center"
                    style={{
                      backgroundColor: section.backgroundColor || "#FCD34D",
                      backgroundImage: sideOpt?.imageUrl
                        ? `url(${sideOpt.imageUrl})`
                        : undefined,
                    }}
                  />
                  <div>
                    <p className="text-sm font-black text-slate-900">
                      #{idx + 1} {section.title}
                    </p>
                    <p className="text-[10px] font-bold text-slate-500">
                      {catNames} · Sellers: {sellerNames} · {productCount} product(s)
                    </p>
                  </div>
                </div>
                <div className="flex flex-1 items-center gap-2">
                  <span
                    className="inline-block h-6 w-6 rounded-full border border-slate-200"
                    style={{
                      backgroundColor: section.backgroundColor || "#FCD34D",
                    }}
                    title={section.backgroundColor}
                  />
                  <span className="text-[10px] font-bold text-slate-500">
                    {section.sideImageKey || "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      disabled={idx === 0}
                      onClick={() => handleReorder("up", section)}
                      className={cn(
                        "rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700",
                        idx === 0 && "cursor-not-allowed opacity-30"
                      )}
                    >
                      <HiOutlineArrowUpCircle className="h-4 w-4" />
                    </button>
                    <button
                      disabled={idx === sections.length - 1}
                      onClick={() => handleReorder("down", section)}
                      className={cn(
                        "rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700",
                        idx === sections.length - 1 &&
                        "cursor-not-allowed opacity-30"
                      )}
                    >
                      <HiOutlineArrowDownCircle className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => openEditModal(section)}
                    className="rounded-lg p-2 text-slate-400 transition-all hover:bg-primary/10 hover:text-primary"
                  >
                    <HiOutlinePencilSquare className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(section._id)}
                    className="rounded-lg p-2 text-slate-400 transition-all hover:bg-danger/10 hover:text-danger"
                  >
                    <HiOutlineTrash className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
          {sections.length === 0 && !isLoading && (
            <div className="p-4">
              <EmptyState
                icon={<HiOutlinePhoto className="h-6 w-6" />}
                title="No offer sections yet"
                description={'Click "New Section": pick categories → sellers → products, then colour & side image.'}
              />
            </div>
          )}
        </div>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSection ? "Edit Offer Section" : "New Offer Section"}
      >
        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Section title
            </label>
            <input
              value={formData.title}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="E.g. Trending Tuesday!"
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Categories (choose one or more)
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

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Sellers (choose one or more – products will be from these sellers)
            </label>
            <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/50 p-3">
              {sellers.map((s) => {
                const selected = formData.sellerIds.includes(s._id);
                return (
                  <button
                    key={s._id}
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        sellerIds: selected
                          ? prev.sellerIds.filter((id) => id !== s._id)
                          : [...prev.sellerIds, s._id],
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
                    {s.shopName || s.name || s.email}
                  </button>
                );
              })}
            </div>
          </div>

          {(formData.categoryIds.length > 0 || formData.sellerIds.length > 0) && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Products (from selected categories & sellers)
              </label>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/50 p-3 pr-1">
                {productsFiltered.length === 0 ? (
                  <span className="text-[11px] text-slate-400">
                    No products match. Add categories and/or sellers.
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
              Side image (choose one)
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
              {editingSection ? "Save changes" : "Create section"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default OfferSectionsManagement;
