import { NavLink } from "react-router-dom";
import { LogOut, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";

/**
 * The whole screen for a staff member whose only access is POS: a slim header
 * (shop, the POS pages they may open, their account, sign out) and the POS
 * itself. No sidebar, no other panel.
 */
const StaffPosShell = ({ portal, tabs = [], children }) => {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const staff = user?.staff;
  const appName = settings?.appName || "App";
  const logoUrl = settings?.logoUrl || "";

  return (
    <div className="relative min-h-screen bg-slate-50">
      <header className="fixed inset-x-0 top-0 z-[200] flex h-14 items-center gap-3 border-b border-gray-100 bg-white/90 px-3 backdrop-blur md:h-16 md:px-6">
        <div className="flex min-w-0 shrink-0 items-center gap-2.5">
          {logoUrl ? (
            <img src={logoUrl} alt={appName} className="h-8 w-8 rounded-lg object-contain" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-black text-white">{appName.charAt(0)}</div>
          )}
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-bold leading-tight text-slate-900">{staff?.ownerName || user?.shopName || appName}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Counter Billing</p>
          </div>
        </div>

        {/* a single page needs no tabs */}
        <nav aria-label="POS pages" className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.length > 1 && tabs.map((t) => (
            <NavLink
              key={t.path}
              to={t.path}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors md:text-sm",
                  isActive ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          <NavLink
            to={`/${portal}/my-account`}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-600 hover:bg-slate-100"
            title="My account"
          >
            <UserCircle size={20} className="text-slate-400" />
            <span className="hidden text-left md:block">
              <span className="block text-xs font-bold leading-tight text-slate-800">{staff?.name || user?.name}</span>
              {staff?.jobTitle && <span className="block text-[10px] text-slate-400">{staff.jobTitle}</span>}
            </span>
          </NavLink>
          <button
            type="button"
            onClick={() => logout()}
            aria-label="Sign out"
            title="Sign out"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="p-4 pt-[72px] md:p-6 md:pt-[88px]">{children}</main>
    </div>
  );
};

export default StaffPosShell;
