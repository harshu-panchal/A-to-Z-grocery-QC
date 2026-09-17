import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Segment -> readable label overrides, covering admin + seller route
 * vocabulary (see modules/admin/routes/index.jsx and
 * modules/seller/routes/index.jsx). Falls back to title-casing the raw
 * segment when a path isn't listed, so new routes still get a sane crumb.
 */
const LABEL_OVERRIDES = {
    admin: 'Admin',
    seller: 'Seller',
    categories: 'Categories',
    header: 'Header Categories',
    level2: 'Main Categories',
    sub: 'Sub-Categories',
    hierarchy: 'All Categories',
    products: 'Products',
    add: 'Add Product',
    sellers: 'Sellers',
    active: 'Active',
    pending: 'Pending',
    'seller-locations': 'Seller Locations',
    'delivery-boys': 'Delivery Drivers',
    tracking: 'Tracking',
    'delivery-funds': 'Delivery Funds',
    wallet: 'Wallet',
    withdrawals: 'Withdrawal Requests',
    'seller-transactions': 'Seller Payments',
    'cash-collection': 'Cash Collection',
    customers: 'Customers',
    faqs: 'FAQs',
    'legal-pages': 'Legal Pages',
    orders: 'Orders',
    all: 'All',
    view: 'Order Details',
    returns: 'Returns',
    billing: 'Fees & Charges',
    settings: 'Settings',
    env: 'System Settings',
    profile: 'Profile',
    'support-tickets': 'Support Tickets',
    moderation: 'Review Moderation',
    'experience-studio': 'Experience Studio',
    'hero-categories': 'Hero & Categories',
    notifications: 'Notifications',
    offers: 'Offers',
    'offer-sections': 'Offer Sections',
    'shop-by-store': 'Shop by Store',
    coupons: 'Coupons',
    inventory: 'Stock',
    analytics: 'Sales Reports',
    transactions: 'Payment History',
    earnings: 'Earnings',
    support: 'Support',
    about: 'About',
    terms: 'Terms',
    privacy: 'Privacy',
};

function isLikelyId(segment) {
    if (/^[0-9a-fA-F]{12,}$/.test(segment)) return true;
    if (/^\d+$/.test(segment) && segment.length > 3) return true;
    return false;
}

function formatSegment(segment) {
    if (LABEL_OVERRIDES[segment]) return LABEL_OVERRIDES[segment];
    if (isLikelyId(segment)) return 'Details';
    return segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Breadcrumb
 *
 * Auto-generates a trail from the current route path so every page gets
 * one above its PageHeader title without per-page wiring. Pass explicit
 * `items` ([{ label, path? }]) only when a page's path segments don't read
 * well automatically.
 */
const Breadcrumb = ({ items, className }) => {
    const location = useLocation();

    const trail =
        items ||
        (() => {
            const segments = location.pathname.split('/').filter(Boolean);
            let acc = '';
            return segments.map((segment) => {
                acc += `/${segment}`;
                return { label: formatSegment(segment), path: acc };
            });
        })();

    if (!trail.length) return null;

    return (
        <nav
            aria-label="Breadcrumb"
            className={cn('flex items-center gap-1.5 text-xs font-medium text-slate-500', className)}
        >
            <Link to="/" className="flex items-center hover:text-slate-700 transition-colors">
                <Home className="h-3.5 w-3.5" />
            </Link>
            {trail.map((crumb, idx) => {
                const isLast = idx === trail.length - 1;
                return (
                    <React.Fragment key={crumb.path || idx}>
                        <ChevronRight className="h-3 w-3 text-slate-300" />
                        {isLast || !crumb.path ? (
                            <span className={cn(isLast && 'text-slate-700 font-semibold')}>{crumb.label}</span>
                        ) : (
                            <Link to={crumb.path} className="hover:text-slate-700 transition-colors">
                                {crumb.label}
                            </Link>
                        )}
                    </React.Fragment>
                );
            })}
        </nav>
    );
};

export default Breadcrumb;
