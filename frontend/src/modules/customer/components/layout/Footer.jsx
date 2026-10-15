import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Truck } from 'lucide-react';
import Logo from '@/assets/atoz-logo.webp';
import { useSettings } from '@core/context/SettingsContext';
import { customerApi } from '../../services/customerApi';
import { useLocation as useDeliveryLocation } from '../../context/LocationContext';

const QUICK_LINKS = [
    { label: 'Home', to: '/' },
    { label: 'Explore categories', to: '/categories' },
    { label: 'My bag', to: '/checkout' },
    { label: 'Orders', to: '/orders' },
];

// Shown names; each opens the matching category from the live catalogue
const FOOTER_CATEGORIES = ['Fruits & Vegetables', 'Masala & Spices', 'Cookware', 'Flowers'];

const norm = (s) => String(s || '').trim().toLowerCase();

/** Find a category (level 2) or sub-category by name: exact match first, then "starts with". */
function findCategory(tree, label) {
    const cats = [];
    const subs = [];
    for (const header of tree) {
        for (const cat of header.children || []) {
            cats.push(cat);
            for (const sub of cat.children || []) subs.push({ ...sub, openUnder: cat._id });
        }
    }
    const want = norm(label);
    return (
        cats.find((c) => norm(c.name) === want) ||
        subs.find((c) => norm(c.name) === want) ||
        cats.find((c) => norm(c.name).startsWith(want)) ||
        subs.find((c) => norm(c.name).startsWith(want)) ||
        null
    );
}

const Footer = () => {
    const navigate = useNavigate();
    const { settings } = useSettings();
    const { currentLocation } = useDeliveryLocation();
    const logoUrl = settings?.logoUrl || Logo;

    const { data: tree = [] } = useQuery({
        queryKey: ['customer', 'categoriesTree', 'footer'],
        queryFn: async () => {
            const res = await customerApi.getCategories({ tree: true });
            return res.data.results || res.data.result || [];
        },
        staleTime: 5 * 60 * 1000,
    });

    const openCategory = (label) => {
        const match = findCategory(Array.isArray(tree) ? tree : [], label);
        if (!match) return navigate('/categories');
        if (match.openUnder) {
            // sub-category: open its category with that tab selected
            return navigate(`/category/${match.openUnder}`, { state: { activeSubcategoryId: match._id } });
        }
        return navigate(`/category/${match._id}`);
    };

    const address = currentLocation?.name || currentLocation?.address || '';
    const [area, ...rest] = address.split(',').map((s) => s.trim()).filter(Boolean);
    const city = currentLocation?.city || rest[0] || '';
    const eta = String(currentLocation?.time || '15-20 mins').replace(/\s*mins?$/i, '').replace('-', '–');

    return (
        <footer className="relative mt-16 w-full bg-[radial-gradient(120%_140%_at_100%_0%,#2a5a40_0%,#1b4231_38%,#14382a_70%,#12352a_100%)] text-[#e9f1e4] lg:mt-24">
            <div className="mx-auto max-w-[1350px] px-8 py-14 lg:px-14">
                {/* Brand + tagline */}
                <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                    <Link to="/" className="flex items-center gap-4" aria-label="A to Z Grocery home">
                        <img
                            src={logoUrl}
                            alt=""
                            loading="lazy"
                            className="h-14 w-14 shrink-0 rounded-full border border-white/20 bg-[#fbfaf6] object-cover shadow-[0_2px_8px_rgba(11,58,34,0.25)]"
                        />
                        <span className="font-['Manrope'] font-extrabold leading-none tracking-[-1.5px] text-[#d9f2a6]">
                            <span className="text-[44px]">A</span>
                            <span className="mx-1 text-[22px] font-semibold tracking-normal">to</span>
                            <span className="text-[44px]">Z</span>
                            <span className="ml-2 text-[30px] font-semibold tracking-[-1px]">Grocery</span>
                        </span>
                    </Link>
                    <p className="font-['Manrope'] text-[26px] font-medium leading-snug tracking-[-0.8px] md:text-right">
                        <span className="text-white">Your everyday essentials,</span>
                        <br />
                        <span className="text-[#a9c4a3]">delivered to your door.</span>
                    </p>
                </div>

                <div className="my-10 h-px bg-white/10" />

                {/* Links + delivery card */}
                <div className="grid grid-cols-1 gap-10 md:grid-cols-[1fr_1fr_1.3fr]">
                    <nav aria-label="Quick links">
                        <p className="mb-5 text-[11px] font-bold uppercase tracking-[2px] text-[#8fae8c]">Quick links</p>
                        <ul className="space-y-4">
                            {QUICK_LINKS.map((l) => (
                                <li key={l.label}>
                                    <Link to={l.to} className="text-[15px] text-[#e9f1e4] transition-colors hover:text-[#d9f2a6]">{l.label}</Link>
                                </li>
                            ))}
                        </ul>
                    </nav>

                    <nav aria-label="Categories">
                        <p className="mb-5 text-[11px] font-bold uppercase tracking-[2px] text-[#8fae8c]">Categories</p>
                        <ul className="space-y-4">
                            {FOOTER_CATEGORIES.map((label) => (
                                <li key={label}>
                                    <button
                                        type="button"
                                        onClick={() => openCategory(label)}
                                        className="text-left text-[15px] text-[#e9f1e4] transition-colors hover:text-[#d9f2a6]"
                                    >
                                        {label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </nav>

                    <div className="self-start rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                        <p className="mb-4 text-[11px] font-bold uppercase tracking-[2px] text-[#8fae8c]">Delivery information</p>
                        <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-[#d9f2a6]">
                                <MapPin size={18} />
                            </span>
                            <p className="pt-0.5 text-[15px] font-semibold leading-relaxed text-white">
                                {area ? (
                                    <>
                                        {area},
                                        {city && <><br />{city}</>}
                                    </>
                                ) : (
                                    'Set your delivery location'
                                )}
                            </p>
                        </div>
                        <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#d9f2a6] px-4 py-2 text-[13px] font-semibold text-[#173a2a]">
                            <Truck size={16} />
                            {eta} minute delivery
                        </span>
                    </div>
                </div>

                <div className="mb-6 mt-10 h-px bg-white/10" />

                <p className="text-[13px] text-[#8fae8c]">
                    &copy; {new Date().getFullYear()} {settings?.appName || 'A to Z Grocery'}. All rights reserved.
                </p>
            </div>
        </footer>
    );
};

export default Footer;
