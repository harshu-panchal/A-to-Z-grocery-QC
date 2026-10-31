import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HiOutlinePencilSquare } from "react-icons/hi2";
import { adminApi } from "../services/adminApi";
import Button from "@shared/components/ui/Button";
import Modal from "@shared/components/ui/Modal";
import PageHeader from "@shared/components/ui/PageHeader";
import DataTable from "@shared/components/ui/DataTable";
import { useToast } from "@shared/components/ui/Toast";
import BannerListEditor from "../components/BannerListEditor";
import { bannerPayload, newBanner, toEditorItems, validateBanners } from "../components/bannerEditorUtils";

const HERO_CATEGORIES_QUERY_KEY = ["admin", "heroCategoriesPerPage"];
// a header named "All" is the main page
const isAllHeader = (row) => /^all\b/i.test(String(row?.label || "").trim());

export default function HeroCategoriesPerPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [formBanners, setFormBanners] = useState([newBanner()]);
  const [formCategoryIds, setFormCategoryIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);

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

      const flatCategories = headerList.flatMap((h) => (h.children || []).map((c) => ({ ...c, headerId: String(h._id), headerName: h.name })));

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
            label: /^all$/i.test(String(h.name || "").trim()) ? `${h.name} (shows on main page)` : h.name || "Unnamed",
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
  // banner targets: the main page (All) + every header the admin made
  const bannerTargets = [
    { id: "all", name: "All (main page)" },
    ...(queryData?.headers ?? []).filter((h) => !isAllHeader({ label: h.name })).map((h) => ({ id: String(h._id), name: h.name })),
  ];
  const pageData = queryData?.pageData ?? [];

  useEffect(() => {
    if (isError) showToast("Failed to load hero config", "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError]);

  const openEdit = async (row) => {
    if (opening) return;
    setOpening(true);
    try {
      const res = await adminApi.getHeroConfig({
        pageType: row.pageType,
        headerId: row.headerId || undefined,
      });
      const result = res.data?.result || res.data || {};
      const items = result.banners?.items || [];
      const catIds = result.categoryIds || [];
      // Saved ids may come back populated; the form works with plain ids.
      // older banners (no "show on" yet) open ticked for the page they were added on
      const ownPage = row.pageType === "header" && !isAllHeader(row) ? String(row.headerId) : "all";
      setFormBanners(items.length ? toEditorItems(items).map((b) => (b.showOn?.length ? b : { ...b, showOn: [ownPage] })) : [newBanner()]);
      setFormCategoryIds(
        (Array.isArray(catIds) ? catIds : []).map((c) => String(c && typeof c === "object" ? c._id : c))
      );
      setEditingRow(row);
      setModalOpen(true);
    } catch (e) {
      // Opening a blank form here would let a save overwrite the real config.
      console.error(e);
      showToast("Could not load this page's saved hero. Try again.", "error");
    } finally {
      setOpening(false);
    }
  };


  const handleSave = async () => {
    if (!editingRow || saving) return;
    const problem = validateBanners(formBanners)
      || (formBanners.some((b) => b.imageUrl && !(b.showOn || []).length) ? "Each banner needs at least one place to show: tick a header (or All)." : null);
    if (problem) {
      showToast(problem, "warning");
      return;
    }
    const items = bannerPayload(formBanners);
    setSaving(true);
    try {
      await adminApi.setHeroConfig({
        pageType: editingRow.pageType,
        headerId: editingRow.headerId || undefined,
        banners: { items },
        categoryIds: editingRow.pageType === "header" ? formCategoryIds.filter((id) => allCategories.some((c) => c._id === id && c.headerId === String(editingRow.headerId))) : formCategoryIds,
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
      header: 'Action',
      key: 'action',
      cell: (row) => (
        <button
          type="button"
          onClick={() => openEdit(row)}
          disabled={opening}
          className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline disabled:opacity-50"
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
            <BannerListEditor
              items={formBanners}
              onChange={setFormBanners}
              targets={bannerTargets}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
