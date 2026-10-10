import { Link, useLocation } from 'react-router-dom';
import { Home, LayoutGrid, Search, ShoppingBag, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
    { label: 'Home', icon: Home, path: '/' },
    { label: 'Categories', icon: LayoutGrid, path: '/categories' },
    { label: 'Search', icon: Search, path: '/search' },
    { label: 'Orders', icon: ShoppingBag, path: '/orders' },
    { label: 'Profile', icon: User, path: '/profile' },
];

const BottomNav = () => {
    const location = useLocation();

    return (
        <nav
            aria-label="Main"
            className="fixed bottom-0 left-0 right-0 z-[500] flex h-16 items-stretch justify-around border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.04)] md:hidden"
        >
            {navItems.map((item) => {
                const isActive = location.pathname === item.path ||
                    (item.path !== '/' && location.pathname.startsWith(item.path));

                return (
                    <Link
                        key={item.path}
                        to={item.path}
                        aria-current={isActive ? 'page' : undefined}
                        className="relative flex flex-1 flex-col items-center justify-center gap-0.5 focus-visible:outline-2 focus-visible:outline-primary"
                    >
                        {isActive && (
                            <span className="absolute top-0 h-[3px] w-8 rounded-b-full bg-primary" aria-hidden="true" />
                        )}
                        <item.icon
                            size={22}
                            strokeWidth={isActive ? 2.4 : 1.9}
                            className={cn('transition-colors', isActive ? 'text-primary' : 'text-slate-500')}
                            aria-hidden="true"
                        />
                        <span
                            className={cn(
                                'text-[11px] leading-none transition-colors',
                                isActive ? 'font-semibold text-primary' : 'font-medium text-slate-500'
                            )}
                        >
                            {item.label}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
};

export default BottomNav;
