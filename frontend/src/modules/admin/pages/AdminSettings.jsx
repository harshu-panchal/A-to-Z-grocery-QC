import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Card from '@shared/components/ui/Card';
import Button from '@shared/components/ui/Button';
import PageHeader from '@shared/components/ui/PageHeader';
import {
    Save,
    Settings,
    Globe,
    Building2,
    Share2,
    Smartphone,
    Search,
    Upload,
    Mail,
    Phone,
    MapPin,
    CreditCard,
    Facebook,
    Twitter,
    Instagram,
    Youtube,
    Loader2,
    X,
    HardDrive,
    Cloud,
    Server
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';
import { adminApi } from '../services/adminApi';
import { useSettings } from '@core/context/SettingsContext';

const AdminSettings = () => {
    const normalizeProductApprovalConfig = (raw) => {
        const config = raw?.productApproval || raw || {};
        return {
            sellerCreateRequiresApproval: Boolean(config.sellerCreateRequiresApproval),
            sellerEditRequiresApproval: Boolean(config.sellerEditRequiresApproval),
        };
    };

    const { refetch } = useSettings();
    const { showToast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('general');
    const [logoUploading, setLogoUploading] = useState(false);
    const [faviconUploading, setFaviconUploading] = useState(false);
    const logoInputRef = useRef(null);
    const faviconInputRef = useRef(null);

    const [storageProvider, setStorageProvider] = useState(null);
    const [selectedStorageProvider, setSelectedStorageProvider] = useState(null);
    const [storageProviderSaving, setStorageProviderSaving] = useState(false);

    const [settings, setSettings] = useState({
        appName: '',
        supportEmail: '',
        supportPhone: '',
        currencySymbol: '₹',
        currencyCode: 'INR',
        timezone: 'Asia/Kolkata',
        estimatedDeliveryTime: '12-15 mins',
        logoUrl: '',
        faviconUrl: '',
        primaryColor: 'var(--primary)',
        secondaryColor: '#64748b',
        companyName: '',
        taxId: '',
        address: '',
        facebook: '',
        twitter: '',
        instagram: '',
        linkedin: '',
        youtube: '',
        playStoreLink: '',
        appStoreLink: '',
        metaTitle: '',
        metaDescription: '',
        metaKeywords: '',
        keywords: [],
        returnDeliveryCommission: 0,
        lowStockAlertsEnabled: true,
        productApproval: {
            sellerCreateRequiresApproval: false,
            sellerEditRequiresApproval: false,
        },
    });

    // Perf audit Phase 8: migrated both one-time fetches (general settings,
    // storage provider) to React Query. Both feed editable local form
    // state, so each uses the same seed-once-via-ref guard as the other
    // migrated settings forms — a background refetch must not clobber
    // in-progress edits, and saves already push their response directly
    // into local state without needing a refetch.
    const { data: settingsQueryData, isLoading, isError: isSettingsError } = useQuery({
        queryKey: ['admin', 'platformSettingsForm'],
        queryFn: async () => {
            const res = await adminApi.getSettings();
            return res.data?.result ?? res.data;
        },
    });

    useEffect(() => {
        if (isSettingsError) showToast('Failed to load settings', 'error');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSettingsError]);

    const settingsSeededRef = useRef(false);
    useEffect(() => {
        if (!settingsQueryData || settingsSeededRef.current) return;
        settingsSeededRef.current = true;
        const data = settingsQueryData;
        setSettings(prev => ({
            ...prev,
            ...data,
            productApproval: normalizeProductApprovalConfig(data || {}),
            keywords: Array.isArray(data.keywords) ? data.keywords : (data.metaKeywords ? data.metaKeywords.split(',').map(k => k.trim()).filter(Boolean) : []),
            returnDeliveryCommission: data.returnDeliveryCommission ?? 0,
        }));
    }, [settingsQueryData]);

    const { data: storageQueryData, isLoading: storageProviderLoading, isError: isStorageError } = useQuery({
        queryKey: ['admin', 'storageSettingsForm'],
        queryFn: async () => {
            const res = await adminApi.getStorageSettings();
            return res.data?.result?.provider ?? res.data?.provider ?? 'cloudinary';
        },
    });

    useEffect(() => {
        if (isStorageError) showToast('Failed to load media storage settings', 'error');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isStorageError]);

    const storageSeededRef = useRef(false);
    useEffect(() => {
        if (!storageQueryData || storageSeededRef.current) return;
        storageSeededRef.current = true;
        setStorageProvider(storageQueryData);
        setSelectedStorageProvider(storageQueryData);
    }, [storageQueryData]);

    const handleStorageProviderSave = async () => {
        if (!selectedStorageProvider || selectedStorageProvider === storageProvider) return;

        const confirmMessage = selectedStorageProvider === 'local'
            ? 'Switch storage provider? New uploads will be stored on the server. Existing Cloudinary files will not be moved.'
            : 'Switch storage provider? New uploads will be stored on Cloudinary. Existing local files will remain on the server.';
        if (!window.confirm(confirmMessage)) return;

        setStorageProviderSaving(true);
        try {
            const res = await adminApi.updateStorageSettings(selectedStorageProvider);
            const provider = res.data?.result?.provider ?? res.data?.provider ?? selectedStorageProvider;
            setStorageProvider(provider);
            setSelectedStorageProvider(provider);
            showToast('Media storage provider updated', 'success');
        } catch (error) {
            console.error('Failed to update storage settings', error);
            showToast(error.response?.data?.message || 'Failed to update storage provider', 'error');
        } finally {
            setStorageProviderSaving(false);
        }
    };

    const handleSave = async () => {
        try {
            setIsSaving(true);
            const payload = {
                ...settings,
                keywords: Array.isArray(settings.keywords) ? settings.keywords : (settings.metaKeywords ? settings.metaKeywords.split(',').map(k => k.trim()).filter(Boolean) : []),
            };
            const res = await adminApi.updateSettings(payload);
            const updatedData = res.data?.result ?? res.data;

            if (updatedData) {
                setSettings(prev => ({
                    ...prev,
                    ...updatedData,
                    productApproval: normalizeProductApprovalConfig(updatedData),
                }));
            }
            await refetch({ forceRefresh: true });
            showToast('Settings updated successfully', 'success');
        } catch (error) {
            console.error("Failed to update settings", error);
            showToast('Failed to update settings', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleInputChange = (field, value) => {
        setSettings(prev => ({ ...prev, [field]: value }));
    };

    const handleProductApprovalToggle = (field) => {
        setSettings((prev) => ({
            ...prev,
            productApproval: {
                ...(prev.productApproval || {}),
                [field]: !Boolean(prev.productApproval?.[field]),
            },
        }));
    };

    const handleLogoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast('Please select an image file (PNG, JPG, etc.)', 'error');
            return;
        }
        setLogoUploading(true);
        try {
            const fd = new FormData();
            fd.append('image', file);
            const res = await adminApi.uploadSettingsImage(fd, 'logo');
            const url = res.data?.result?.url || res.data?.url;
            if (url) {
                handleInputChange('logoUrl', url);
                showToast('Logo uploaded. Click Save Changes to apply.', 'success');
            } else throw new Error('No URL returned');
        } catch (err) {
            console.error(err);
            showToast(err.response?.data?.message || 'Failed to upload logo', 'error');
        } finally {
            setLogoUploading(false);
            e.target.value = '';
        }
    };

    const handleFaviconUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast('Please select an image file (PNG, ICO, etc.)', 'error');
            return;
        }
        setFaviconUploading(true);
        try {
            const fd = new FormData();
            fd.append('image', file);
            const res = await adminApi.uploadSettingsImage(fd, 'favicon');
            const url = res.data?.result?.url || res.data?.url;
            if (url) {
                handleInputChange('faviconUrl', url);
                showToast('Favicon uploaded. Click Save Changes to apply.', 'success');
            } else throw new Error('No URL returned');
        } catch (err) {
            console.error(err);
            showToast(err.response?.data?.message || 'Failed to upload favicon', 'error');
        } finally {
            setFaviconUploading(false);
            e.target.value = '';
        }
    };

    const tabs = [
        { id: 'general', label: 'General', icon: Settings },
        { id: 'branding', label: 'Branding', icon: Globe },
        { id: 'legal', label: 'Legal & Contact', icon: Building2 },
        { id: 'social', label: 'Social & Apps', icon: Share2 },
        { id: 'seo', label: 'SEO & Meta', icon: Search },
        { id: 'storage', label: 'Media Storage', icon: HardDrive },
    ];

    const inputClass = "h-11 w-full rounded-md border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20";
    const inputWithIconClass = "h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3.5 text-sm font-semibold text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20";
    const labelClass = "text-[10px] font-bold uppercase tracking-widest text-slate-400";

    const Toggle = ({ checked, onClick }) => (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={onClick}
            className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200",
                checked ? "bg-success" : "bg-slate-300"
            )}
        >
            <span
                className={cn(
                    "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200",
                    checked ? "translate-x-[22px]" : "translate-x-0.5"
                )}
            />
        </button>
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title={
                    <span className="flex items-center gap-2">
                        Platform Settings
                        <div className="rounded-lg bg-slate-100 p-1.5">
                            <Settings className="h-4 w-4 text-slate-600" />
                        </div>
                    </span>
                }
                description="Manage global configurations, branding, and legal information."
                actions={
                    <Button onClick={handleSave} isLoading={isSaving}>
                        {!isSaving && <Save className="h-4 w-4" />}
                        {isSaving ? 'Updating...' : 'Save All Changes'}
                    </Button>
                }
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                {/* Sidebar Navigation */}
                <div className="space-y-1.5 lg:col-span-3">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-medium transition-all",
                                activeTab === tab.id
                                    ? "border border-primary/20 bg-primary/10 text-primary shadow-sm"
                                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                            )}
                        >
                            <tab.icon className={cn("h-4 w-4", activeTab === tab.id ? "text-primary" : "text-slate-400")} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="space-y-5 lg:col-span-9">

                    {isLoading && (
                        <Card className="overflow-hidden p-0">
                            <div className="flex items-center justify-center p-8">
                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
                            </div>
                        </Card>
                    )}

                    {/* General Settings */}
                    {activeTab === 'general' && (
                        <Card className="overflow-hidden p-0">
                            <div className="border-b border-slate-100 bg-slate-50/30 p-5">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900">
                                    General Information
                                </h3>
                            </div>
                            <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
                                <div className="space-y-1.5">
                                    <label className={labelClass}>App Name</label>
                                    <input
                                        type="text"
                                        value={settings.appName}
                                        onChange={(e) => handleInputChange('appName', e.target.value)}
                                        className={inputClass}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className={labelClass}>Support Email</label>
                                    <div className="relative">
                                        <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="email"
                                            value={settings.supportEmail}
                                            onChange={(e) => handleInputChange('supportEmail', e.target.value)}
                                            className={inputWithIconClass}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className={labelClass}>Support Phone</label>
                                    <div className="relative">
                                        <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            value={settings.supportPhone}
                                            onChange={(e) => {
                                                let val = e.target.value.replace(/\D/g, '');
                                                if (val.length > 0 && !/^[6-9]/.test(val)) {
                                                    val = val.replace(/^[^6-9]+/, '');
                                                }
                                                handleInputChange('supportPhone', val.slice(0, 10));
                                            }}
                                            className={inputWithIconClass}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className={labelClass}>Currency Symbol</label>
                                    <input
                                        type="text"
                                        value={settings.currencySymbol}
                                        onChange={(e) => handleInputChange('currencySymbol', e.target.value)}
                                        className={inputClass}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className={labelClass}>Estimated Delivery Time</label>
                                    <input
                                        type="text"
                                        value={settings.estimatedDeliveryTime || ''}
                                        onChange={(e) => handleInputChange('estimatedDeliveryTime', e.target.value)}
                                        placeholder="e.g. 12-15 mins"
                                        maxLength={40}
                                        className={inputClass}
                                    />
                                    <p className="text-[11px] font-medium text-slate-400">
                                        Shown in the customer app header next to the clock (e.g. &quot;12-15 mins&quot;).
                                    </p>
                                </div>
                                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 md:col-span-2">
                                    <div>
                                        <p className="text-sm font-black text-slate-900">Auto Low Stock Alerts</p>
                                        <p className="mt-1 text-xs font-bold text-slate-500">
                                            Automatically notify sellers when any product stock drops to its low-stock threshold.
                                        </p>
                                    </div>
                                    <Toggle checked={settings.lowStockAlertsEnabled} onClick={() => handleInputChange('lowStockAlertsEnabled', !settings.lowStockAlertsEnabled)} />
                                </div>
                                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 md:col-span-2">
                                    <div>
                                        <p className="text-sm font-black text-slate-900">Require approval for new seller products</p>
                                        <p className="mt-1 text-xs font-bold text-slate-500">
                                            When enabled, newly added seller products remain hidden until approved by admin.
                                        </p>
                                    </div>
                                    <Toggle checked={Boolean(settings.productApproval?.sellerCreateRequiresApproval)} onClick={() => handleProductApprovalToggle('sellerCreateRequiresApproval')} />
                                </div>
                                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 md:col-span-2">
                                    <div>
                                        <p className="text-sm font-black text-slate-900">Require approval for seller product edits</p>
                                        <p className="mt-1 text-xs font-bold text-slate-500">
                                            When enabled, seller changes to existing products remain hidden until approved by admin.
                                        </p>
                                    </div>
                                    <Toggle checked={Boolean(settings.productApproval?.sellerEditRequiresApproval)} onClick={() => handleProductApprovalToggle('sellerEditRequiresApproval')} />
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* Branding Settings */}
                    {activeTab === 'branding' && (
                        <Card className="overflow-hidden p-0">
                            <div className="border-b border-slate-100 bg-slate-50/30 p-5">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900">
                                    Visual Identity
                                </h3>
                            </div>
                            <div className="space-y-6 p-6">
                                <input type="file" ref={logoInputRef} accept="image/*" className="hidden" onChange={handleLogoUpload} />
                                <input type="file" ref={faviconInputRef} accept="image/*" className="hidden" onChange={handleFaviconUpload} />
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <label className={labelClass}>App Logo</label>
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => !logoUploading && logoInputRef.current?.click()}
                                            onKeyDown={(e) => e.key === 'Enter' && !logoUploading && logoInputRef.current?.click()}
                                            className={cn(
                                                "flex h-36 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed transition-all",
                                                settings.logoUrl ? "border-slate-200 bg-slate-50/50" : "cursor-pointer border-slate-200 hover:border-primary/50 hover:bg-primary/5"
                                            )}
                                        >
                                            {logoUploading ? (
                                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                            ) : settings.logoUrl ? (
                                                <>
                                                    <img src={settings.logoUrl} alt="App logo" className="max-h-20 w-auto object-contain" />
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-slate-500">Click to replace</span>
                                                        <button type="button" onClick={(e) => { e.stopPropagation(); handleInputChange('logoUrl', ''); }} className="rounded p-1 text-slate-400 hover:bg-danger/10 hover:text-danger" title="Remove logo"><X className="h-4 w-4" /></button>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                                                        <Upload className="h-4 w-4 text-slate-400" />
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-400">Click to upload logo</span>
                                                </>
                                            )}
                                        </div>
                                        <input type="url" value={settings.logoUrl} onChange={(e) => handleInputChange('logoUrl', e.target.value)} placeholder="Or paste logo URL" className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className={labelClass}>Favicon</label>
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => !faviconUploading && faviconInputRef.current?.click()}
                                            onKeyDown={(e) => e.key === 'Enter' && !faviconUploading && faviconInputRef.current?.click()}
                                            className={cn(
                                                "flex h-36 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed transition-all",
                                                settings.faviconUrl ? "border-slate-200 bg-slate-50/50" : "cursor-pointer border-slate-200 hover:border-primary/50 hover:bg-primary/5"
                                            )}
                                        >
                                            {faviconUploading ? (
                                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                            ) : settings.faviconUrl ? (
                                                <>
                                                    <img src={settings.faviconUrl} alt="Favicon" className="max-h-14 w-auto object-contain" />
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-slate-500">Click to replace</span>
                                                        <button type="button" onClick={(e) => { e.stopPropagation(); handleInputChange('faviconUrl', ''); }} className="rounded p-1 text-slate-400 hover:bg-danger/10 hover:text-danger" title="Remove favicon"><X className="h-4 w-4" /></button>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                                                        <Upload className="h-4 w-4 text-slate-400" />
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-400">Click to upload favicon</span>
                                                </>
                                            )}
                                        </div>
                                        <input type="url" value={settings.faviconUrl} onChange={(e) => handleInputChange('faviconUrl', e.target.value)} placeholder="Or paste favicon URL" className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className={labelClass}>Primary Brand Color</label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="color"
                                            value={settings.primaryColor}
                                            onChange={(e) => handleInputChange('primaryColor', e.target.value)}
                                            className="h-10 w-20 cursor-pointer rounded-md bg-transparent"
                                        />
                                        <input
                                            type="text"
                                            value={settings.primaryColor}
                                            onChange={(e) => handleInputChange('primaryColor', e.target.value)}
                                            className={cn(inputClass, "font-mono")}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className={labelClass}>Secondary Brand Color</label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="color"
                                            value={settings.secondaryColor}
                                            onChange={(e) => handleInputChange('secondaryColor', e.target.value)}
                                            className="h-10 w-20 cursor-pointer rounded-md bg-transparent"
                                        />
                                        <input
                                            type="text"
                                            value={settings.secondaryColor}
                                            onChange={(e) => handleInputChange('secondaryColor', e.target.value)}
                                            className={cn(inputClass, "font-mono")}
                                        />
                                    </div>
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* Legal Settings */}
                    {activeTab === 'legal' && (
                        <Card className="overflow-hidden p-0">
                            <div className="border-b border-slate-100 bg-slate-50/30 p-5">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900">
                                    Legal Entity & Contact
                                </h3>
                            </div>
                            <div className="grid grid-cols-1 gap-4 p-6">
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <label className={labelClass}>Company Legal Name</label>
                                        <input
                                            type="text"
                                            value={settings.companyName}
                                            onChange={(e) => handleInputChange('companyName', e.target.value)}
                                            className={inputClass}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className={labelClass}>Tax ID / GSTIN / VAT</label>
                                        <div className="relative">
                                            <CreditCard className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="text"
                                                value={settings.taxId}
                                                onChange={(e) => handleInputChange('taxId', e.target.value)}
                                                className={inputWithIconClass}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className={labelClass}>Registered Office Address</label>
                                    <div className="relative">
                                        <MapPin className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                                        <textarea
                                            rows={3}
                                            value={settings.address}
                                            onChange={(e) => handleInputChange('address', e.target.value)}
                                            className="w-full resize-none rounded-md border border-slate-200 bg-white py-3 pl-10 pr-3.5 text-sm font-semibold text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                        />
                                    </div>
                                </div>

                                {/* Return delivery commission input moved to Fees & Charges → Delivery Fee Settings */}
                            </div>
                        </Card>
                    )}

                    {/* Social & Apps */}
                    {activeTab === 'social' && (
                        <Card className="overflow-hidden p-0">
                            <div className="border-b border-slate-100 bg-slate-50/30 p-5">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900">
                                    Social Media & App Links
                                </h3>
                            </div>
                            <div className="space-y-6 p-6">
                                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <label className={labelClass}>Facebook URL</label>
                                        <div className="relative">
                                            <Facebook className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                                            <input
                                                type="url"
                                                value={settings.facebook}
                                                onChange={(e) => handleInputChange('facebook', e.target.value)}
                                                className={inputWithIconClass}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className={labelClass}>Twitter / X URL</label>
                                        <div className="relative">
                                            <Twitter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                                            <input
                                                type="url"
                                                value={settings.twitter}
                                                onChange={(e) => handleInputChange('twitter', e.target.value)}
                                                className={inputWithIconClass}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className={labelClass}>Instagram URL</label>
                                        <div className="relative">
                                            <Instagram className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-pink-600" />
                                            <input
                                                type="url"
                                                value={settings.instagram}
                                                onChange={(e) => handleInputChange('instagram', e.target.value)}
                                                className={inputWithIconClass}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className={labelClass}>YouTube URL</label>
                                        <div className="relative">
                                            <Youtube className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-danger" />
                                            <input
                                                type="url"
                                                value={settings.youtube}
                                                onChange={(e) => handleInputChange('youtube', e.target.value)}
                                                className={inputWithIconClass}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-5 border-t border-slate-100 pt-6 md:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <label className={labelClass}>Play Store Link (Android)</label>
                                        <div className="relative">
                                            <Smartphone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                                            <input
                                                type="url"
                                                value={settings.playStoreLink}
                                                onChange={(e) => handleInputChange('playStoreLink', e.target.value)}
                                                className={inputWithIconClass}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className={labelClass}>App Store Link (iOS)</label>
                                        <div className="relative">
                                            <Smartphone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-800" />
                                            <input
                                                type="url"
                                                value={settings.appStoreLink}
                                                onChange={(e) => handleInputChange('appStoreLink', e.target.value)}
                                                className={inputWithIconClass}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* SEO Settings */}
                    {activeTab === 'seo' && (
                        <Card className="overflow-hidden p-0">
                            <div className="border-b border-slate-100 bg-slate-50/30 p-5">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900">
                                    SEO & Meta Information
                                </h3>
                            </div>
                            <div className="space-y-5 p-6">
                                <div className="space-y-1.5">
                                    <label className={labelClass}>Default Meta Title</label>
                                    <input
                                        type="text"
                                        value={settings.metaTitle}
                                        onChange={(e) => handleInputChange('metaTitle', e.target.value)}
                                        className={inputClass}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className={labelClass}>Default Meta Description</label>
                                    <textarea
                                        rows={3}
                                        value={settings.metaDescription}
                                        onChange={(e) => handleInputChange('metaDescription', e.target.value)}
                                        className="w-full resize-none rounded-md border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    />
                                    <p className="text-right text-[10px] font-bold italic text-slate-400">Recommended length: 150-160 characters</p>
                                </div>
                                <div className="space-y-1.5">
                                    <label className={labelClass}>Meta Keywords</label>
                                    <input
                                        type="text"
                                        value={settings.metaKeywords}
                                        onChange={(e) => handleInputChange('metaKeywords', e.target.value)}
                                        className={inputClass}
                                        placeholder="keyword1, keyword2, keyword3"
                                    />
                                    <p className="text-right text-[10px] font-bold italic text-slate-400">Separate keywords with commas</p>
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* Media Storage Settings */}
                    {activeTab === 'storage' && (
                        <Card className="overflow-hidden p-0">
                            <div className="border-b border-slate-100 bg-slate-50/30 p-5">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900">
                                    Media Storage
                                </h3>
                                <p className="mt-1 text-xs font-medium text-slate-400">
                                    Choose where NEW image and file uploads are stored. Switching providers never moves or deletes existing files.
                                </p>
                            </div>
                            <div className="space-y-5 p-6">
                                {storageProviderLoading ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                                            <span className="h-2.5 w-2.5 rounded-full bg-success" />
                                            Currently active: {storageProvider === 'local' ? 'Local Server' : 'Cloudinary'}
                                        </div>

                                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                            <label
                                                className={cn(
                                                    "flex cursor-pointer items-start gap-4 rounded-xl border-2 p-4 transition-all",
                                                    selectedStorageProvider === 'cloudinary'
                                                        ? "border-primary bg-primary/5"
                                                        : "border-slate-200 hover:border-slate-300"
                                                )}
                                            >
                                                <input
                                                    type="radio"
                                                    name="mediaStorageProvider"
                                                    value="cloudinary"
                                                    checked={selectedStorageProvider === 'cloudinary'}
                                                    onChange={() => setSelectedStorageProvider('cloudinary')}
                                                    className="mt-1"
                                                />
                                                <div>
                                                    <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                                                        <Cloud className="h-4 w-4" /> Cloudinary
                                                    </div>
                                                    <p className="mt-1 text-xs font-medium text-slate-400">Uploads are stored on Cloudinary's CDN (current default).</p>
                                                </div>
                                            </label>

                                            <label
                                                className={cn(
                                                    "flex cursor-pointer items-start gap-4 rounded-xl border-2 p-4 transition-all",
                                                    selectedStorageProvider === 'local'
                                                        ? "border-primary bg-primary/5"
                                                        : "border-slate-200 hover:border-slate-300"
                                                )}
                                            >
                                                <input
                                                    type="radio"
                                                    name="mediaStorageProvider"
                                                    value="local"
                                                    checked={selectedStorageProvider === 'local'}
                                                    onChange={() => setSelectedStorageProvider('local')}
                                                    className="mt-1"
                                                />
                                                <div>
                                                    <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                                                        <Server className="h-4 w-4" /> Local Server
                                                    </div>
                                                    <p className="mt-1 text-xs font-medium text-slate-400">Uploads are stored on this server's disk and served via your domain.</p>
                                                </div>
                                            </label>
                                        </div>

                                        <Button
                                            onClick={handleStorageProviderSave}
                                            disabled={storageProviderSaving || !selectedStorageProvider || selectedStorageProvider === storageProvider}
                                            isLoading={storageProviderSaving}
                                        >
                                            {!storageProviderSaving && <Save className="h-4 w-4" />}
                                            {storageProviderSaving ? 'Saving...' : 'Save Storage Provider'}
                                        </Button>
                                    </>
                                )}
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminSettings;
