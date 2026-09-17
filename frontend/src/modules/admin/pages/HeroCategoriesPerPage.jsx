import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HiOutlinePencilSquare,
  HiOutlinePhoto,
  HiOutlinePlus,
  HiOutlineXMark,
} from "react-icons/hi2";
import { adminApi } from "../services/adminApi";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";
import Modal from "@shared/components/ui/Modal";
import PageHeader from "@shared/components/ui/PageHeader";
import DataTable from "@shared/components/ui/DataTable";
import { useToast } from "@shared/components/ui/Toast";
import { cn } from "@/lib/utils";

const emptyBannerItem = () => ({
  imageUrl: "",
  title: "",
  subtitle: "",
  linkType: "none",
  linkValue: "",
  isUploading: false,
});

const HERO_CATEGORIES_QUERY_KEY = ["admin", "heroCategoriesPerPage"];

export default function HeroCategoriesPerPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [formBanners, setFormBanners] = useState([emptyBannerItem()]);
  const [formCategoryIds, setFormCategoryIds] = useState([]);
  const [saving, setSaving] = useState(false);

  // Perf audit Phase 8: migrated the compound tree + per-header hero-config
  // load to a single React Query entry (it was always fetched as one unit
  // on mount, so one query key matches the original data-loading shape).
  const {
    data: queryData,
    isLoading: loading,
    isError,
  } = useQuery({
    queryKey: HERO_CATEGORIES_QUERY_KEY,
    queryFn: async () => {
      const treeRes = await adminApi.getCategoryTree();
      const tree = treeRes.data?.results || treeRes.data?.result || [];
      const headerList = Array.isArray(tree) ? tree : [];

      const flatCategories = headerList.flatMap((h) => (h.children || []).map((c) => ({ ...c, headerName: h.name })));

      const homeRes = await adminApi.getHeroConfig({ pageType: "home" });
      const homeResult = homeRes.data?.result || homeRes.data || {};
      const homeBanners = homeResult.banners?.items || [];
      const homeCatIds = homeResult.categoryIds || [];

      const rows = [
        {
          id: "home",
          label: "Home",
          pageType: "home",
          headerId: null,
          bannerCount: homeBanners.length,
          categoryCount: homeCatIds.length,
        },
      ];

      const headerRows = await Promise.all(
        headerList.map(async (h) => {
          const res = await adminApi.getHeroConfig({
            pageType: "header",
            headerId: h._id,
          });
          const result = res.data?.result || res.data || {};
          const items = result.banners?.items || [];
          const catIds = result.categoryIds || [];
          return {
            id: h._id,
            label: h.name || "Unnamed",
            pageType: "header",
            headerId: h._id,
            bannerCount: items.length,
            categoryCount: catIds.length,
          };
        })
      );

      return {
        headers: headerList,
        allCategories: flatCategories,
        pageData: [...rows, ...headerRows],
      };
    },
  });

  const allCategories = queryData?.allCategories ?? [];
  const pageData = queryData?.pageData ?? [];

  useEffect(() => {
    if (isError) showToast("Failed to load hero config", "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError]);

  const openEdit = async (row) => {
    setEditingRow(row);
    setFormCategoryIds([]);
    setFormBanners([emptyBannerItem()]);
    try {
      const res = await adminApi.getHeroConfig({
        pageType: row.pageType,
        headerId: row.headerId || undefined,
      });
      const result = res.data?.result || res.data || {};
      const items = result.banners?.items || [];
      const catIds = result.categoryIds || [];
      setFormBanners(
        items.length
          ? items.map((b) => ({ ...b, isUploading: false }))
          : [emptyBannerItem()]
      );
      setFormCategoryIds(Array.isArray(catIds) ? catIds : []);
    } catch (e) {
      console.error(e);
    }
    setModalOpen(true);
  };

  const updateBannerItem = (idx, changes) => {
    setFormBanners((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...changes };
      return next;
    });
  };

  const addBannerItem = () => {
    setFormBanners((prev) => [...prev, emptyBannerItem()]);
  };

  const removeBannerItem = (idx) => {
    setFormBanners((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleBannerFileChange = async (idx, file) => {
    if (!file) return;
    updateBannerItem(idx, { isUploading: true });
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await adminApi.uploadExperienceBanner(fd);
      const url = res.data?.result?.url || res.data?.url;
      if (!url) throw new Error("Upload failed");
      updateBannerItem(idx, { imageUrl: url, isUploading: false });
      showToast("Banner image uploaded", "success");
    } catch (e) {
      console.error(e);
      updateBannerItem(idx, { isUploading: false });
      showToast("Failed to upload banner image", "error");
    }
  };

  const toggleCategory = (catId) => {
    setFormCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  const handleSave = async () => {
    const items = formBanners.filter((b) => b.imageUrl).map((b) => ({
      imageUrl: b.imageUrl,
      title: b.title || "",
      subtitle: b.subtitle || "",
      linkType: b.linkType || "none",
      linkValue: b.linkValue || "",
      status: b.status || "active",
    }));

    if (!editingRow) return;
    setSaving(true);
    try {
      await adminApi.setHeroConfig({
        pageType: editingRow.pageType,
        headerId: editingRow.headerId || undefined,
        banners: { items },
        categoryIds: formCategoryIds,
      });
      showToast("Hero config saved", "success");
      queryClient.setQueryData(HERO_CATEGORIES_QUERY_KEY, (prev) =>
        prev
          ? {
              ...prev,
              pageData: prev.pageData.map((p) =>
                p.id === editingRow.id
                  ? {
                      ...p,
                      bannerCount: items.length,
                      categoryCount: formCategoryIds.length,
                    }
                  : p
              ),
            }
          : prev
      );
      setModalOpen(false);
      setEditingRow(null);
    } catch (e) {
      console.error(e);
      showToast(e.response?.data?.message || "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      header: 'Page',
      key: 'page',
      cell: (row) => <span className="text-sm font-bold text-slate-800">{row.label}</span>,
    },
    {
      header: 'Hero (top banners)',
      key: 'hero',
      cell: (row) => row.bannerCount > 0 ? (
        <span className="text-xs font-semibold text-slate-600">{row.bannerCount} banner(s)</span>
      ) : (
        <span className="text-xs italic text-slate-400">Not set</span>
      ),
    },
    {
      header: 'Categories below hero',
      key: 'categories',
      cell: (row) => row.categoryCount > 0 ? (
        <span className="text-xs font-semibold text-slate-600">
          {row.categoryCount} categor{row.categoryCount === 1 ? "y" : "ies"}
        </span>
      ) : (
        <span className="text-xs italic text-slate-400">Not set</span>
      ),
    },
    {
      header: 'Action',
      key: 'action',
      cell: (row) => (
        <button
          type="button"
          onClick={() => openEdit(row)}
          className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline"
        >
          <HiOutlinePencilSquare className="h-3.5 w-3.5" />
          Edit
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hero & Categories Per Page"
        description="Configure the separate hero banners and categories strip at the top of each page. If a header page has no config, the storefront shows the home page hero and categories."
      />

      <DataTable
        columns={columns}
        data={pageData}
        rowKey={(row) => row.id}
        loading={loading}
      />

      <p className="text-xs text-slate-400">
        This is a <strong>separate</strong> hero section. Experience sections in Create Sections
        are unchanged and used for the main content area below.
      </p>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editingRow ? `Edit hero & categories — ${editingRow.label}` : "Edit"}
        size="xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} isLoading={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      >
        {editingRow && (
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Hero banners
                </label>
                <button
                  type="button"
                  onClick={addBannerItem}
                  className="flex items-center gap-1 text-[10px] font-bold text-primary"
                >
                  <HiOutlinePlus className="h-3 w-3" />
                  Add banner
                </button>
              </div>
              <div className="max-h-48 space-y-3 overflow-y-auto">
                {formBanners.map((item, idx) => (
                  <Card key={idx} className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.title || `Banner ${idx + 1}`}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <HiOutlinePhoto className="h-6 w-6 text-slate-300" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              id={`hero-banner-file-${idx}`}
                              onChange={(e) => handleBannerFileChange(idx, e.target.files?.[0])}
                            />
                            <label
                              htmlFor={`hero-banner-file-${idx}`}
                              className="inline-block cursor-pointer rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-200"
                            >
                              {item.isUploading ? "Uploading…" : item.imageUrl ? "Change" : "Upload"}
                            </label>
                            <input
                              value={item.title || ""}
                              onChange={(e) => updateBannerItem(idx, { title: e.target.value })}
                              className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                              placeholder="Title (optional)"
                            />
                            <input
                              value={item.subtitle || ""}
                              onChange={(e) => updateBannerItem(idx, { subtitle: e.target.value })}
                              className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                              placeholder="Subtitle (optional)"
                            />
                          </div>
                        </div>
                      </div>
                      {formBanners.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeBannerItem(idx)}
                          className="rounded-lg p-2 text-slate-300 transition-all hover:bg-danger/10 hover:text-danger"
                        >
                          <HiOutlineXMark className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Categories below hero
              </label>
              <div className="flex flex-wrap gap-2">
                {allCategories.map((c) => {
                  const isSelected = formCategoryIds.includes(c._id);
                  return (
                    <button
                      key={c._id}
                      type="button"
                      onClick={() => toggleCategory(c._id)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all",
                        isSelected
                          ? "border-primary bg-primary text-white"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                      )}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
              {allCategories.length === 0 && (
                <p className="text-xs text-slate-400">No main categories found. Add categories in Header / Main Categories first.</p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
