import React, { useState, useEffect, useRef, useMemo } from "react";
import Badge from "@shared/components/ui/Badge";
import Button from "@shared/components/ui/Button";
import PageHeader from "@shared/components/ui/PageHeader";
import FilterBar from "@shared/components/ui/FilterBar";
import DataTable from "@shared/components/ui/DataTable";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Upload,
  Image,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { adminApi } from "../../services/adminApi";
import { toast } from "sonner";
import IconSelector from "@shared/components/IconSelector";
import Pagination from "@shared/components/ui/Pagination";
import { getIconSvg } from "@shared/constants/categoryIcons";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";

// MUI icon library (shared with customer app & icon selector)
import HomeIcon from "@mui/icons-material/Home";
import DevicesIcon from "@mui/icons-material/Devices";
import LocalGroceryStoreIcon from "@mui/icons-material/LocalGroceryStore";
import ChildCareIcon from "@mui/icons-material/ChildCare";
import PetsIcon from "@mui/icons-material/Pets";
import SportsSoccerIcon from "@mui/icons-material/SportsSoccer";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import SpaIcon from "@mui/icons-material/Spa";
import ToysIcon from "@mui/icons-material/Toys";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import YardIcon from "@mui/icons-material/Yard";
import BusinessCenterIcon from "@mui/icons-material/BusinessCenter";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import CheckroomIcon from "@mui/icons-material/Checkroom";
import LocalCafeIcon from "@mui/icons-material/LocalCafe";
import DiamondIcon from "@mui/icons-material/Diamond";
import ColorLensIcon from "@mui/icons-material/ColorLens";
import BuildIcon from "@mui/icons-material/Build";
import LuggageIcon from "@mui/icons-material/Luggage";

const makeSlug = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/-+/g, "-");

const HEADER_CATEGORIES_QUERY_KEY = ["admin", "headerCategories"];

const HeaderCategories = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isIconSelectorOpen, setIsIconSelectorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    status: "active",
    type: "header",
    parentId: null,
    iconId: "",
    adminCommission: "",
    handlingFees: "",
    headerColor: "#FF1E1E",
    headerFontColor: "#111111",
    headerIconColor: "#111111",
  });

  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);

  // Map our icon ids to MUI icon components so admin UI
  // previews the same icons used in the customer app.
  const iconComponents = {
    electronics: DevicesIcon,
    fashion: CheckroomIcon,
    home: HomeIcon,
    food: LocalCafeIcon,
    sports: SportsSoccerIcon,
    books: MenuBookIcon,
    beauty: SpaIcon,
    toys: ToysIcon,
    automotive: DirectionsCarIcon,
    pets: PetsIcon,
    health: LocalHospitalIcon,
    garden: YardIcon,
    office: BusinessCenterIcon,
    music: MusicNoteIcon,
    jewelry: DiamondIcon,
    baby: ChildCareIcon,
    tools: BuildIcon,
    luggage: LuggageIcon,
    art: ColorLensIcon,
    grocery: LocalGroceryStoreIcon,
  };

  // Perf audit Phase 8: migrated to React Query — same 400ms debounce and
  // page-reset-on-search-change behavior as before.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  const categoriesQueryParams = useMemo(() => {
    const params = { type: "header", page, limit: pageSize };
    if (debouncedSearchTerm) params.search = debouncedSearchTerm;
    return params;
  }, [page, pageSize, debouncedSearchTerm]);

  const {
    data: categoriesQueryData,
    isFetching,
    isError: isCategoriesError,
  } = useQuery({
    queryKey: [...HEADER_CATEGORIES_QUERY_KEY, categoriesQueryParams],
    queryFn: async () => {
      const res = await adminApi.getCategories(categoriesQueryParams);
      if (!res.data.success) throw new Error("Failed to fetch header categories");
      const payload = res.data.result || {};
      const list = Array.isArray(payload.items) ? payload.items : [];
      const allCats = res.data.results || [];
      const headers = list.length > 0 ? list : allCats.filter((c) => c.type === "header");
      return {
        items: headers,
        total: typeof payload.total === "number" ? payload.total : headers.length,
        page: typeof payload.page === "number" ? payload.page : categoriesQueryParams.page,
      };
    },
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (isCategoriesError) toast.error("Failed to fetch header categories");
  }, [isCategoriesError]);

  const categories = categoriesQueryData?.items ?? [];
  const total = categoriesQueryData?.total ?? 0;
  const invalidateCategories = () =>
    queryClient.invalidateQueries({ queryKey: HEADER_CATEGORIES_QUERY_KEY });

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedItems(categories.map((c) => c._id || c.id));
    } else {
      setSelectedItems([]);
    }
  };

  const handleSelect = (id) => {
    if (selectedItems.includes(id)) {
      setSelectedItems(selectedItems.filter((item) => item !== id));
    } else {
      setSelectedItems([...selectedItems, id]);
    }
  };

  const handleBulkDelete = () => {
    if (selectedItems.length === 0) return;
    // In a real app, you would have a bulk delete API endpoint
    // For now, we'll just show a toast
    toast.info(
      `Bulk delete functionality for ${selectedItems.length} items would be triggered here.`,
    );
    setSelectedItems([]);
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.slug) {
      toast.error("Name and slug are required");
      return;
    }

    const hexRegex = /^#([0-9A-F]{3}|[0-9A-F]{6})$/i;
    if (formData.headerColor && !hexRegex.test(formData.headerColor)) {
      toast.error("Header Background must be a valid hex code (e.g., #FF1E1E)");
      return;
    }
    if (formData.headerFontColor && !hexRegex.test(formData.headerFontColor)) {
      toast.error("Title/Text Color must be a valid hex code (e.g., #FFFFFF)");
      return;
    }
    if (formData.headerIconColor && !hexRegex.test(formData.headerIconColor)) {
      toast.error("Active Tab / Icon Color must be a valid hex code (e.g., #111111)");
      return;
    }

    setIsSaving(true);
    try {
      const data = new FormData();
      // Ensure type is always header
      data.append("type", "header");
      Object.keys(formData).forEach((key) => {
        if (key === "type") return;
        if (key === "adminCommission" || key === "handlingFees") {
          data.append(key, formData[key] === "" ? "0" : String(formData[key]));
          return;
        }
        data.append(key, formData[key]);
      });

      if (imageFile) {
        data.append("image", imageFile);
      } else if (previewUrl && !previewUrl.startsWith("blob:")) {
        data.append("image", previewUrl);
      }

      if (editingItem) {
        await adminApi.updateCategory(editingItem._id || editingItem.id, data);
        toast.success("Header category updated");
      } else {
        await adminApi.createCategory(data);
        toast.success("Header category created");
      }
      setIsAddModalOpen(false);
      setEditingItem(null);
      invalidateCategories();
    } catch (error) {
      console.error(error);
      const errorMessage = error.response?.data?.message || (editingItem ? "Failed to update category" : "Failed to create category");
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await adminApi.deleteCategory(deleteTarget._id || deleteTarget.id);
      toast.success("Header category deleted");
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
      invalidateCategories();
    } catch (error) {
      const errorMessage = error.response?.data?.message || "Failed to delete category";
      toast.error(errorMessage);
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setFormData({
      name: "",
      slug: "",
      description: "",
      status: "active",
      type: "header",
      parentId: null,
      iconId: "",
      adminCommission: "",
      handlingFees: "",
      headerColor: "#FF1E1E",
      headerFontColor: "#111111",
      headerIconColor: "#111111",
    });
    setImageFile(null);
    setPreviewUrl(null);
    setIsAddModalOpen(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      slug: item.slug,
      description: item.description || "",
      status: item.status,
      type: "header",
      parentId: null,
      iconId: item.iconId || "",
      adminCommission: item.adminCommission ?? "",
      handlingFees: item.handlingFees ?? "",
      headerColor: item.headerColor || "#FF1E1E",
      headerFontColor: item.headerFontColor || "#FFFFFF",
      headerIconColor: item.headerIconColor || "#111111",
    });
    setPreviewUrl(item.image || null);
    setIsAddModalOpen(true);
  };

  const renderIconPreview = (cat) => (
    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      {cat.iconId && iconComponents[cat.iconId] ? (
        <div className="flex h-6 w-6 items-center justify-center text-primary">
          {(() => { const IconComp = iconComponents[cat.iconId]; return <IconComp fontSize="medium" />; })()}
        </div>
      ) : cat.iconId && getIconSvg(cat.iconId) ? (
        <div className="h-6 w-6 text-primary" dangerouslySetInnerHTML={{ __html: getIconSvg(cat.iconId) }} />
      ) : cat.image ? (
        <img src={cat.image} alt={cat.name} className="h-full w-full object-cover" />
      ) : (
        <Image className="h-5 w-5 text-slate-400" />
      )}
    </div>
  );

  const categoryColumns = [
    {
      header: '',
      key: 'select',
      hideOnMobile: true,
      cell: (cat) => (
        <input
          type="checkbox"
          className="rounded border-slate-300 text-primary focus:ring-primary"
          checked={selectedItems.includes(cat._id || cat.id)}
          onChange={() => handleSelect(cat._id || cat.id)}
        />
      ),
    },
    {
      header: 'Header Category',
      key: 'name',
      primary: true,
      cell: (cat) => (
        <div className="flex items-center gap-3">
          {renderIconPreview(cat)}
          <div>
            <p className="text-sm font-bold text-slate-900">{cat.name}</p>
            <p className="text-[11px] font-medium text-slate-400">{cat.slug}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Commission',
      key: 'commission',
      cell: (cat) => <span className="text-sm font-semibold text-slate-700">{cat.adminCommission ?? 0}%</span>,
    },
    {
      header: 'Handling Fees',
      key: 'fees',
      cell: (cat) => <span className="text-sm font-semibold text-slate-700">₹{cat.handlingFees ?? 0}</span>,
    },
    {
      header: 'Status',
      key: 'status',
      cell: (cat) => <Badge variant={cat.status === "active" ? "success" : "warning"}>{cat.status}</Badge>,
    },
    {
      header: 'Actions',
      key: 'actions',
      align: 'right',
      cell: (cat) => (
        <div className="flex items-center justify-end gap-1">
          <button onClick={() => openEditModal(cat)} className="rounded-lg p-2 text-slate-500 transition-all hover:bg-primary/10 hover:text-primary">
            <Edit className="h-4 w-4" />
          </button>
          <button onClick={() => { setDeleteTarget(cat); setIsDeleteModalOpen(true); }} className="rounded-lg p-2 text-slate-500 transition-all hover:bg-danger/10 hover:text-danger">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Header Categories"
        description="Manage the top-level navigation categories customers browse by."
        actions={
          <Button onClick={openAddModal}>
            <Plus className="h-4 w-4" />
            Add New Header
          </Button>
        }
      />

      <FilterBar
        left={
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search header categories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        }
        right={
          selectedItems.length > 0 && (
            <Button variant="danger" onClick={handleBulkDelete}>
              <Trash2 className="h-4 w-4" />
              Delete ({selectedItems.length})
            </Button>
          )
        }
      />

      <div className="flex items-center gap-2 px-1">
        <input
          type="checkbox"
          className="rounded border-slate-300 text-primary focus:ring-primary"
          checked={selectedItems.length > 0 && categories.length > 0 && selectedItems.length === categories.length}
          onChange={handleSelectAll}
        />
        <span className="text-xs font-medium text-slate-500">Select all on this page</span>
      </div>

      <DataTable
        columns={categoryColumns}
        data={categories}
        rowKey={(c) => c._id || c.id}
        loading={isFetching}
        emptyState={<div className="py-12 text-center text-sm text-slate-400">No header categories found.</div>}
      />

      <Pagination
        page={categoriesQueryData?.page ?? page}
        totalPages={Math.ceil(total / pageSize) || 1}
        total={total}
        pageSize={pageSize}
        onPageChange={(p) => setPage(p)}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        loading={isFetching}
      />

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
                <h2 className="text-lg font-bold text-slate-900">
                  {editingItem ? "Edit Header Category" : "Add Header Category"}
                </h2>
                <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div
                className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0 overscroll-contain touch-pan-y"
                tabIndex={0}
                onWheel={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
              >
                {/* Icon/Image Selection */}
                <div className="flex flex-col items-center gap-4">
                  <div className="flex flex-wrap items-start justify-center gap-4">
                    {/* SVG Icon Display */}
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-24 h-24 rounded-full bg-primary/5 border-2 border-primary/20 flex items-center justify-center">
                        {formData.iconId && iconComponents[formData.iconId] ? (
                          <div className="w-12 h-12 text-primary flex items-center justify-center">
                            {(() => {
                              const IconComp = iconComponents[formData.iconId];
                              return <IconComp fontSize="large" />;
                            })()}
                          </div>
                        ) : formData.iconId && getIconSvg(formData.iconId) ? (
                          <div
                            className="w-12 h-12 text-primary"
                            dangerouslySetInnerHTML={{
                              __html: getIconSvg(formData.iconId),
                            }}
                          />
                        ) : (
                          <Sparkles className="w-10 h-10 text-primary/30" />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsIconSelectorOpen(true)}
                        className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
                        {formData.iconId ? 'Change Icon' : 'Select Icon'}
                      </button>
                    </div>

                    {/* OR Divider */}
                    <div className="flex items-center">
                      <span className="text-slate-400 font-medium">OR</span>
                    </div>

                    {/* Image Upload */}
                    <div className="flex flex-col items-center gap-2">
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="w-24 h-24 rounded-full bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center cursor-pointer hover:border-primary overflow-hidden transition-colors">
                        {previewUrl ? (
                          <img
                            src={previewUrl}
                            alt="Preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="text-center">
                            <Upload className="w-8 h-8 text-slate-400 mx-auto" />
                            <span className="text-xs text-slate-500 mt-1">
                              Upload
                            </span>
                          </div>
                        )}
                      </div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleImageChange}
                        accept="image/*"
                      />
                      <span className="text-xs text-slate-500">Custom Image</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 text-center">
                    Choose an SVG icon or upload a custom image
                  </p>
                </div>

                {/* Header Color Picker */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                      Header Background
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={formData.headerColor || "#FF1E1E"}
                        onChange={(e) => setFormData({ ...formData, headerColor: e.target.value })}
                        className="w-10 h-10 rounded-lg border border-slate-300 cursor-pointer bg-transparent p-0 overflow-hidden shrink-0"
                      />
                      <input
                        type="text"
                        value={formData.headerColor || "#FF1E1E"}
                        onChange={(e) => setFormData({ ...formData, headerColor: e.target.value })}
                        className="flex-1 px-3 py-2 rounded-md border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="#FF1E1E"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                      Title/Text Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={formData.headerFontColor || "#FFFFFF"}
                        onChange={(e) => setFormData({ ...formData, headerFontColor: e.target.value })}
                        className="w-10 h-10 rounded-lg border border-slate-300 cursor-pointer bg-transparent p-0 overflow-hidden shrink-0"
                      />
                      <input
                        type="text"
                        value={formData.headerFontColor || "#FFFFFF"}
                        onChange={(e) => setFormData({ ...formData, headerFontColor: e.target.value })}
                        className="flex-1 px-3 py-2 rounded-md border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="#FFFFFF"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                      Active Tab / Icon Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={formData.headerIconColor || "#111111"}
                        onChange={(e) => setFormData({ ...formData, headerIconColor: e.target.value })}
                        className="w-10 h-10 rounded-lg border border-slate-300 cursor-pointer bg-transparent p-0 overflow-hidden shrink-0"
                      />
                      <input
                        type="text"
                        value={formData.headerIconColor || "#111111"}
                        onChange={(e) => setFormData({ ...formData, headerIconColor: e.target.value })}
                        className="flex-1 px-3 py-2 rounded-md border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="#111111"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value, slug: makeSlug(e.target.value) })}
                    className="w-full px-3 py-2 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="e.g., Electronics"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Slug</label>
                  <input
                    type="text"
                    value={formData.slug}
                    readOnly
                    className="w-full px-3 py-2 rounded-md border border-slate-300 bg-slate-50 text-slate-600 focus:outline-none"
                    placeholder="e.g., electronics"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Admin Commission (%)</label>
                    <input
                      type="number"
                      value={formData.adminCommission}
                      onChange={(e) => setFormData({ ...formData, adminCommission: e.target.value })}
                      className="w-full px-3 py-2 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="0"
                      min="0"
                      max="100"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Handling Fees (₹)</label>
                    <input
                      type="number"
                      value={formData.handlingFees}
                      onChange={(e) => setFormData({ ...formData, handlingFees: e.target.value })}
                      className="w-full px-3 py-2 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="0"
                      min="0"
                    />
                  </div>
                </div>
              </div>

              <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 shrink-0">
                <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium">
                  Cancel
                </button>
                <Button onClick={handleSave} isLoading={isSaving}>
                  {editingItem ? "Update Header" : "Create Header"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Icon Selector Modal */}
      <AnimatePresence>
        {isIconSelectorOpen && (
          <IconSelector
            selectedIcon={formData.iconId}
            onSelect={(iconId) => {
              setFormData({ ...formData, iconId });
              setIsIconSelectorOpen(false);
            }}
            onClose={() => setIsIconSelectorOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Delete Category?</h3>
                <p className="text-slate-500 text-sm mb-6">
                  Are you sure you want to delete{" "}
                  <span className="font-semibold text-slate-900">{deleteTarget?.name}</span>? This action cannot be undone.
                </p>
                <div className="flex gap-3 justify-center">
                  <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
                  <Button variant="danger" onClick={handleDelete}>Delete</Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HeaderCategories;
