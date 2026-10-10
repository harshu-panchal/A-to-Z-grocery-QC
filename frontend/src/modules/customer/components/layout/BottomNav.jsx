import { Link, useLocation } from 'react-router-dom';
import AtzIcon from '../atz/AtzIcon';
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
                        <AtzIcon name={item.icon} size={21} />
                        <span>{item.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
};

export default BottomNav;
