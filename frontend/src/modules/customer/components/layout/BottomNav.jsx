import { Link, useLocation } from 'react-router-dom';
import AtzIcon from '../atz/AtzIcon';
import ProfileAvatar from '../shared/ProfileAvatar';
import '../atz/atz.css';

const navItems = [
    { label: 'Home', icon: 'home', path: '/' },
    { label: 'Categories', icon: 'grid', path: '/categories' },
    { label: 'Search', icon: 'search', path: '/search' },
    { label: 'Orders', icon: 'bag', path: '/orders' },
    { label: 'Profile', icon: 'user', path: '/profile' },
];

const BottomNav = () => {
    const location = useLocation();

    return (
        <nav aria-label="Main navigation" className="atz bottom-nav md:hidden">
            {navItems.map((item) => {
                const isActive = location.pathname === item.path ||
                    (item.path !== '/' && location.pathname.startsWith(item.path));

                return (
                    <Link
                        key={item.path}
                        to={item.path}
                        aria-current={isActive ? 'page' : undefined}
                        className={isActive ? 'active' : undefined}
                    >
                        {item.path === '/profile' ? (
                            <ProfileAvatar
                                size={22}
                                className={isActive ? 'ring-2 ring-[var(--primary)]' : 'ring-1 ring-slate-300'}
                                fallback={<AtzIcon name={item.icon} size={21} />}
                            />
                        ) : (
                            <AtzIcon name={item.icon} size={21} />
                        )}
                        <span>{item.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
};

export default BottomNav;
