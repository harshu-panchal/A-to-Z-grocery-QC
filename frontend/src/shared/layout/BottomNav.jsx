import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    ClipboardList,
    Box,
    Wallet
} from 'lucide-react';

import { useAuth } from '@core/context/AuthContext';
import { useStaffAccess } from '@/modules/staff/staffAccess';

const BottomNav = ({ navItems }) => {
    const { role } = useAuth();
    const location = useLocation();
    const { canOpen } = useStaffAccess();

    // Define the primary bottom nav items based on user role
    const primaryItems = role === 'admin' ? [
        { label: 'Dashboard', path: '/admin', icon: LayoutDashboard, end: true },
        { label: 'Orders', path: '/admin/orders/all', icon: ClipboardList },
        { label: 'Products', path: '/admin/products', icon: Box },
        { label: 'Wallet', path: '/admin/wallet', icon: Wallet },
    ] : [
        { label: 'Dashboard', path: '/seller', icon: LayoutDashboard, end: true },
        { label: 'Orders', path: '/seller/orders', icon: ClipboardList },
        { label: 'Products', path: '/seller/products', icon: Box },
        { label: 'Earnings', path: '/seller/earnings', icon: Wallet },
    ];

    // Staff only get the shortcuts they are allowed to open.
    const shortcuts = primaryItems.filter((item) => canOpen(item.path));
    if (shortcuts.length === 0) return null;

    return (
        <div data-bottom-nav className="fixed bottom-0 left-0 right-0 h-16 bg-slate-900 border-t border-white/5 z-[60] md:hidden px-2 flex items-center justify-around shadow-[0_-10px_30px_rgba(0,0,0,0.3)]">
            {shortcuts.map((item) => (
                <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.end}
                    className={({ isActive }) => cn(
                        "flex flex-col items-center justify-center space-y-1 w-16 py-1.5 transition-all duration-300",
                        isActive ? "text-primary" : "text-slate-500 hover:text-slate-300"
                    )}
                >
                    <item.icon className="h-5 w-5" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">{item.label}</span>
                </NavLink>
            ))}
        </div>
    );
};

export default BottomNav;

