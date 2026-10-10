import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    User, MapPin, Package, CreditCard, Wallet, ChevronRight,
    LogOut, ShieldCheck, Heart, HelpCircle, Info, Edit2, ChevronLeft, Bell
} from 'lucide-react';
import { useAuth } from '@core/context/AuthContext';
import { useSettings } from '@core/context/SettingsContext';

const ProfilePage = () => {
    const navigate = useNavigate();
    const { user, role, logout } = useAuth();
    const { settings } = useSettings();
    const appName = settings?.appName || 'App';
    const [showLogoutModal, setShowLogoutModal] = React.useState(false);

    const formatIndiaPhone = (value) => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        if (raw.startsWith('+91')) return raw.replace(/^\+91[\s-]*/, '');
        if (raw.startsWith('91') && raw.length >= 12) return raw.replace(/^91[\s-]*/, '');
        return raw;
    };


    return (
        <>
            <div className="min-h-screen bg-slate-50 pb-20 font-['Outfit',_sans-serif]">
            <div className="sticky top-0 z-30 atz-page-header px-4 pt-4 pb-3 mb-4 flex items-center gap-2">
                <button
                    onClick={() => navigate(-1)}
                    className="w-10 h-10 flex items-center justify-center hover:bg-slate-200/70 rounded-full transition-colors -ml-1"
                >
                    <ChevronLeft size={22} className="text-slate-800" />
                </button>
                <h1 className="text-xl font-semibold text-slate-900 tracking-tight">My Profile</h1>
                <div className="ml-auto flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => navigate('/notifications')}
                        title="View notifications"
                        className="w-10 h-10 flex items-center justify-center rounded-full transition-colors border border-slate-200 bg-white hover:bg-slate-100"
                    >
                        <Bell size={18} className="text-slate-700" />
                    </button>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 pt-1 relative z-20 space-y-4">

                {/* User Identity Card */}
                <div className="bg-white rounded-xl p-4 border border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-14 w-14 rounded-xl bg-slate-100 flex items-center justify-center p-1 border border-slate-200">
                            <div className="h-full w-full rounded-lg bg-white flex items-center justify-center overflow-hidden">
                                <User size={28} className="text-slate-700" />
                            </div>
                        </div>
                        <div>
                            <h2 className="text-base leading-tight font-semibold text-slate-900">{user?.name || 'Customer'}</h2>
                            <p className="text-slate-500 text-xs font-medium flex items-center gap-1 mt-0.5">
                                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] uppercase">India</span> +91 {formatIndiaPhone(user?.phone)}
                            </p>
                        </div>
                    </div>
                    <Link to="/profile/edit" className="p-2.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">
                        <Edit2 size={16} />
                    </Link>
                </div>

                {/* Menu Sections */}
                <div className="space-y-4">
                    {/* Account Section */}
                    <div className="bg-white rounded-xl overflow-hidden border border-slate-200">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Personal Account</p>
                        </div>
                        <div className="divide-y divide-slate-100">
                            <MenuItem
                                icon={Package}
                                label="Your Orders"
                                sub="Track, return or buy things again"
                                path="/orders"
                                color="var(--primary)"
                                bg="rgba(16,185,129,0.10)"
                            />
                            <MenuItem
                                icon={CreditCard}
                                label="Order Transactions"
                                sub="View all payments & refunds"
                                path="/transactions"
                                color="#f97316"
                                bg="rgba(249,115,22,0.10)"
                            />
                            <MenuItem
                                icon={Wallet}
                                label="Wallet"
                                sub="Balance & return refunds"
                                path="/wallet"
                                color="#10b981"
                                bg="rgba(16,185,129,0.10)"
                            />
                            <MenuItem
                                icon={Heart}
                                label="Your Wishlist"
                                sub="Your saved items"
                                path="/wishlist"
                                color="#fb7185"
                                bg="rgba(248,113,113,0.08)"
                            />
                            <MenuItem
                                icon={MapPin}
                                label="Saved Addresses"
                                sub="Manage your delivery locations"
                                path="/addresses"
                                color="var(--primary)"
                                bg="rgba(56,189,248,0.10)"
                            />
                        </div>
                    </div>

                    {/* Support Section */}
                    <div className="bg-white rounded-xl overflow-hidden border border-slate-200">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Help & Settings</p>
                        </div>
                        <div className="divide-y divide-slate-100">
                            <MenuItem
                                icon={Bell}
                                label="Notifications"
                                sub="Order updates & offers"
                                path="/notifications"
                            />
                            <MenuItem
                                icon={HelpCircle}
                                label="Help & Support"
                                path="/support"
                                color="#3b82f6"
                                bg="rgba(59,130,246,0.08)"
                            />
                            <MenuItem
                                icon={ShieldCheck}
                                label="Privacy Policy"
                                path="/privacy"
                                color="#a855f7"
                                bg="rgba(168,85,247,0.08)"
                            />
                            <MenuItem
                                icon={Info}
                                label="About Us"
                                path="/about"
                                color="#14b8a6"
                                bg="rgba(45,212,191,0.08)"
                            />
                        </div>
                    </div>
                </div>

                {/* Logout Button */}
                <button
                    onClick={() => setShowLogoutModal(true)}
                    className="w-full py-3 rounded-lg border border-slate-300 text-slate-700 font-semibold bg-white hover:bg-slate-100 transition-colors flex items-center justify-center gap-2 mt-2"
                >
                    <LogOut size={20} />
                    Sign out
                </button>

                <div className="text-center pb-8">
                    <p className="text-[10px] text-slate-400 font-medium">Version 2.4.0 - {appName}</p>
                </div>

            </div>
        </div>

        {/* Logout Confirmation Modal */}
        {showLogoutModal && (
            <div
                className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 p-4"
                onClick={() => setShowLogoutModal(false)}
            >
                <div
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby="logout-title"
                    className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl relative"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="w-12 h-12 bg-red-50 text-red-500 rounded-xl flex items-center justify-center mb-4 mx-auto" aria-hidden="true">
                        <LogOut size={24} />
                    </div>
                    <h3 id="logout-title" className="text-lg font-bold text-slate-900 text-center mb-2">Sign out?</h3>
                    <p className="text-sm text-slate-500 text-center mb-6">
                        You&apos;ll need to log in again to see your orders and place new ones.
                    </p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            autoFocus
                            onClick={() => setShowLogoutModal(false)}
                            className="h-12 flex-1 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setShowLogoutModal(false);
                                logout();
                            }}
                            className="h-12 flex-1 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors"
                        >
                            Yes, Sign out
                        </button>
                    </div>
                </div>
            </div>
        )}
    </>
    );
};

// One neutral icon style for every row (color/bg props kept for compatibility, intentionally unused)
// eslint-disable-next-line no-unused-vars
const MenuItem = ({ icon: Icon, label, sub, path, color, bg }) => (
    <Link to={path || '#'} className="min-h-14 px-4 py-3 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors group">
        <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-slate-100" aria-hidden="true">
                <Icon size={20} className="text-slate-700" />
            </div>
            <div>
                <h3 className="text-sm font-semibold text-slate-800">{label}</h3>
                {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
            </div>
        </div>
        <div className="p-1.5 rounded-md group-hover:bg-slate-100 transition-colors">
            <ChevronRight size={16} className="text-slate-400 group-hover:text-slate-600 transition-all group-hover:translate-x-0.5" />
        </div>
    </Link>
);

export default ProfilePage;


