import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  LayoutGrid,
  ChevronRight,
  ChevronLeft,
  Search,
  FolderOpen,
  Folder,
  Tag,
  Layers,
  ArrowRight,
} from "lucide-react";
import { adminApi } from "../../services/adminApi";
import Badge from "@shared/components/ui/Badge";
import PageHeader from "@shared/components/ui/PageHeader";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

const CategoryHierarchy = () => {
  const [searchTerm, setSearchTerm] = useState("");

  // Selection State for Miller Columns
  const [selectedHeader, setSelectedHeader] = useState(null);
  const [selectedLevel2, setSelectedLevel2] = useState(null);

  // On mobile, only one column is shown at a time (single-panel + back nav)
  const [mobileColumn, setMobileColumn] = useState("headers"); // "headers" | "level2" | "subs"

  // Perf audit Phase 8: migrated to React Query — this is a read-only
  // browser (no create/edit here), so a single cached query with no
  // mutation-invalidation path is a direct swap.
  const { data: categories = [], isLoading, isError } = useQuery({
    queryKey: ["admin", "categoryTree"],
    queryFn: async () => {
      const res = await adminApi.getCategoryTree();
      if (!res.data.success) return [];
      return res.data.results || res.data.result || [];
    },
  });

  // Stats
  const stats = useMemo(() => {
    let headers = 0;
    let l2 = 0;
    let subs = 0;

    const traverse = (items) => {
      items.forEach((item) => {
        if (item.type === "header") headers++;
        if (item.type === "category") l2++;
        if (item.type === "subcategory") subs++;
        if (item.children) traverse(item.children);
      });
    };
    traverse(categories);
    return { headers, l2, subs, total: headers + l2 + subs };
  }, [categories]);

  useEffect(() => {
    if (isError) toast.error("Failed to fetch category hierarchy");
  }, [isError]);

  // Filter Logic
  const filteredHeaders = useMemo(() => {
    if (!searchTerm) return categories.filter((c) => c.type === "header");

    // If searching, we want to show path to matches
    // But for Miller columns, simple filtering of top level might be confusing
    // So we'll just filter the current list being viewed
    return categories.filter(
      (c) =>
        c.type === "header" &&
        c.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [categories, searchTerm]);

  const activeLevel2 = useMemo(() => {
    if (!selectedHeader) return [];
    return selectedHeader.children || [];
  }, [selectedHeader]);

  const activeSubs = useMemo(() => {
    if (!selectedLevel2) return [];
    return selectedLevel2.children || [];
  }, [selectedLevel2]);

  // Handle Selection
  const handleHeaderSelect = (header) => {
    setSelectedHeader(header);
    setSelectedLevel2(null);
    setMobileColumn("level2");
  };

  const handleLevel2Select = (l2) => {
    setSelectedLevel2(l2);
    setMobileColumn("subs");
  };

  const handleMobileBack = () => {
    setMobileColumn((prev) => (prev === "subs" ? "level2" : "headers"));
  };

  // Components
  const ColumnHeader = ({ title, icon: Icon, count, accentClass }) => (
    <div className={`flex items-center justify-between border-b border-slate-100 bg-white p-3.5 sticky top-0 z-10 border-l-4 ${accentClass}`}>
      <div className="flex items-center gap-2 font-bold text-sm text-slate-700">
        <Icon className="w-4 h-4" />
        <span>{title}</span>
      </div>
      <Badge variant="outline">{count}</Badge>
    </div>
  );

  const ListItem = ({ item, isSelected, onClick, hasChildren, type }) => {
    const activeClass = isSelected
      ? "bg-primary/10 border-primary/20 text-primary shadow-sm z-10"
      : "hover:bg-slate-50 border-transparent text-slate-600";

    const iconColor = isSelected ? "text-primary" : "text-slate-400";

    return (
      <motion.div
        layout
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={onClick}
        className={`group flex items-center justify-between p-3 mx-2 my-1 rounded-lg border cursor-pointer transition-all duration-200 ${activeClass}`}>
        <div className="flex items-center gap-3 overflow-hidden">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-white shadow-sm" : "bg-slate-100 group-hover:bg-white group-hover:shadow-sm"}`}>
            {item.image?.url || item.image ? (
              <img src={item.image?.url || item.image} alt="" className="w-full h-full object-cover rounded-lg" />
            ) : type === "header" ? (
              <FolderOpen className={`w-4 h-4 ${iconColor}`} />
            ) : type === "category" ? (
              <Folder className={`w-4 h-4 ${iconColor}`} />
            ) : (
              <Tag className={`w-4 h-4 ${iconColor}`} />
            )}
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="font-semibold text-sm truncate">{item.name}</span>
            <span className="text-[10px] uppercase tracking-wider opacity-60 truncate">{item.slug}</span>
          </div>
        </div>

        {hasChildren && (
          <ChevronRight className={`w-4 h-4 ${isSelected ? "text-primary" : "text-slate-300"}`} />
        )}
      </motion.div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-140px)] flex-col gap-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Category Hierarchy Explorer
          </span>
        }
        description={`Visual overview of your catalog structure — ${stats.total} items across all levels.`}
        actions={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Headers: <b className="text-slate-900">{stats.headers}</b>
            </div>
            <div className="h-4 w-px bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-info" />
              Level 2: <b className="text-slate-900">{stats.l2}</b>
            </div>
            <div className="h-4 w-px bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-success" />
              Subcategories: <b className="text-slate-900">{stats.subs}</b>
            </div>
          </div>
        }
        className="mb-0 shrink-0"
      />

      {/* Miller Columns View */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-3 md:grid-rows-[minmax(0,1fr)] gap-4 overflow-hidden">
        {/* Column 1: Headers */}
        <div className={`${mobileColumn === "headers" ? "flex" : "hidden"} md:flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.12)]`}>
          <ColumnHeader title="Header Categories" icon={LayoutGrid} count={filteredHeaders.length} accentClass="border-l-primary" />

          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search category"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div
            className="flex-1 min-h-0 overflow-y-auto py-2 custom-scrollbar overscroll-contain touch-pan-y"
            tabIndex={0}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            {isLoading ? (
              <div className="p-8 text-center text-slate-400 text-sm">Loading structure...</div>
            ) : filteredHeaders.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">No headers found</div>
            ) : (
              filteredHeaders.map((header) => (
                <ListItem
                  key={header._id || header.id}
                  item={header}
                  type="header"
                  isSelected={selectedHeader && (selectedHeader._id || selectedHeader.id) === (header._id || header.id)}
                  onClick={() => handleHeaderSelect(header)}
                  hasChildren={header.children && header.children.length > 0}
                />
              ))
            )}
          </div>
        </div>

        {/* Column 2: Level 2 */}
        <div className={`${mobileColumn === "level2" ? "flex" : "hidden"} md:flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.12)] transition-all duration-300`}>
          <button
            type="button"
            onClick={handleMobileBack}
            className="flex items-center gap-1.5 border-b border-slate-100 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 hover:text-primary md:hidden"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="truncate">{selectedHeader?.name || "Back"}</span>
          </button>
          <ColumnHeader title="Level 2 Categories" icon={Folder} count={activeLevel2.length} accentClass="border-l-info" />

          {!selectedHeader ? (
            <div className="flex flex-1 flex-col items-center justify-center bg-slate-50/50 p-8 text-center text-slate-400">
              <ArrowRight className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm">Select a Header Category<br />to view its contents</p>
            </div>
          ) : (
            <div
              className="flex-1 min-h-0 overflow-y-auto py-2 custom-scrollbar overscroll-contain touch-pan-y"
              tabIndex={0}
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              {activeLevel2.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  No Level 2 categories in <br />
                  <span className="font-bold text-slate-600">"{selectedHeader.name}"</span>
                </div>
              ) : (
                activeLevel2.map((l2) => (
                  <ListItem
                    key={l2._id || l2.id}
                    item={l2}
                    type="category"
                    isSelected={selectedLevel2 && (selectedLevel2._id || selectedLevel2.id) === (l2._id || l2.id)}
                    onClick={() => handleLevel2Select(l2)}
                    hasChildren={l2.children && l2.children.length > 0}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Column 3: Subcategories */}
        <div className={`${mobileColumn === "subs" ? "flex" : "hidden"} md:flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.12)]`}>
          <button
            type="button"
            onClick={handleMobileBack}
            className="flex items-center gap-1.5 border-b border-slate-100 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 hover:text-primary md:hidden"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="truncate">{selectedLevel2?.name || "Back"}</span>
          </button>
          <ColumnHeader title="Subcategories" icon={Tag} count={activeSubs.length} accentClass="border-l-success" />

          {!selectedLevel2 ? (
            <div className="flex flex-1 flex-col items-center justify-center bg-slate-50/50 p-8 text-center text-slate-400">
              <ArrowRight className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm">Select a Level 2 Category<br />to view subcategories</p>
            </div>
          ) : (
            <div
              className="flex-1 min-h-0 overflow-y-auto py-2 custom-scrollbar overscroll-contain touch-pan-y"
              tabIndex={0}
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              {activeSubs.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  No subcategories in <br />
                  <span className="font-bold text-slate-600">"{selectedLevel2.name}"</span>
                </div>
              ) : (
                activeSubs.map((sub) => (
                  <ListItem
                    key={sub._id || sub.id}
                    item={sub}
                    type="subcategory"
                    isSelected={false}
                    onClick={() => { }}
                    hasChildren={false}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CategoryHierarchy;
