import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";
import { cn } from "@/lib/utils";
import { HiChevronDown } from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronsLeft, ChevronsRight, X } from "lucide-react";

const SidebarItem = ({
  item,
  isOpen,
  onToggle,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  collapsed,
}) => {
  const location = useLocation();
  const badgeCount = Number(item?.badgeCount || 0);
  const badgeLabel = badgeCount > 99 ? "99+" : String(badgeCount);

  const hasChildren = item.children && item.children.length > 0;
  const isChildActive =
    hasChildren &&
    item.children.some((child) => location.pathname === child.path);

  if (hasChildren) {
    return (
      <div className="relative space-y-1" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        <button
          onClick={collapsed ? undefined : onToggle}
          className={cn(
            "w-full flex items-center justify-between rounded-lg px-2.5 py-2 transition-all duration-300 group relative overflow-hidden",
            collapsed && "justify-center px-0",
            isChildActive
              ? "bg-primary/15 text-primary"
              : isOpen
                ? "bg-white/10 text-white ring-1 ring-white/10"
                : "text-gray-400 hover:text-white",
          )}>
          <AnimatePresence>
            {isHovered && !collapsed && (
              <motion.div
                layoutId="hover-highlight"
                className="absolute inset-0 bg-white/5 rounded-lg -z-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </AnimatePresence>

          <div className={cn("flex items-center z-10", collapsed ? "justify-center" : "space-x-2")}>
            <div
              className={cn(
                "p-1.5 rounded-lg transition-all duration-500",
                isChildActive
                  ? "bg-primary/20 text-primary"
                  : isOpen
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/20 shadow-lg"
                    : "bg-white/5 text-gray-500 group-hover:bg-white/10 group-hover:text-gray-300",
              )}>
              {item.icon && <item.icon className="h-4 w-4" />}
            </div>
            {!collapsed && (
              <span className={cn("text-xs tracking-tight transition-all duration-300", isChildActive || isOpen ? "font-bold" : "font-semibold")}>
                {item.label}
              </span>
            )}
          </div>
          {badgeCount > 0 && (
            <span className={cn(
              "pointer-events-none absolute h-5 min-w-5 rounded-full bg-danger px-1.5 flex items-center justify-center text-[10px] font-black text-white ring-2 ring-[#0a0c10] z-10",
              collapsed ? "top-0.5 right-1" : "top-2 right-8"
            )}>
              {collapsed ? '' : badgeLabel}
            </span>
          )}
          {!collapsed && (
            <div className={cn("transition-all duration-300 z-10", isOpen ? "rotate-180 text-primary" : "rotate-0 text-gray-600 group-hover:text-gray-400")}>
              <HiChevronDown className="h-4 w-4" />
            </div>
          )}
        </button>

        {/* Expanded mode: inline nested list */}
        {!collapsed && isOpen && (
          <div className="pl-9 pr-3 py-1 space-y-1 animate-in slide-in-from-top-2 fade-in duration-500">
            {item.children.map((child) => (
              <ChildLink key={child.path} child={child} />
            ))}
          </div>
        )}

        {/* Collapsed mode: hover flyout with the group's children */}
        {collapsed && isHovered && (
          <div className="absolute left-full top-0 ml-2 w-56 rounded-lg border border-white/10 bg-[#0a0c10] p-2 shadow-2xl z-50">
            <p className="px-2 pb-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-gray-500">{item.label}</p>
            <div className="space-y-1">
              {item.children.map((child) => (
                <ChildLink key={child.path} child={child} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <NavLink
        to={item.path}
        end={item.end !== undefined ? item.end : false}
        className={({ isActive }) =>
          cn(
            "flex items-center rounded-lg px-2.5 py-2 transition-all duration-300 group relative overflow-hidden",
            collapsed ? "justify-center px-0" : "space-x-2",
            isActive ? "bg-primary/15 text-primary" : "text-gray-400 hover:text-white",
          )
        }>
        {({ isActive }) => (
          <>
            <AnimatePresence>
              {isHovered && !isActive && !collapsed && (
                <motion.div
                  layoutId="hover-highlight"
                  className="absolute inset-0 bg-white/5 rounded-lg -z-10"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </AnimatePresence>

            <div
              className={cn(
                "p-1.5 rounded-lg transition-all duration-500 z-10",
                isActive ? "bg-primary/20 text-primary" : "bg-white/5 text-gray-500 group-hover:bg-white/10 group-hover:text-gray-300",
              )}>
              {item.icon && <item.icon className="h-4 w-4" />}
            </div>
            {!collapsed && (
              <span className={cn("text-xs tracking-tight transition-all duration-300 z-10", isActive ? "font-bold" : "font-semibold")}>
                {item.label}
              </span>
            )}
            {badgeCount > 0 && (
              <span className={cn(
                "pointer-events-none absolute h-5 min-w-5 rounded-full bg-danger px-1.5 flex items-center justify-center text-[10px] font-black text-white ring-2 ring-[#0a0c10] z-10",
                collapsed ? "top-0.5 right-1" : "top-2 right-3"
              )}>
                {collapsed ? '' : badgeLabel}
              </span>
            )}
          </>
        )}
      </NavLink>

      {/* Collapsed mode: hover tooltip */}
      {collapsed && isHovered && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 whitespace-nowrap rounded-md border border-white/10 bg-[#0a0c10] px-2.5 py-1.5 text-xs font-semibold text-white shadow-2xl z-50">
          {item.label}
        </div>
      )}
    </div>
  );
};

const ChildLink = ({ child }) => {
  const childBadgeCount = Number(child?.badgeCount || 0);
  const childBadgeLabel = childBadgeCount > 99 ? "99+" : String(childBadgeCount);
  const showChildBadge = childBadgeCount > 0;

  return (
    <NavLink
      to={child.path}
      end={child.end !== undefined ? child.end : false}
      className={({ isActive }) =>
        cn(
          "block text-xs py-1.5 px-2.5 rounded-lg transition-all duration-300 relative",
          isActive ? "bg-primary/15 text-primary font-bold" : "text-gray-500 hover:text-gray-300 hover:bg-white/5",
          showChildBadge && "pr-9",
        )
      }>
      {child.label}
      {showChildBadge && (
        <span className="pointer-events-none absolute top-1 right-2 min-w-5 h-5 px-1.5 rounded-full bg-danger text-white text-[10px] font-black flex items-center justify-center ring-2 ring-[#0a0c10]">
          {childBadgeLabel}
        </span>
      )}
    </NavLink>
  );
};

/** Groups a flat nav-items array by `item.group`, preserving first-seen order. Items without a group fall into one implicit bucket. */
function groupNavItems(items) {
  const order = [];
  const map = new Map();
  items.forEach((item) => {
    const key = item.group || "";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key).push(item);
  });
  return order.map((key) => ({ label: key, items: map.get(key) }));
}

const SidebarContent = ({ items, title, onClose, openMenu, handleToggle, hoveredIdx, setHoveredIdx, collapsed, onToggleCollapse }) => {
  const { settings } = useSettings();
  const { role } = useAuth();
  const appName = settings?.appName || 'App';

  const homePath = role === 'admin' ? '/admin' : (role === 'seller' ? '/seller' : '/');
  const groups = groupNavItems(items);
  let runningIdx = -1;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className={cn("flex-shrink-0 flex h-16 items-center border-b border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent z-10", collapsed ? "justify-center px-2" : "justify-between px-5")}>
        <NavLink to={homePath} className="flex items-center space-x-2.5 hover:opacity-90 transition-opacity min-w-0">
          {settings?.logoUrl ? (
            <div className="h-9 w-9 shrink-0 rounded-xl overflow-hidden shadow-sm ring-1 ring-white/10 transition-all duration-500 ease-out">
              <img src={settings.logoUrl} alt={appName} className="h-full w-full object-contain" />
            </div>
          ) : (
            <div className="h-9 w-9 shrink-0 rounded-xl bg-primary flex items-center justify-center text-white shadow-sm transition-all duration-500 ease-out">
              <span className="text-lg font-black italic">{appName.charAt(0)}</span>
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-base font-black tracking-tight text-white leading-none truncate">{appName}</h1>
              <span className="text-[9px] font-black text-primary uppercase tracking-[0.2em] mt-1 block truncate">{title}</span>
            </div>
          )}
        </NavLink>

        {/* Desktop collapse toggle */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden md:flex p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        )}

        {/* Mobile close button */}
        <button onClick={onClose} className="p-2 md:hidden text-gray-500 hover:text-white transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav
        data-lenis-prevent
        onMouseLeave={() => setHoveredIdx(null)}
        className="mt-3 px-3 space-y-3 flex-1 overflow-y-auto overscroll-contain custom-scrollbar-dark min-h-0 pb-6 relative z-20"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {groups.map((group) => (
          <div key={group.label || 'general'} className="space-y-1">
            {group.label && !collapsed && (
              <p className="px-2.5 text-[9px] font-black text-gray-600 uppercase tracking-[0.3em] mb-1.5">{group.label}</p>
            )}
            <AnimatePresence>
              {group.items.map((item) => {
                runningIdx += 1;
                const idx = runningIdx;
                return (
                  <SidebarItem
                    key={idx}
                    item={item}
                    isOpen={openMenu === item.label}
                    onToggle={() => handleToggle(item.label)}
                    isHovered={hoveredIdx === idx}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => { }}
                    collapsed={collapsed}
                  />
                );
              })}
            </AnimatePresence>
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="p-4 border-t border-white/5 bg-gradient-to-t from-white/[0.02] to-transparent flex-shrink-0">
          <div className="bg-white/5 rounded-lg p-3 border border-white/5">
            <div className="flex items-center space-x-2.5">
              <div className="relative">
                {settings?.logoUrl ? (
                  <div className="h-8 w-8 rounded-lg overflow-hidden border border-white/10">
                    <img src={settings.logoUrl} alt={appName} className="h-full w-full object-contain" />
                  </div>
                ) : (
                  <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-white font-black text-xs">
                    {appName.charAt(0)}
                  </div>
                )}
                <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 bg-success rounded-full border-2 border-[#0a0c10]"></div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  {title?.toLowerCase().includes('seller') ? 'Seller Console' : 'Admin Console'}
                </p>
                <p className="text-[9px] text-gray-500 truncate font-black uppercase tracking-widest">
                  {title?.toLowerCase().includes('seller') ? 'Seller' : 'Super Admin'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Sidebar = ({ items, title, isOpen, onClose, collapsed = false, onToggleCollapse }) => {
  const { role } = useAuth();
  const [openMenu, setOpenMenu] = useState(null);
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const handleToggle = (label) => {
    setOpenMenu((prev) => (prev === label ? null : label));
  };

  const commonProps = {
    items,
    title,
    onClose,
    openMenu,
    handleToggle,
    hoveredIdx,
    setHoveredIdx,
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className={cn(
        "fixed left-0 inset-y-0 bg-[#0a0c10] text-gray-400 border-r border-white/5 shadow-[20px_0_60px_rgba(0,0,0,0.4)] md:flex flex-col z-50 transition-all duration-300",
        collapsed ? "w-20" : "w-64",
        (role === "admin" || role === "seller") ? "hidden md:flex" : "flex",
      )}>
        <SidebarContent {...commonProps} collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
      </aside>

      {/* Mobile Sidebar (Drawer) — always full width, collapse is a desktop-only concept */}
      <AnimatePresence mode="wait">
        {isOpen && (
          <div className="fixed inset-0 z-[100] md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
            />

            <div className="absolute left-0 inset-y-0 w-64 flex flex-col pointer-events-none">
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
                className="flex-1 bg-[#0a0c10] shadow-2xl flex flex-col pointer-events-auto min-h-0"
              >
                <SidebarContent {...commonProps} collapsed={false} />
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;
