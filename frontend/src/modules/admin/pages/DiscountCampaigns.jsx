import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    HiOutlinePlus,
    HiOutlineMegaphone,
    HiOutlineTrash,
    HiOutlineXMark,
    HiOutlineBellAlert,
    HiOutlinePhoto,
} from 'react-icons/hi2';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import Modal from '@shared/components/ui/Modal';
import PageHeader from '@shared/components/ui/PageHeader';
import EmptyState from '@shared/components/ui/EmptyState';
import { useToast } from '@shared/components/ui/Toast';
import { cn } from '@/lib/utils';
import { PHASE_META, formatDateTime, toLocalInput, rupees, timeLeft } from '@shared/utils/campaignUi';
import { adminApi } from '../services/adminApi';

const LIST_KEY = ['admin', 'campaigns'];
const inputCls =
    'h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50 disabled:text-slate-400';
const labelCls = 'text-[10px] font-bold uppercase tracking-widest text-slate-400';
const resultOf = (res) => res?.data?.result ?? res?.data?.results ?? res?.data;
const errorOf = (e, fallback) => e?.response?.data?.message || fallback;
const idOf = (v) => String(v?._id || v || '');

const emptyForm = () => {
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    return {
        name: '',
        description: '',
        bannerImage: '',
        targetType: 'categories',
        categoryIds: [],
        products: [], // [{_id, name}] for targetType=products
        excluded: [], // [{_id, name}]
        discountType: 'percentage',
        discountValue: 10,
        maxDiscount: '',
        joinDeadline: toLocalInput(now + 2 * day),
        startAt: toLocalInput(now + 3 * day),
        endAt: toLocalInput(now + 6 * day),
    };
};

/* --------------------------- date + time picker --------------------------- */
// value/onChange use the "YYYY-MM-DDTHH:mm" local string (datetime-local format)
const DateTimeField = ({ label, hint, value, onChange, disabled }) => {
    const [date = '', time = ''] = String(value || '').split('T');
    return (
        <div className="space-y-1.5">
            <label className={labelCls}>{label}</label>
            <div className="grid grid-cols-2 gap-2">
                <input
                    type="date"
                    aria-label={`${label} date`}
                    disabled={disabled}
                    value={date}
                    onChange={(e) => onChange(`${e.target.value}T${time || '00:00'}`)}
                    className={inputCls}
                />
                <input
                    type="time"
                    aria-label={`${label} time`}
                    disabled={disabled}
                    value={time}
                    onChange={(e) => onChange(`${date || toLocalInput(Date.now()).slice(0, 10)}T${e.target.value}`)}
                    className={inputCls}
                />
            </div>
            {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
        </div>
    );
};

/* ----------------------------- product picker ----------------------------- */
const ProductPicker = ({ value, onChange, disabled, placeholder }) => {
    const [term, setTerm] = useState('');
    const [results, setResults] = useState([]);

    useEffect(() => {
        const q = term.trim();
        if (q.length < 2) return undefined;
        const t = setTimeout(async () => {
            try {
                const res = await adminApi.getProducts({ search: q, limit: 10 });
                const r = resultOf(res);
                setResults(Array.isArray(r?.items) ? r.items : Array.isArray(r) ? r : []);
            } catch {
                setResults([]);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [term]);

    const chosen = new Set(value.map((p) => idOf(p)));
    const shown = term.trim().length >= 2 ? results : [];
    return (
        <div className="space-y-2">
            {!disabled && (
                <div className="relative">
                    <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={placeholder} className={inputCls} />
                    {shown.length > 0 && (
                        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                            {shown.map((p) => (
                                <button
                                    key={p._id}
                                    type="button"
                                    disabled={chosen.has(String(p._id))}
                                    onClick={() => { onChange([...value, { _id: p._id, name: p.name }]); setTerm(''); setResults([]); }}
                                    className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold hover:bg-slate-50 disabled:opacity-40"
                                >
                                    <span className="truncate">{p.name}</span>
                                    <span className="ml-2 shrink-0 text-[10px] text-slate-400">{p.sellerId?.shopName || ''}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
            <div className="flex flex-wrap gap-1.5">
                {value.map((p) => (
                    <span key={idOf(p)} className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                        {p.name || 'Product'}
                        {!disabled && (
                            <button type="button" aria-label={`Remove ${p.name}`} onClick={() => onChange(value.filter((x) => idOf(x) !== idOf(p)))}>
                                <HiOutlineXMark className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </span>
                ))}
            </div>
        </div>
    );
};

/* ------------------------------- form modal ------------------------------- */
const CampaignForm = ({ editing, categories, onClose, onSaved }) => {
    const { showToast } = useToast();
    const locked = Boolean(editing && editing.status !== 'draft'); // sellers already invited
    // start time stays editable until the sale begins
    const startLocked = Boolean(editing && editing.phase && !['draft', 'inviting'].includes(editing.phase));
    const [form, setForm] = useState(() => {
        if (!editing) return emptyForm();
        return {
            name: editing.name || '',
            description: editing.description || '',
            bannerImage: editing.bannerImage || '',
            targetType: editing.targetType,
            categoryIds: (editing.categoryIds || []).map(idOf),
            products: (editing.productIds || []).map((p) => ({ _id: idOf(p), name: p?.name })),
            excluded: (editing.excludedProductIds || []).map((p) => ({ _id: idOf(p), name: p?.name })),
            discountType: editing.discountType,
            discountValue: editing.discountValue,
            maxDiscount: editing.maxDiscount ?? '',
            joinDeadline: toLocalInput(editing.joinDeadline),
            startAt: toLocalInput(editing.startAt),
            endAt: toLocalInput(editing.endAt),
        };
    });
    const [catTerm, setCatTerm] = useState('');
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const set = (patch) => setForm((f) => ({ ...f, ...patch }));

    const groupedCategories = useMemo(() => {
        const q = catTerm.trim().toLowerCase();
        const list = categories.filter((c) => !q || (c.name || '').toLowerCase().includes(q));
        return ['header', 'category', 'subcategory'].map((type) => ({
            type,
            label: { header: 'Header', category: 'Category', subcategory: 'Sub-category' }[type],
            items: list.filter((c) => c.type === type),
        }));
    }, [categories, catTerm]);

    const uploadBanner = async (file) => {
        if (!file) return;
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('image', file);
            const res = await adminApi.uploadExperienceBanner(fd);
            const url = res.data?.result?.url || res.data?.url;
            if (!url) throw new Error('Upload failed');
            set({ bannerImage: url });
        } catch (e) {
            showToast(errorOf(e, 'Failed to upload banner'), 'error');
        } finally {
            setUploading(false);
        }
    };

    const save = async (e) => {
        e.preventDefault();
        const payload = locked
            ? {
                name: form.name,
                description: form.description,
                bannerImage: form.bannerImage,
                joinDeadline: new Date(form.joinDeadline).toISOString(),
                ...(startLocked ? {} : { startAt: new Date(form.startAt).toISOString() }),
                endAt: new Date(form.endAt).toISOString(),
            }
            : {
                name: form.name,
                description: form.description,
                bannerImage: form.bannerImage,
                targetType: form.targetType,
                categoryIds: form.categoryIds,
                productIds: form.products.map(idOf),
                excludedProductIds: form.excluded.map(idOf),
                discountType: form.discountType,
                discountValue: Number(form.discountValue),
                maxDiscount: form.maxDiscount === '' ? null : Number(form.maxDiscount),
                joinDeadline: form.joinDeadline ? new Date(form.joinDeadline).toISOString() : '',
                startAt: form.startAt ? new Date(form.startAt).toISOString() : '',
                endAt: form.endAt ? new Date(form.endAt).toISOString() : '',
            };
        setSaving(true);
        try {
            const res = editing
                ? await adminApi.updateCampaign(editing._id, payload)
                : await adminApi.createCampaign(payload);
            showToast(editing ? 'Campaign updated' : 'Draft saved. Now press "Publish & invite sellers".', 'success');
            onSaved(resultOf(res));
        } catch (err) {
            showToast(errorOf(err, 'Failed to save campaign'), 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen onClose={onClose} size="lg" title={editing ? 'Edit Campaign' : 'New Discount Campaign'}>
            <form onSubmit={save} className="space-y-5">
                {locked && (
                    <p className="rounded-md bg-warning/10 px-3 py-2 text-[11px] font-bold text-warning">
                        Sellers have already been invited, so the discount and products can&apos;t change. You can still edit the name and banner, extend the join deadline or end date, and move the start time until the sale begins.
                    </p>
                )}
                <div className="space-y-1.5">
                    <label className={labelCls}>Campaign name</label>
                    <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="E.g. Diwali Sale" className={inputCls} />
                </div>
                <div className="space-y-1.5">
                    <label className={labelCls}>Description (shown to sellers and customers)</label>
                    <textarea
                        rows={2}
                        value={form.description}
                        onChange={(e) => set({ description: e.target.value })}
                        className="w-full resize-none rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className={labelCls}>Banner image (optional)</label>
                    <div className="flex items-center gap-3">
                        {form.bannerImage ? (
                            <img src={form.bannerImage} alt="" className="h-14 w-28 rounded-md object-cover" />
                        ) : (
                            <div className="flex h-14 w-28 items-center justify-center rounded-md bg-slate-100 text-slate-400">
                                <HiOutlinePhoto className="h-5 w-5" />
                            </div>
                        )}
                        <label className="cursor-pointer rounded-md border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50">
                            {uploading ? 'Uploading...' : form.bannerImage ? 'Change' : 'Upload'}
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadBanner(e.target.files?.[0])} />
                        </label>
                        {form.bannerImage && (
                            <button type="button" className="text-[11px] font-bold text-danger" onClick={() => set({ bannerImage: '' })}>Remove</button>
                        )}
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className={labelCls}>Applies to</label>
                    <div className="flex gap-2">
                        {[
                            ['categories', 'Categories / sub-categories'],
                            ['products', 'Specific products'],
                        ].map(([id, label]) => (
                            <button
                                key={id}
                                type="button"
                                disabled={locked}
                                onClick={() => set({ targetType: id })}
                                className={cn(
                                    'flex-1 rounded-lg border px-3 py-2 text-[11px] font-bold disabled:opacity-60',
                                    form.targetType === id ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-slate-50 text-slate-600',
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {form.targetType === 'categories' ? (
                    <div className="space-y-2">
                        <input value={catTerm} onChange={(e) => setCatTerm(e.target.value)} placeholder="Search categories" className={inputCls} disabled={locked} />
                        <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                            {groupedCategories.map((g) =>
                                g.items.length ? (
                                    <div key={g.type}>
                                        <p className="mb-1 text-[10px] font-bold text-slate-400">{g.label}</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {g.items.map((c) => {
                                                const on = form.categoryIds.includes(String(c._id));
                                                return (
                                                    <button
                                                        key={c._id}
                                                        type="button"
                                                        disabled={locked}
                                                        onClick={() =>
                                                            set({
                                                                categoryIds: on
                                                                    ? form.categoryIds.filter((x) => x !== String(c._id))
                                                                    : [...form.categoryIds, String(c._id)],
                                                            })
                                                        }
                                                        className={cn(
                                                            'rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition-all disabled:opacity-60',
                                                            on ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white',
                                                        )}
                                                    >
                                                        {c.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : null,
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelCls}>Exclude products (optional)</label>
                            <ProductPicker value={form.excluded} onChange={(excluded) => set({ excluded })} disabled={locked} placeholder="Search a product to exclude" />
                        </div>
                    </div>
                ) : (
                    <ProductPicker value={form.products} onChange={(products) => set({ products })} disabled={locked} placeholder="Search products by name" />
                )}

                <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                        <label className={labelCls}>Discount type</label>
                        <select value={form.discountType} disabled={locked} onChange={(e) => set({ discountType: e.target.value })} className={inputCls}>
                            <option value="percentage">% off</option>
                            <option value="flat">₹ off per unit</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className={labelCls}>{form.discountType === 'flat' ? 'Amount (₹)' : 'Percent (max 50)'}</label>
                        <input type="number" min={1} max={form.discountType === 'flat' ? undefined : 50} step="any" disabled={locked} value={form.discountValue} onChange={(e) => set({ discountValue: e.target.value })} className={inputCls} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={labelCls}>Max ₹ off / unit</label>
                        <input type="number" min={0} step="any" disabled={locked || form.discountType === 'flat'} value={form.maxDiscount} onChange={(e) => set({ maxDiscount: e.target.value })} placeholder="No cap" className={inputCls} />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <DateTimeField
                        label="Sale start date & time"
                        hint="Discounted prices go live at this moment."
                        value={form.startAt}
                        disabled={startLocked}
                        onChange={(startAt) => set({ startAt })}
                    />
                    <DateTimeField
                        label="Sale end date & time"
                        hint="Prices go back to normal at this moment."
                        value={form.endAt}
                        onChange={(endAt) => set({ endAt })}
                    />
                    <DateTimeField
                        label="Sellers must join by"
                        hint="Must be on or before the start. Sellers are locked in after this."
                        value={form.joinDeadline}
                        onChange={(joinDeadline) => set({ joinDeadline })}
                    />
                </div>
                {form.startAt && form.endAt && form.joinDeadline && (
                    <p className="rounded-md bg-primary/10 px-3 py-2 text-[11px] font-bold text-primary">
                        Sellers can join until {formatDateTime(form.joinDeadline)}. The sale runs from {formatDateTime(form.startAt)} to {formatDateTime(form.endAt)}.
                    </p>
                )}

                <p className="rounded-md bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                    Sellers pay for this discount: their payout and your commission are calculated on the sale price. The discount only applies to products a seller chooses to join, and never takes a price below the seller&apos;s purchase cost.
                </p>

                <div className="flex gap-3 pt-1">
                    <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
                    <Button type="submit" className="flex-1" disabled={saving || uploading}>
                        {saving ? 'Saving...' : editing ? 'Save changes' : 'Create draft'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

/* ----------------------- "why isn't it live?" checklist ---------------------- */
const LiveChecklist = ({ c }) => {
    const joinedSellers = (c.participants || []).filter((p) => p.status === 'joined').length;
    const deadlinePassed = new Date(c.joinDeadline) <= new Date();
    const startsIn = timeLeft(c.startAt);
    const steps = [
        {
            ok: c.status !== 'draft',
            text: c.status !== 'draft' ? 'Published, sellers invited' : 'Not published yet. Press "Publish & invite sellers".',
        },
        {
            ok: joinedSellers > 0 && c.visibleProductCount > 0,
            text: joinedSellers > 0
                ? `${joinedSellers} seller(s) joined with ${c.visibleProductCount} live product(s)`
                : deadlinePassed
                    ? 'No seller joined before the deadline, so nothing is discounted. Edit: extend "Sellers must join by" (and move the start later if needed), then press "Remind sellers".'
                    : `No seller has joined yet. Sellers join from Seller Panel → Sale Campaigns before ${formatDateTime(c.joinDeadline)}.`,
        },
        {
            ok: !startsIn,
            text: startsIn ? `Starts in ${startsIn} (${formatDateTime(c.startAt)})` : `Start time reached (${formatDateTime(c.startAt)})`,
        },
        {
            ok: !['paused', 'cancelled', 'ended'].includes(c.phase),
            text: { paused: 'Paused. Press "Resume".', cancelled: 'Cancelled', ended: 'Ended' }[c.phase] || 'Running normally',
        },
    ];
    const allOk = steps.every((s) => s.ok);
    return (
        <div className="space-y-1.5 rounded-lg border border-slate-100 p-3">
            <p className={labelCls}>Shown to customers?</p>
            {steps.map((s) => (
                <p key={s.text} className={cn('flex gap-2 text-[11px] font-bold', s.ok ? 'text-success' : 'text-warning')}>
                    <span aria-hidden="true">{s.ok ? '✓' : '•'}</span>
                    <span>{s.text}</span>
                </p>
            ))}
            <p className={cn('pt-1 text-[11px] font-black', allOk ? 'text-success' : 'text-slate-500')}>
                {allOk
                    ? 'Live for customers: Offers page (/offers), the "Offers & sales" strip on the phone home screen, and sale prices on product cards, cart and checkout.'
                    : 'Customers will see it once every line above is ticked.'}
            </p>
        </div>
    );
};

/* ------------------------------ detail modal ------------------------------ */
const STATUS_BADGE = { invited: ['No reply', 'secondary'], joined: ['Joined', 'success'], declined: ['Declined', 'danger'] };

const CampaignDetail = ({ campaignId, onClose, onEdit, onChanged }) => {
    const { showToast } = useToast();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const { data: c, refetch, isError, error: loadError } = useQuery({
        queryKey: ['admin', 'campaign', campaignId],
        queryFn: async () => resultOf(await adminApi.getCampaign(campaignId)),
        retry: 1,
    });
    const showReport = c && ['live', 'paused', 'ended'].includes(c.phase);
    const { data: report } = useQuery({
        queryKey: ['admin', 'campaignReport', campaignId],
        queryFn: async () => resultOf(await adminApi.getCampaignReport(campaignId)),
        enabled: Boolean(showReport),
    });

    const run = async (fn, okMsg, confirmMsg) => {
        if (confirmMsg && !window.confirm(confirmMsg)) return;
        setBusy(true);
        setError('');
        try {
            const res = await fn();
            showToast(res?.data?.message || okMsg, 'success');
            await refetch();
            onChanged();
        } catch (e) {
            const msg = errorOf(e, 'Action failed');
            setError(msg); // stays visible, unlike the toast
            showToast(msg, 'error');
        } finally {
            setBusy(false);
        }
    };

    if (!c) {
        return (
            <Modal isOpen onClose={onClose} size="xl" title="Campaign">
                {isError ? (
                    <div className="space-y-3 py-6 text-center">
                        <p className="text-xs font-bold text-danger">{errorOf(loadError, 'Could not load this campaign')}</p>
                        <Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
                    </div>
                ) : (
                    <p className="py-8 text-center text-xs font-bold text-slate-400">Loading...</p>
                )}
            </Modal>
        );
    }

    const phase = PHASE_META[c.phase] || PHASE_META.draft;
    const joined = (c.participants || []).filter((p) => p.status === 'joined');
    const counts = (c.participants || []).reduce((acc, p) => ({ ...acc, [p.status]: (acc[p.status] || 0) + 1 }), {});

    return (
        <Modal isOpen onClose={onClose} size="xl" title={c.name}>
            <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={phase.variant}>{phase.label}</Badge>
                    <Badge variant="primary">{c.discountLabel}</Badge>
                    <span className="text-[11px] font-bold text-slate-500">
                        Join by {formatDateTime(c.joinDeadline)} · Sale {formatDateTime(c.startAt)} → {formatDateTime(c.endAt)}
                    </span>
                </div>
                {c.description && <p className="text-xs text-slate-600">{c.description}</p>}
                <p className="text-[11px] font-bold text-slate-500">
                    Applies to:{' '}
                    {c.targetType === 'categories'
                        ? (c.categoryIds || []).map((x) => x.name).join(', ')
                        : `${(c.productIds || []).length} selected product(s)`}
                    {c.excludedProductIds?.length ? ` · ${c.excludedProductIds.length} excluded` : ''}
                    {' · '}
                    {c.eligibleProductCount} eligible product(s) right now
                </p>

                <div className="flex flex-wrap gap-2">
                    {c.phase === 'draft' && (
                        <>
                            <Button size="sm" disabled={busy} onClick={() => run(() => adminApi.publishCampaign(c._id), 'Published', 'Publish and invite every matching seller? The discount and products are locked after this.')}>
                                <HiOutlineMegaphone className="h-4 w-4" /> Publish &amp; invite sellers
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => onEdit(c)}>Edit</Button>
                        </>
                    )}
                    {['inviting', 'live', 'paused'].includes(c.phase) && (
                        <Button size="sm" variant="outline" onClick={() => onEdit(c)}>Edit details</Button>
                    )}
                    {c.phase === 'inviting' && new Date(c.joinDeadline) > new Date() && (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => adminApi.remindCampaignSellers(c._id), 'Reminder sent')}>
                            <HiOutlineBellAlert className="h-4 w-4" /> Remind sellers
                        </Button>
                    )}
                    {(c.phase === 'live' || c.phase === 'inviting') && (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => adminApi.campaignAction(c._id, 'pause'), 'Paused')}>Pause</Button>
                    )}
                    {c.phase === 'paused' && (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => adminApi.campaignAction(c._id, 'resume'), 'Resumed')}>Resume</Button>
                    )}
                    {(c.phase === 'live' || c.phase === 'paused') && (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => adminApi.campaignAction(c._id, 'end'), 'Ended', 'End the sale now? Prices go back to normal immediately.')}>End now</Button>
                    )}
                    {['inviting', 'live', 'paused'].includes(c.phase) && (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => adminApi.campaignAction(c._id, 'cancel'), 'Cancelled', 'Cancel this campaign? It cannot be restarted.')}>Cancel campaign</Button>
                    )}
                    {!['live', 'paused'].includes(c.phase) && (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { const r = await adminApi.deleteCampaign(c._id); onClose(); return r; }, 'Deleted', `Delete "${c.name}"? This can't be undone.`)}>
                            <HiOutlineTrash className="h-4 w-4" /> Delete
                        </Button>
                    )}
                </div>
                {error && (
                    <p className="rounded-md bg-danger/10 px-3 py-2 text-[11px] font-bold text-danger">{error}</p>
                )}
                {!['ended', 'cancelled'].includes(c.phase) && <LiveChecklist c={c} />}
                {c.phase === 'draft' && (
                    <p className={cn(
                        'rounded-md px-3 py-2 text-[11px] font-bold',
                        c.eligibleProductCount ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning',
                    )}>
                        {c.eligibleProductCount
                            ? 'This is a draft, so sellers can\'t see it yet. Press "Publish & invite sellers" to send the invitations.'
                            : 'No active, approved product matches this campaign yet, so publishing will fail. Edit it and choose categories or products that are live.'}
                    </p>
                )}

                {showReport && report && (
                    <div className="space-y-2">
                        <p className={labelCls}>Results</p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {[
                                ['Orders', report.totals.orders],
                                ['Units sold', report.totals.units],
                                ['Sales', rupees(report.totals.revenue)],
                                ['Discount (seller-funded)', rupees(report.totals.discount)],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-lg bg-slate-50 p-3">
                                    <p className="text-[10px] font-bold text-slate-400">{label}</p>
                                    <p className="text-sm font-black text-slate-900">{value}</p>
                                </div>
                            ))}
                        </div>
                        {report.sellers.length > 0 && (
                            <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                                {report.sellers.map((s) => (
                                    <div key={s.sellerId} className="flex items-center justify-between px-3 py-2 text-[11px] font-bold">
                                        <span>{s.shopName}</span>
                                        <span className="text-slate-500">
                                            {s.orders} orders · {s.units} units · {rupees(s.revenue)} · {rupees(s.discount)} off
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {c.phase !== 'draft' && (
                    <div className="space-y-2">
                        <p className={labelCls}>
                            Sellers: {counts.joined || 0} joined · {counts.declined || 0} declined · {counts.invited || 0} no reply
                        </p>
                        <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                            {(c.participants || []).map((p) => {
                                const [label, variant] = STATUS_BADGE[p.status] || STATUS_BADGE.invited;
                                return (
                                    <div key={p._id} className="space-y-2 px-3 py-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black text-slate-800">{p.sellerId?.shopName || p.sellerId?.name || 'Seller'}</span>
                                            <Badge variant={variant}>{label}{p.status === 'joined' ? ` · ${p.productIds.length}` : ''}</Badge>
                                        </div>
                                        {p.status === 'joined' && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {p.productIds.map((prod) => (
                                                    <span key={prod._id} className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700">
                                                        {prod.name}
                                                        {!['ended', 'cancelled'].includes(c.phase) && (
                                                            <button
                                                                type="button"
                                                                aria-label={`Remove ${prod.name}`}
                                                                disabled={busy}
                                                                onClick={() => run(() => adminApi.removeCampaignProduct(c._id, idOf(p.sellerId), prod._id), 'Removed', `Remove ${prod.name} from the sale?`)}
                                                            >
                                                                <HiOutlineXMark className="h-3.5 w-3.5" />
                                                            </button>
                                                        )}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {!c.participants?.length && <p className="px-3 py-4 text-center text-[11px] text-slate-400">No sellers invited</p>}
                        </div>
                        {joined.length === 0 && c.phase === 'live' && (
                            <p className="text-[11px] font-bold text-warning">No seller joined, so no product is discounted.</p>
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
};

/* ---------------------------------- page ---------------------------------- */
const DiscountCampaigns = () => {
    const { showToast } = useToast();
    const queryClient = useQueryClient();
    const [formFor, setFormFor] = useState(null); // null | 'new' | campaign
    const [openId, setOpenId] = useState(null);

    const { data: campaigns = [], isLoading, isError } = useQuery({
        queryKey: LIST_KEY,
        queryFn: async () => {
            const list = resultOf(await adminApi.getCampaigns());
            return Array.isArray(list) ? list : [];
        },
    });
    const { data: categories = [] } = useQuery({
        queryKey: ['admin', 'allCategoriesForCampaigns'],
        queryFn: async () => {
            const res = await adminApi.getCategories();
            const list = res.data.results || res.data.result || [];
            return Array.isArray(list) ? list : [];
        },
    });

    useEffect(() => {
        if (isError) showToast('Failed to load campaigns', 'error');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isError]);

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: LIST_KEY });
        queryClient.invalidateQueries({ queryKey: ['admin', 'campaign'] });
    };

    const deleteRow = async (c) => {
        if (!window.confirm(`Delete "${c.name}"? This can't be undone.`)) return;
        try {
            await adminApi.deleteCampaign(c._id);
            showToast('Campaign deleted', 'success');
            refresh();
        } catch (e) {
            showToast(errorOf(e, 'Failed to delete campaign'), 'error');
        }
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title="Discount Campaigns"
                description="Create a sale, invite sellers, and only the products sellers join get the discount. Sellers fund it."
                actions={
                    <Button onClick={() => setFormFor('new')}>
                        <HiOutlinePlus className="h-4 w-4" /> New Campaign
                    </Button>
                }
            />

            <Card className="overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-slate-100 p-4">
                    <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Campaigns ({campaigns.length})</h2>
                    {isLoading && <span className="text-[10px] font-bold text-slate-400">Loading...</span>}
                </div>
                <div className="divide-y divide-slate-50">
                    {campaigns.map((c) => {
                        const phase = PHASE_META[c.phase] || PHASE_META.draft;
                        return (
                            <div
                                key={c._id}
                                className="flex w-full flex-col gap-2 px-4 py-4 transition-colors hover:bg-slate-50/60 md:flex-row md:items-center"
                            >
                                <div className="flex-1">
                                    <p className="text-xs font-black text-slate-900">{c.name}</p>
                                    <p className="mt-0.5 text-[10px] font-bold text-slate-500">
                                        {formatDateTime(c.startAt)} → {formatDateTime(c.endAt)} · join by {formatDateTime(c.joinDeadline)}
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="primary">{c.discountLabel}</Badge>
                                    <Badge variant={phase.variant}>{phase.label}</Badge>
                                    {c.phase !== 'draft' && (
                                        <span className="text-[10px] font-bold text-slate-500">
                                            {c.stats.joined} joined · {c.stats.joinedProducts} products · {c.stats.invited} no reply
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <Button size="sm" onClick={() => setOpenId(c._id)}>
                                        {c.phase === 'draft' ? 'Open & publish' : 'Manage'}
                                    </Button>
                                    {!['live', 'paused'].includes(c.phase) && (
                                        <Button size="sm" variant="outline" aria-label={`Delete ${c.name}`} onClick={() => deleteRow(c)}>
                                            <HiOutlineTrash className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {!isLoading && campaigns.length === 0 && (
                        <div className="p-4">
                            <EmptyState
                                icon={<HiOutlineMegaphone className="h-6 w-6" />}
                                title="No campaigns yet"
                                description='Click "New Campaign" to plan your first sale.'
                            />
                        </div>
                    )}
                </div>
            </Card>

            {formFor && (
                <CampaignForm
                    editing={formFor === 'new' ? null : formFor}
                    categories={categories}
                    onClose={() => setFormFor(null)}
                    onSaved={(saved) => { setFormFor(null); refresh(); if (saved?._id) setOpenId(saved._id); }}
                />
            )}
            {openId && !formFor && (
                <CampaignDetail
                    campaignId={openId}
                    onClose={() => setOpenId(null)}
                    onEdit={(c) => setFormFor(c)}
                    onChanged={refresh}
                />
            )}
        </div>
    );
};

export default DiscountCampaigns;
