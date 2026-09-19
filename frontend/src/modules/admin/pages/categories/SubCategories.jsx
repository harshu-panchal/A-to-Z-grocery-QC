import React, { useState, useEffect, useMemo, useRef } from "react";
import Badge from "@shared/components/ui/Badge";
import Button from "@shared/components/ui/Button";
import PageHeader from "@shared/components/ui/PageHeader";
import FilterBar from "@shared/components/ui/FilterBar";
import DataTable from "@shared/components/ui/DataTable";
import Pagination from "@shared/components/ui/Pagination";
import {
  Plus,
  Search,
  Edit,
  Trash,
  X,
  Image,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { adminApi } from "../../services/adminApi";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const SUBCATEGORIES_QUERY_KEY = ["admin", "allCategories"];

const makeSlug = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/-+/g, "-");

const SubCategories = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLevel2, setFilterLevel2] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    status: "active",
    type: "subcategory",
    parentId: "",
  });

  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);

  // Perf audit Phase 8: migrated to React Query. Same query key as
  // Level2Categories.jsx's equivalent query — both fetch the exact same
  // unparameterized `getCategories()` endpoint and filter different `type`
  // values client-side, so sharing the key means navigating between the
  // Level2/Subcategory admin pages within the cache window shows data
  // instantly with no refetch, not just within this one page.
  const { data: allCategoriesData, isFetching, isError: isCategoriesError } = useQuery({
    queryKey: SUBCATEGORIES_QUERY_KEY,
    queryFn: async () => {
      const res = await adminApi.getCategories();
      if (!res.data.success) throw new Error("Failed to fetch categories");
      const payload = res.data.result;
      const results = res.data.results;
      const allCats = Array.isArray(results)
        ? results
        : Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.items)
            ? payload.items
            : [];
      return allCats;
    },
  });

  useEffect(() => {
    if (isCategoriesError) toast.error("Failed to fetch categories");
  }, [isCategoriesError]);

  const allCategories = allCategoriesData ?? [];
  const categories = useMemo(() => allCategories.filter((c) => c.type === "subcategory"), [allCategories]);
  const level2Categories = useMemo(() => allCategories.filter((c) => c.type === "category"), [allCategories]);
  const headerCategories = useMemo(() => allCategories.filter((c) => c.type === "header"), [allCategories]);
  const invalidateCategories = () =>
    queryClient.invalidateQueries({ queryKey: SUBCATEGORIES_QUERY_KEY });

  const getParentInfo = (parentId) => {
    const id = parentId?._id || parentId;
    const parent = level2Categories.find((c) => (c._id || c.id) === id);
    if (!parent) return { name: "Unknown", headerName: "Unknown" };

    const headerId = parent.parentId?._id || parent.parentId;
    const header = headerCategories.find((h) => (h._id || h.id) === headerId);

    return {
      name: parent.name,
      headerName: header ? header.name : "Unknown",
    };
  };

  const filteredCategories = useMemo(() => {
    const filtered = categories.filter((cat) => {
      const matchesSearch = cat.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesParent =
        filterLevel2 === "all" ||
        (cat.parentId && cat.parentId._id === filterLevel2) ||
        cat.parentId === filterLevel2;
      return matchesSearch && matchesParent;
    });

    return [...filtered].sort((a, b) => {
      const aName = String(a.name || "").toLowerCase();
      const bName = String(b.name || "").toLowerCase();
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();

      switch (sortBy) {
        case "oldest":
          return aTime - bTime;
        case "name-asc":
          return aName.localeCompare(bName);
        case "name-desc":
          return bName.localeCompare(aName);
        case "newest":
        default:
          return bTime - aTime;
      }
    });
  }, [categories, searchTerm, filterLevel2, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredCategories.length / pageSize));

  const paginatedCategories = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return filteredCategories.slice(startIndex, startIndex + pageSize);
  }, [filteredCategories, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterLevel2, sortBy, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const sortedParentCategoryOptions = useMemo(() => {
    return [...level2Categories]
      .map((c) => {
        const headerId = c.parentId?._id || c.parentId;
        const header = headerCategories.find(
          (h) => (h._id || h.id) === headerId,
        );
        const headerName = header ? header.name : "Unknown";

        return {
          id: c._id || c.id,
          label: `${headerName} > ${c.name}`,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [level2Categories, headerCategories]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.slug || !formData.parentId) {
      toast.error("Name, slug and parent category are required");
      return;
    }

    setIsSaving(true);
    try {
      const data = new FormData();
      data.append("type", "subcategory");
      Object.keys(formData).forEach((key) => {
        if (key !== "type") data.append(key, formData[key]);
      });

      if (imageFile) {
        data.append("image", imageFile);
      } else if (previewUrl && !previewUrl.startsWith("blob:")) {
        // If no new file is chosen, but we have a preview URL that isn't a local blob,
        // it means we have an existing image URL or a string.
        data.append("image", previewUrl);
      }

      if (editingItem) {
        await adminApi.updateCategory(editingItem._id || editingItem.id, data);
        toast.success("Subcategory updated");
      } else {
        await adminApi.createCategory(data);
        toast.success("Subcategory created");
      }
      setIsAddModalOpen(false);
      setEditingItem(null);
      invalidateCategories();
    } catch (error) {
      console.error(error);
      const errorMessage = error.response?.data?.message || (editingItem ? "Failed to update subcategory" : "Failed to create subcategory");
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await adminApi.deleteCategory(deleteTarget._id || deleteTarget.id);
      toast.success("Subcategory deleted");
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
      invalidateCategories();
    } catch (error) {
      const errorMessage = error.response?.data?.message || "Failed to delete subcategory";
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
      type: "subcategory",
      parentId: "",
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
      type: "subcategory",
      parentId: item.parentId?._id || item.parentId || "",
    });
    const currentImage = item.image && typeof item.image === 'object' ? item.image.url : (item.image || null);
    setPreviewUrl(currentImage);
    setIsAddModalOpen(true);
  };

  const handleSelect = (id) => {
    setSelectedItems((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedItems(paginatedCategories.map((c) => c._id || c.id));
    } else {
      setSelectedItems([]);
    }
  };

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
      header: 'Subcategory',
      key: 'name',
      primary: true,
      cell: (cat) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {cat.image ? (
              <img
                src={typeof cat.image === 'string' ? cat.image : (cat.image.url || cat.image.secure_url || cat.image)}
                alt={cat.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <Image className="h-5 w-5 text-slate-400" />
            )}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">{cat.name}</p>
            <p className="text-[11px] font-medium text-slate-400">{cat.slug}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Parent Chain',
      key: 'parent',
      cell: (cat) => {
        const parentInfo = getParentInfo(cat.parentId);
        return (
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              {parentInfo.headerName}
            </span>
            <span className="border-l-2 border-slate-200 pl-2 text-xs font-semibold text-slate-700">{parentInfo.name}</span>
          </div>
        );
      },
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
            <Trash className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Subcategories"
        description="Manage level 3 categories linked to each secondary category."
        actions={
          <Button onClick={openAddModal}>
            <Plus className="h-4 w-4" />
            Add New Subcategory
          </Button>
        }
      />

      <FilterBar
        left={
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search subcategories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        }
        right={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterLevel2}
              onChange={(e) => setFilterLevel2(e.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All Level 2 Categories</option>
              {level2Categories.map((c) => (
                <option key={c._id || c.id} value={c._id || c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
            </select>
          </div>
        }
      />

      <div className="flex items-center gap-2 px-1">
        <input
          type="checkbox"
          className="rounded border-slate-300 text-primary focus:ring-primary"
          checked={
            selectedItems.length > 0 &&
            paginatedCategories.length > 0 &&
            paginatedCategories.every((cat) => selectedItems.includes(cat._id || cat.id))
          }
          onChange={handleSelectAll}
        />
        <span className="text-xs font-medium text-slate-500">Select all on this page</span>
      </div>

      <DataTable
        columns={categoryColumns}
        data={paginatedCategories}
        rowKey={(c) => c._id || c.id}
        loading={isFetching}
        emptyState={<div className="py-12 text-center text-sm text-slate-400">No subcategories found.</div>}
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        total={filteredCategories.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        loading={isFetching}
      />

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-lg font-bold text-slate-900">
                  {editingItem ? "Edit Subcategory" : "Add Subcategory"}
                </h2>
                <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Image Upload */}
                <div className="flex justify-center">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-24 h-24 rounded-full bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center cursor-pointer hover:border-primary overflow-hidden transition-colors">
                    {previewUrl ? (
                      <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center">
                        <Image className="w-8 h-8 text-slate-400 mx-auto" />
                        <span className="text-xs text-slate-500 mt-1">Upload</span>
                      </div>
                    )}
                  </div>
                  <input type="file" ref={fileInputRef} className="hidden" onChange={handleImageChange} accept="image/*" />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Parent Category (Level 2)</label>
                  <select
                    value={formData.parentId}
                    onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                    <option value="">Select Parent Category</option>
                    {sortedParentCategoryOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value, slug: makeSlug(e.target.value) })}
                    className="w-full px-3 py-2 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="e.g., Gaming Laptops"
                    maxLength={50}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Slug</label>
                  <input
                    type="text"
                    value={formData.slug}
                    readOnly
                    className="w-full px-3 py-2 rounded-md border border-slate-300 bg-slate-50 text-slate-600 focus:outline-none"
                    placeholder="e.g., gaming-laptops"
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
              </div>

              <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium">
                  Cancel
                </button>
                <Button onClick={handleSave} isLoading={isSaving}>
                  {editingItem ? "Update Subcategory" : "Create Subcategory"}
                </Button>
              </div>
            </motion.div>
          </div>
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
                  <Trash className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Delete Subcategory?</h3>
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

export default SubCategories;
