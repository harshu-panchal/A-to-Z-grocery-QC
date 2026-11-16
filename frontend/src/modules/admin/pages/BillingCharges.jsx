// Premium Billing & Financial Configuration System
import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Card from '@shared/components/ui/Card';
import Button from '@shared/components/ui/Button';
import Modal from '@shared/components/ui/Modal';
import PageHeader from '@shared/components/ui/PageHeader';
import {
    RotateCcw,
    Save,
    Truck,
    MapPin,
    History,
    Timer,
    Wallet,
    Bike,
    Package,
    CreditCard,
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

const HANDLING_STRATEGIES = [
    { value: 'highest_category_fee', label: 'Highest category fee', help: 'Cart has items from several categories: charge only the biggest category fee once. Most common.' },
    { value: 'sum_of_category_fees', label: 'Add every category fee', help: 'Charge each category in the cart once and add them up.' },
    { value: 'per_item_fee', label: 'Per item', help: 'Fixed fees are multiplied by quantity; percentage fees apply to each item. Can get expensive on big carts.' },
];

const BillingCharges = () => {
    const { showToast } = useToast();
    const queryClient = useQueryClient();
    const [isSaving, setIsSaving] = useState(false);
    const [showAudit, setShowAudit] = useState(false);
    const auditQuery = useQuery({
        queryKey: ['admin', 'finance', 'auditLogs'],
        queryFn: async () => (await adminApi.getFinanceAuditLogs({ limit: 100 })).data.result?.items || [],
        enabled: showAudit,
    });
    const [deliveryMode, setDeliveryMode] = useState('distance'); // 'fixed' or 'distance'

    const [config, setConfig] = useState({
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
        deliveryCodCashLimit: 5000,
    });

    // Perf audit Phase 8: migrated the initial settings load to React
    // Query (a one-time fetch feeding editable local form state). The
    // fetched deliveryMode/config values are applied into local state via
    // an effect once, exactly matching the original fetch-then-setState
    // flow; further edits stay purely local until Save.
    const { data: settingsData, isError, refetch } = useQuery({
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
            handlingFeeStrategy: s.handlingFeeStrategy === 'max_single_fee'
                ? 'highest_category_fee'
                : (s.handlingFeeStrategy ?? prev.handlingFeeStrategy),
            codEnabled: s.codEnabled ?? prev.codEnabled,
            onlineEnabled: s.onlineEnabled ?? prev.onlineEnabled,
            ...Object.fromEntries(
                ORDER_TIMERS.map(({ key }) => [key, Number(settingsData?.platform?.[key]) || prev[key]]),
            ),
            deliveryCodCashLimit: Number(settingsData?.platform?.deliveryCodCashLimit) || prev.deliveryCodCashLimit,
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settingsData]);

    // Saving before the real values load (or after the load failed) would
    // overwrite the live settings with this form's hardcoded defaults.
    const isLoaded = Boolean(settingsData?.delivery && settingsData?.platform);

    const handleSave = async () => {
        if (!isLoaded) {
            showToast('Settings are not loaded yet. Reload the page and try again.', 'error');
            return;
        }
        if (config.deliveryCodCashLimit < 100) {
            showToast('COD cash limit must be at least ₹100', 'error');
            return;
        }
        if (!config.codEnabled && !config.onlineEnabled) {
            showToast('Keep at least one payment method on, otherwise customers cannot place orders.', 'error');
            return;
        }
        try {
            setIsSaving(true);
            await Promise.all([
                adminApi.updatePlatformSettings({
                    sellerAcceptTimeoutSec: config.sellerAcceptTimeoutSec,
                    deliveryAcceptTimeoutSec: config.deliveryAcceptTimeoutSec,
                    returnPickupAcceptTimeoutSec: config.returnPickupAcceptTimeoutSec,
                    deliveryCodCashLimit: config.deliveryCodCashLimit,
                }),
                adminApi.updateDeliveryFinanceSettings({
                    deliveryPricingMode: deliveryMode === 'fixed' ? 'fixed_price' : 'distance_based',
                    customerBaseDeliveryFee: config.baseCharge,
                    riderBasePayout: config.riderBasePayout,
                    baseDeliveryCharge: config.baseCharge,
                    baseDistanceCapacityKm: config.baseDistance,
                    incrementalKmSurcharge: config.extraPerKm,
                    deliveryPartnerRatePerKm: config.deliveryPartnerRatePerKm,
                    fleetCommissionRatePerKm: config.deliveryPartnerRatePerKm,
                    fixedDeliveryFee: config.fixedCharge,
                    handlingFeeStrategy: config.handlingFeeStrategy,
                    codEnabled: config.codEnabled,
                    onlineEnabled: config.onlineEnabled,
                }),
            ]);

            // The form re-seeds from this cache when the page is reopened, so
            // refresh it or the old values come back.
            queryClient.invalidateQueries({ queryKey: ['admin', 'billingChargesSettings'] });
            showToast('Fees & order timer settings updated', 'success');
        } catch (error) {
            console.error('Failed to update platform settings', error);
            showToast(error?.response?.data?.message || 'Failed to update fees settings', 'error');
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
                description="Set up delivery fees, rider pay, handling fee rules, payment methods, and order timers."
                actions={
                    <>
                        <Button variant="outline" onClick={() => setShowAudit(true)}>
                            <History className="h-4 w-4" />
                            Audit Logs
                        </Button>
                        <Button onClick={handleSave} isLoading={isSaving} disabled={!isLoaded || isSaving}>
                            {!isSaving && <Save className="h-4 w-4" />}
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </>
                }
            />

            <div className="mx-auto max-w-4xl space-y-5 text-left">
                {isError && (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
                        <span>Could not load the current settings. Saving is disabled so the live values are not overwritten.</span>
                        <Button variant="outline" onClick={() => refetch()}>Retry</Button>
                    </div>
                )}
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
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Base Fee Covers Up To (km)</label>
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
                                <p className="text-sm font-medium text-slate-400">Same delivery fee for every order, whatever the distance.</p>
                            </div>
                        )}
                    </div>
                </Card>

                {/* Delivery partner pay */}
                <Card className="overflow-hidden p-0">
                    <div className="border-b border-slate-100 bg-slate-50/30 p-5">
                        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-900">
                            <Bike className="h-4 w-4 text-slate-400" />
                            Delivery Partner Pay
                        </h3>
                        <p className="mt-1 text-xs font-medium text-slate-400">
                            What the delivery partner earns per order, separate from what the customer pays. Riders are paid by distance in both modes. Tips go fully to the rider on top of this.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Rider Base Pay (₹)</label>
                            <input type="number" min="0" value={config.riderBasePayout}
                                onChange={(e) => handleInputChange('riderBasePayout', e.target.value)}
                                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3.5 text-sm font-black text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20" />
                            <p className="text-[10px] font-medium italic text-slate-400">Paid for the first {config.baseDistance} km.</p>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Rider Pay Per Extra Km (₹)</label>
                            <input type="number" min="0" value={config.deliveryPartnerRatePerKm}
                                onChange={(e) => handleInputChange('deliveryPartnerRatePerKm', e.target.value)}
                                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3.5 text-sm font-black text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20" />
                            <p className="text-[10px] font-medium italic text-slate-400">For every km beyond {config.baseDistance} km (part of a km counts as a full km).</p>
                        </div>
                        {deliveryMode === 'fixed' && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Base Pay Covers Up To (km)</label>
                                <input type="number" min="0" step="0.1" value={config.baseDistance}
                                    onChange={(e) => handleInputChange('baseDistance', e.target.value)}
                                    className="h-11 w-full rounded-md border border-slate-200 bg-white px-3.5 text-sm font-black text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20" />
                            </div>
                        )}
                    </div>
                    {(() => {
                        const extraKm = (km) => Math.max(0, Math.ceil(km - config.baseDistance));
                        const customerAt = (km) => (deliveryMode === 'fixed'
                            ? config.fixedCharge
                            : config.baseCharge + extraKm(km) * config.extraPerKm);
                        const riderAt = (km) => config.riderBasePayout + extraKm(km) * config.deliveryPartnerRatePerKm;
                        const examples = [config.baseDistance, 3, 6].map((km) => ({
                            km,
                            margin: Math.round((customerAt(km) - riderAt(km)) * 100) / 100,
                        }));
                        const losing = examples.some((e) => e.margin < 0);
                        return (
                            <div className={cn('mx-6 mb-6 rounded-xl border p-4 text-xs', losing ? 'border-danger/20 bg-danger/5 text-danger' : 'border-slate-100 bg-slate-50 text-slate-600')}>
                                <p className="mb-1 font-bold">Your delivery earning per order (delivery fee minus rider pay, before handling fee)</p>
                                <p>{examples.map((e) => `${e.km} km: ${e.margin < 0 ? '−' : ''}₹${Math.abs(e.margin)}`).join('  ·  ')}</p>
                                {losing && <p className="mt-1 font-semibold">You pay the rider more than the customer pays for delivery at some distances.</p>}
                            </div>
                        );
                    })()}
                </Card>

                {/* Handling fee strategy */}
                <Card className="overflow-hidden p-0">
                    <div className="border-b border-slate-100 bg-slate-50/30 p-5">
                        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-900">
                            <Package className="h-4 w-4 text-slate-400" />
                            Handling Fee
                        </h3>
                        <p className="mt-1 text-xs font-medium text-slate-400">
                            The fee amount is set on each Header Category. This decides how fees combine when a cart has items from more than one category.
                        </p>
                    </div>
                    <div className="space-y-2 p-6">
                        {HANDLING_STRATEGIES.map(({ value, label, help }) => (
                            <label key={value} className={cn('flex cursor-pointer gap-3 rounded-lg border p-3', config.handlingFeeStrategy === value ? 'border-primary bg-primary/5' : 'border-slate-200')}>
                                <input
                                    type="radio"
                                    name="handlingFeeStrategy"
                                    value={value}
                                    checked={config.handlingFeeStrategy === value}
                                    onChange={() => setConfig((prev) => ({ ...prev, handlingFeeStrategy: value }))}
                                    className="mt-0.5 accent-primary"
                                />
                                <span>
                                    <span className="block text-sm font-bold text-slate-900">{label}</span>
                                    <span className="block text-xs text-slate-500">{help}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </Card>

                {/* Payment methods */}
                <Card className="overflow-hidden p-0">
                    <div className="border-b border-slate-100 bg-slate-50/30 p-5">
                        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-900">
                            <CreditCard className="h-4 w-4 text-slate-400" />
                            Payment Methods
                        </h3>
                        <p className="mt-1 text-xs font-medium text-slate-400">Which payment options customers see at checkout. At least one must stay on.</p>
                    </div>
                    <div className="space-y-3 p-6">
                        {[
                            { key: 'codEnabled', label: 'Cash on Delivery (COD)' },
                            { key: 'onlineEnabled', label: 'Online payment' },
                        ].map(({ key, label }) => {
                            const other = key === 'codEnabled' ? 'onlineEnabled' : 'codEnabled';
                            const locked = config[key] && !config[other];
                            return (
                                <label key={key} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
                                    <span className="text-sm font-medium text-slate-700">
                                        {label}
                                        {locked && <span className="ml-2 text-[10px] text-slate-400">(only method left)</span>}
                                    </span>
                                    <input
                                        type="checkbox"
                                        checked={config[key]}
                                        disabled={locked}
                                        onChange={(e) => setConfig((prev) => ({ ...prev, [key]: e.target.checked }))}
                                        className="h-5 w-5 accent-primary disabled:opacity-50"
                                    />
                                </label>
                            );
                        })}
                    </div>
                </Card>

                {/* Delivery partner COD cash limit */}
                <Card className="overflow-hidden p-0">
                    <div className="border-b border-slate-100 bg-slate-50/30 p-5">
                        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-900">
                            <Wallet className="h-4 w-4 text-slate-400" />
                            Delivery COD Cash Limit
                        </h3>
                        <p className="mt-1 text-xs font-medium text-slate-400">
                            Most COD cash a delivery partner may hold before paying admin. A COD order is offered and accepted only if the cash stays within this limit after collecting it. You can set a different limit for one partner in Delivery Boys → Edit.
                        </p>
                    </div>
                    <div className="p-6">
                        <label htmlFor="cod-cash-limit" className={labelClass}>Default limit per partner</label>
                        <div className="relative mt-2">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">₹</span>
                            <input
                                id="cod-cash-limit"
                                type="number"
                                min="100"
                                step="100"
                                value={config.deliveryCodCashLimit}
                                onChange={(e) => handleInputChange('deliveryCodCashLimit', e.target.value)}
                                className={inputClass}
                            />
                        </div>
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
