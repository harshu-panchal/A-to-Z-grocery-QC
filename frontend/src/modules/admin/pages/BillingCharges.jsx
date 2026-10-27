// Premium Billing & Financial Configuration System
import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Card from '@shared/components/ui/Card';
import Button from '@shared/components/ui/Button';
import Modal from '@shared/components/ui/Modal';
import PageHeader from '@shared/components/ui/PageHeader';
import {
    RotateCcw,
    Save,
    Info,
    Truck,
    Settings,
    Zap,
    MapPin,
    History,
    Timer
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';
import { adminApi } from '../services/adminApi';

// Accept windows (seconds) the admin can set; when one runs out the order is
// cancelled (seller) or the offer moves on (delivery / return pickup).
const ORDER_TIMERS = [
    {
        key: 'sellerAcceptTimeoutSec',
        label: 'Seller accept time',
        help: 'Time the seller has to accept a new order. The customer sees the same countdown; if the seller does not accept in time, the order is cancelled.',
    },
    {
        key: 'deliveryAcceptTimeoutSec',
        label: 'Delivery partner accept time',
        help: 'Time a delivery partner has to accept a delivery request before it moves on to the next search round.',
    },
    {
        key: 'returnPickupAcceptTimeoutSec',
        label: 'Return pickup accept time',
        help: 'Time a delivery partner has to accept a return pickup request before it moves on to the next search round.',
    },
];
const TIMER_MIN_SEC = 15;
const TIMER_MAX_SEC = 600;
const formatSeconds = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (!m) return `${s} sec`;
    return s ? `${m} min ${s} sec` : `${m} min`;
};

const BillingCharges = () => {
    const { showToast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [showAudit, setShowAudit] = useState(false);
    const auditQuery = useQuery({
        queryKey: ['admin', 'finance', 'auditLogs'],
        queryFn: async () => (await adminApi.getFinanceAuditLogs({ limit: 100 })).data.result?.items || [],
        enabled: showAudit,
    });
    const [deliveryMode, setDeliveryMode] = useState('distance'); // 'fixed' or 'distance'

    const [config, setConfig] = useState({
        platformFee: 0,
        freeDeliveryThreshold: 0,
        baseCharge: 30,
        riderBasePayout: 30,
        baseDistance: 0.5,
        extraPerKm: 10,
        deliveryPartnerRatePerKm: 5,
        fixedCharge: 30,
        handlingFeeStrategy: "highest_category_fee",
        codEnabled: true,
        onlineEnabled: true,
        sellerAcceptTimeoutSec: 60,
        deliveryAcceptTimeoutSec: 60,
        returnPickupAcceptTimeoutSec: 60,
    });

    // Perf audit Phase 8: migrated the initial settings load to React
    // Query (a one-time fetch feeding editable local form state). The
    // fetched deliveryMode/config values are applied into local state via
    // an effect once, exactly matching the original fetch-then-setState
    // flow; further edits stay purely local until Save.
    const { data: settingsData, isError } = useQuery({
        queryKey: ['admin', 'billingChargesSettings'],
        queryFn: async () => {
            const [platformRes, deliveryRes] = await Promise.all([
                adminApi.getPlatformSettings(),
                adminApi.getDeliveryFinanceSettings(),
            ]);
            return {
                platform: platformRes.data?.success ? platformRes.data.result : null,
                delivery: deliveryRes.data?.success ? deliveryRes.data.result : null,
            };
        },
        staleTime: Infinity,
    });

    useEffect(() => {
        if (isError) console.error('Failed to load settings');
    }, [isError]);

    const hasSeededFormRef = useRef(false);
    useEffect(() => {
        const s = settingsData?.delivery;
        if (!s || hasSeededFormRef.current) return;
        hasSeededFormRef.current = true;
        setDeliveryMode(s.deliveryPricingMode === 'fixed_price' ? 'fixed' : 'distance');
        setConfig((prev) => ({
            ...prev,
            baseCharge: s.customerBaseDeliveryFee ?? s.baseDeliveryCharge ?? prev.baseCharge,
            riderBasePayout: s.riderBasePayout ?? s.customerBaseDeliveryFee ?? prev.riderBasePayout,
            baseDistance: s.baseDistanceCapacityKm ?? prev.baseDistance,
            extraPerKm: s.incrementalKmSurcharge ?? prev.extraPerKm,
            deliveryPartnerRatePerKm: s.deliveryPartnerRatePerKm ?? s.fleetCommissionRatePerKm ?? prev.deliveryPartnerRatePerKm,
            fixedCharge: s.fixedDeliveryFee ?? s.customerBaseDeliveryFee ?? prev.fixedCharge,
            handlingFeeStrategy: s.handlingFeeStrategy ?? prev.handlingFeeStrategy,
            codEnabled: s.codEnabled ?? prev.codEnabled,
            onlineEnabled: s.onlineEnabled ?? prev.onlineEnabled,
            ...Object.fromEntries(
                ORDER_TIMERS.map(({ key }) => [key, Number(settingsData?.platform?.[key]) || prev[key]]),
            ),
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settingsData]);

    const handleSave = async () => {
        try {
            setIsSaving(true);
            await Promise.all([
                adminApi.updatePlatformSettings({
                    sellerAcceptTimeoutSec: config.sellerAcceptTimeoutSec,
                    deliveryAcceptTimeoutSec: config.deliveryAcceptTimeoutSec,
                    returnPickupAcceptTimeoutSec: config.returnPickupAcceptTimeoutSec,
                }),
                adminApi.updateDeliveryFinanceSettings({
                    deliveryPricingMode: deliveryMode === 'fixed' ? 'fixed_price' : 'distance_based',
                    customerBaseDeliveryFee: config.baseCharge,
                    riderBasePayout: config.baseCharge,
                    baseDeliveryCharge: config.baseCharge,
                    baseDistanceCapacityKm: config.baseDistance,
                    incrementalKmSurcharge: config.extraPerKm,
                    deliveryPartnerRatePerKm: config.extraPerKm,
                    fleetCommissionRatePerKm: config.extraPerKm,
                    fixedDeliveryFee: config.fixedCharge,
                    handlingFeeStrategy: config.handlingFeeStrategy,
                    codEnabled: config.codEnabled,
                    onlineEnabled: config.onlineEnabled,
                }),
            ]);

            showToast('Fees & order timer settings updated', 'success');
        } catch (error) {
            console.error('Failed to update platform settings', error);
            showToast('Failed to update fees settings', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleInputChange = (field, value) => {
        let parsed = parseFloat(value) || 0;
        if (parsed < 0) parsed = 0;
        setConfig(prev => ({ ...prev, [field]: parsed }));
    };

    const labelClass = "flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400";
    const inputClass = "h-12 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-base font-black text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20";

    return (
        <div className="space-y-5">
            <PageHeader
                title={
                    <span className="flex items-center gap-2">
                        Fees & Charges
                        <div className="rounded-lg bg-danger/10 p-1.5">
                            <RotateCcw className="h-4 w-4 text-danger" />
                        </div>
                    </span>
                }
                description="Set up delivery fees, platform charges, and free delivery limits."
                actions={
                    <>
                        <Button variant="outline" onClick={() => setShowAudit(true)}>
                            <History className="h-4 w-4" />
                            Audit Logs
                        </Button>
                        <Button onClick={handleSave} isLoading={isSaving}>
                            {!isSaving && <Save className="h-4 w-4" />}
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </>
                }
            />

            <div className="mx-auto max-w-4xl space-y-5 text-left">
                {/* General Financial Thresholds */}
                <Card className="overflow-hidden p-0">
                    <div className="border-b border-slate-100 bg-slate-50/30 p-5">
                        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-900">
                            <Settings className="h-4 w-4 text-slate-400" />
                            Main Charges
                        </h3>
                    </div>
                    <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <label className={labelClass}>
                                Platform/Handling Fee (₹)
                                <Info className="h-3 w-3 opacity-50" />
                            </label>
                            <div className="relative">
                                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-300">₹</span>
                                <input
                                    type="number"
                                    min="0"
                                    value={config.platformFee}
                                    onChange={(e) => handleInputChange('platformFee', e.target.value)}
                                    className={inputClass}
                                />
                            </div>
                            <p className="text-[10px] font-medium italic text-slate-400">Fee added to every order.</p>
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelClass}>
                                Free Delivery Minimum (₹)
                                <Zap className="h-3 w-3 text-warning" />
                            </label>
                            <div className="relative">
                                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-300">₹</span>
                                <input
                                    type="number"
                                    min="0"
                                    value={config.freeDeliveryThreshold}
                                    onChange={(e) => handleInputChange('freeDeliveryThreshold', e.target.value)}
                                    className={inputClass}
                                />
                            </div>
                            <p className="text-[10px] font-medium italic text-slate-400">Orders above this amount will have free delivery.</p>
                        </div>
                    </div>
                </Card>

                {/* Delivery Fee Settings */}
                <Card className="overflow-hidden p-0">
                    <div className="flex flex-col justify-between gap-4 border-b border-slate-100 bg-slate-50/30 p-5 md:flex-row md:items-center">
                        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-900">
                            <Truck className="h-4 w-4 text-primary" />
                            Delivery Fee Settings
                        </h3>
                        <div className="flex shrink-0 rounded-xl bg-slate-100 p-1">
                            <button
                                onClick={() => setDeliveryMode('fixed')}
                                className={cn("rounded-lg px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all", deliveryMode === 'fixed' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400")}
                            >Fixed Price</button>
                            <button
                                onClick={() => setDeliveryMode('distance')}
                                className={cn("rounded-lg px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all", deliveryMode === 'distance' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400")}
                            >Distance Based</button>
                        </div>
                    </div>
                    <div className="p-6">
                        {deliveryMode === 'distance' ? (
                            <>
                                <div className="mb-6 flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                                    <div className="space-y-1">
                                        <p className="text-[11px] font-bold uppercase tracking-tight text-primary">Location Accuracy</p>
                                        <p className="text-[10px] font-medium italic leading-relaxed text-primary/80">Requires Google Maps API. Without it, the system will use straight-line distance.</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Base Fee (₹)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={config.baseCharge}
                                            onChange={(e) => handleInputChange('baseCharge', e.target.value)}
                                            className="h-11 w-full rounded-md border border-slate-200 bg-white px-3.5 text-sm font-black text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                        />
                                        <p className="text-[10px] font-medium italic text-slate-400">Customer-facing minimum fee for first X kms.</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Free Delivery Upto (km)</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.1"
                                                value={config.baseDistance}
                                                onChange={(e) => handleInputChange('baseDistance', e.target.value)}
                                                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3.5 text-sm font-black text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                            />
                                            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase text-slate-300">km</span>
                                        </div>
                                        <p className="text-[10px] font-medium italic text-slate-400">Radius covered by the base charge.</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Per Km Fee (₹)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={config.extraPerKm}
                                            onChange={(e) => handleInputChange('extraPerKm', e.target.value)}
                                            className="h-11 w-full rounded-md border border-slate-200 bg-white px-3.5 text-sm font-black text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                        />
                                        <p className="text-[10px] font-medium italic text-slate-400">Charged for every km beyond base radius.</p>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="space-y-2">
                                <label className="text-base font-bold text-slate-900">Fixed Delivery Charge (₹)</label>
                                <div className="relative max-w-md">
                                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-300">₹</span>
                                    <input
                                        type="number"
                                        min="0"
                                        value={config.fixedCharge}
                                        onChange={(e) => handleInputChange('fixedCharge', e.target.value)}
                                        className="h-12 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-base font-semibold text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                                <p className="text-sm font-medium text-slate-400">Flat fee charged for all deliveries below threshold.</p>
                            </div>
                        )}
                    </div>
                </Card>

                {/* Order Timers */}
                <Card className="overflow-hidden p-0">
                    <div className="border-b border-slate-100 bg-slate-50/30 p-5">
                        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-900">
                            <Timer className="h-4 w-4 text-slate-400" />
                            Order Timers
                        </h3>
                        <p className="mt-1 text-xs font-medium text-slate-400">
                            How long each side has to accept. New orders and requests use the new times right after you save.
                        </p>
                    </div>
                    <div className="space-y-4 p-6">
                        {ORDER_TIMERS.map(({ key, label, help }) => (
                            <div key={key} className="space-y-3 rounded-lg bg-gray-50 p-4">
                                <div className="flex items-center justify-between">
                                    <label htmlFor={`timer-${key}`} className="text-sm font-medium text-gray-700">
                                        {label}
                                    </label>
                                    <span className="text-sm font-bold text-primary">{formatSeconds(config[key])}</span>
                                </div>
                                <input
                                    id={`timer-${key}`}
                                    type="range"
                                    min={TIMER_MIN_SEC}
                                    max={TIMER_MAX_SEC}
                                    step="5"
                                    value={config[key]}
                                    onChange={(e) => setConfig((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                                    className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-primary"
                                />
                                <div className="flex justify-between text-[10px] text-gray-400">
                                    <span>{formatSeconds(TIMER_MIN_SEC)}</span>
                                    <span>{formatSeconds(TIMER_MAX_SEC)}</span>
                                </div>
                                <p className="flex items-start gap-1 text-xs text-gray-500">
                                    <Timer className="mt-0.5 h-3 w-3 flex-shrink-0" />
                                    {help}
                                </p>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
            <Modal isOpen={showAudit} onClose={() => setShowAudit(false)} title="Finance audit logs" size="lg">
                {auditQuery.isLoading ? (
                    <p className="py-8 text-center text-sm text-slate-400">Loading...</p>
                ) : auditQuery.isError ? (
                    <p className="py-8 text-center text-sm text-danger">Could not load audit logs</p>
                ) : !(auditQuery.data || []).length ? (
                    <p className="py-8 text-center text-sm text-slate-400">No audit entries yet</p>
                ) : (
                    <div className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
                        {auditQuery.data.map((log) => (
                            <div key={log.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-slate-900">{AUDIT_LABELS[log.action] || log.action}</p>
                                    <p className="break-words text-xs text-slate-500">{auditDetails(log)}</p>
                                </div>
                                <div className="shrink-0 text-left text-xs text-slate-400 sm:text-right">
                                    <p>{new Date(log.createdAt).toLocaleString('en-IN')}</p>
                                    <p>{log.actorName || log.actorType}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Modal>
        </div>
    );
};

const AUDIT_LABELS = {
    DELIVERY_SETTINGS_UPDATED: 'Fees & charges updated',
    PAYOUT_PROCESSED: 'Payout processed',
    PAYOUT_QUEUED: 'Payout queued',
    ORDER_DELIVERED_SETTLED: 'Delivered order settled',
    COD_MARKED_COLLECTED: 'COD cash marked collected',
    COD_RECONCILED: 'COD reconciled',
    ONLINE_PAYMENT_VERIFIED: 'Online payment verified',
    ORDER_FINANCE_SNAPSHOT_FROZEN: 'Order amounts locked',
    FINANCE_ADJUSTMENT_APPLIED: 'Finance adjustment',
};

function auditDetails(log) {
    const m = log.metadata || {};
    if (Array.isArray(m.updatedFields)) return `Changed: ${m.updatedFields.join(', ')}`;
    const parts = [];
    if (m.payoutType) parts.push(m.payoutType.replace(/_/g, ' ').toLowerCase());
    if (m.amount !== undefined) parts.push(`₹${Number(m.amount).toLocaleString('en-IN')}`);
    if (m.orderId) parts.push(`Order ${m.orderId}`);
    if (log.note) parts.push(log.note);
    return parts.join(' · ') || '—';
}

export default BillingCharges;
