import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HiOutlineMegaphone } from 'react-icons/hi2';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import Modal from '@shared/components/ui/Modal';
import PageHeader from '@shared/components/ui/PageHeader';
import EmptyState from '@shared/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import { PHASE_META, formatDateTime, timeLeft, rupees } from '@shared/utils/campaignUi';
import { sellerApi } from '../services/sellerApi';

const LIST_KEY = ['seller', 'campaigns'];
const resultOf = (res) => res?.data?.result ?? res?.data?.results ?? res?.data;
const errorOf = (e, fallback) => e?.response?.data?.message || fallback;

const ANSWER = {
    invited: ['Waiting for your answer', 'warning'],
    joined: ['Joined', 'success'],
    declined: ['Declined', 'secondary'],
};

const TABS = [
    { id: 'open', label: 'Invitations', match: (r) => r.canRespond },
    { id: 'joined', label: 'Joined', match: (r) => !r.canRespond && r.participationStatus === 'joined' && ['live', 'paused', 'inviting'].includes(r.campaign.phase) },
    { id: 'past', label: 'Past', match: (r) => !r.canRespond && !(r.participationStatus === 'joined' && ['live', 'paused', 'inviting'].includes(r.campaign.phase)) },
];

/* -------------------------- one campaign (modal) -------------------------- */
const CampaignSheet = ({ campaignId, onClose, onChanged }) => {
    const [selected, setSelected] = useState(null); // Set of product ids
    const [busy, setBusy] = useState(false);
    const { data, refetch } = useQuery({
        queryKey: ['seller', 'campaign', campaignId],
        queryFn: async () => resultOf(await sellerApi.getCampaign(campaignId)),
    });

    useEffect(() => {
        if (!data || selected) return;
        const joined = data.products.filter((p) => p.joined).map((p) => String(p._id));
        // first visit: pre-tick everything that can join
        const initial = data.participationStatus === 'joined'
            ? joined
            : data.products.filter((p) => !p.blockedReason).map((p) => String(p._id));
        setSelected(new Set(initial));
    }, [data, selected]);

    const totals = useMemo(() => {
        if (!data || !selected) return null;
        return data.products
            .filter((p) => selected.has(String(p._id)))
            .reduce((t, p) => ({ count: t.count + 1, payoutLoss: t.payoutLoss + (p.payoutNow - p.payoutAfter) }), { count: 0, payoutLoss: 0 });
    }, [data, selected]);

    if (!data || !selected) {
        return (
            <Modal isOpen onClose={onClose} size="xl" title="Campaign">
                <p className="py-8 text-center text-xs font-bold text-slate-400">Loading...</p>
            </Modal>
        );
    }

    const { campaign, canRespond } = data;
    const toggle = (id) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelected(next);
    };
    const joinable = data.products.filter((p) => !p.blockedReason);
    const allOn = joinable.length > 0 && joinable.every((p) => selected.has(String(p._id)));

    const act = async (fn) => {
        setBusy(true);
        try {
            const res = await fn();
            toast.success(res?.data?.message || 'Saved');
            await refetch();
            onChanged();
        } catch (e) {
            toast.error(errorOf(e, 'Could not save'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal isOpen onClose={onClose} size="xl" title={campaign.name}>
            <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="primary">{campaign.discountLabel}</Badge>
                    <Badge variant={(PHASE_META[campaign.phase] || PHASE_META.ended).variant}>{(PHASE_META[campaign.phase] || PHASE_META.ended).label}</Badge>
                    <span className="text-[11px] font-bold text-slate-500">
                        Sale {formatDateTime(campaign.startAt)} → {formatDateTime(campaign.endAt)}
                    </span>
                </div>
                {campaign.description && <p className="text-xs text-slate-600">{campaign.description}</p>}
                <p className="rounded-md bg-warning/10 px-3 py-2 text-[11px] font-bold text-warning">
                    You fund this discount. Your payout per unit drops as shown below.
                    {canRespond
                        ? ` You can change your answer until ${formatDateTime(campaign.joinDeadline)}. After that you're locked in for the whole sale.`
                        : ' Joining is closed for this campaign.'}
                </p>

                <div className="overflow-x-auto rounded-lg border border-slate-100">
                    <table className="w-full min-w-[560px] text-left text-[11px]">
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-400">
                            <tr>
                                <th className="px-3 py-2">
                                    {canRespond && (
                                        <input
                                            type="checkbox"
                                            aria-label="Select all"
                                            checked={allOn}
                                            onChange={() => setSelected(new Set(allOn ? [] : joinable.map((p) => String(p._id))))}
                                        />
                                    )}
                                </th>
                                <th className="px-3 py-2">Product</th>
                                <th className="px-3 py-2">Price</th>
                                <th className="px-3 py-2">Sale price</th>
                                <th className="px-3 py-2">You get now</th>
                                <th className="px-3 py-2">You&apos;ll get</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {data.products.map((p) => {
                                const id = String(p._id);
                                const blocked = Boolean(p.blockedReason);
                                return (
                                    <tr key={id} className={cn(blocked && 'opacity-60')}>
                                        <td className="px-3 py-2">
                                            <input
                                                type="checkbox"
                                                aria-label={`Include ${p.name}`}
                                                disabled={!canRespond || blocked}
                                                checked={selected.has(id)}
                                                onChange={() => toggle(id)}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <p className="font-bold text-slate-800">{p.name}</p>
                                            {p.variantCount > 0 && <p className="text-[10px] text-slate-400">All {p.variantCount} sizes get the same discount</p>}
                                            {blocked && <p className="text-[10px] font-bold text-danger">{p.blockedReason}</p>}
                                            {p.removedByAdmin && <p className="text-[10px] font-bold text-danger">Removed from the sale by admin</p>}
                                        </td>
                                        <td className="px-3 py-2 font-bold">{rupees(p.regularPrice)}</td>
                                        <td className="px-3 py-2 font-bold text-success">{rupees(p.salePrice)}</td>
                                        <td className="px-3 py-2">{rupees(p.payoutNow)}</td>
                                        <td className="px-3 py-2 font-bold">{rupees(p.payoutAfter)}</td>
                                    </tr>
                                );
                            })}
                            {!data.products.length && (
                                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">None of your active products match this campaign any more.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {canRespond && (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-[11px] font-bold text-slate-500">
                            {totals.count} product(s) selected · if one of each sells, you get {rupees(totals.payoutLoss)} less
                        </p>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                disabled={busy || data.participationStatus === 'declined'}
                                onClick={() => window.confirm('Decline this campaign? Your prices stay normal.') && act(() => sellerApi.declineCampaign(campaignId))}
                            >
                                Decline
                            </Button>
                            <Button
                                disabled={busy || !totals.count}
                                onClick={() => act(() => sellerApi.joinCampaign(campaignId, [...selected]))}
                            >
                                {data.participationStatus === 'joined' ? 'Save products' : `Join with ${totals.count} product(s)`}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

/* ---------------------------------- page ---------------------------------- */
const Campaigns = () => {
    const queryClient = useQueryClient();
    const [tab, setTab] = useState('open');
    const [openId, setOpenId] = useState(null);
    const { data: rows = [], isLoading } = useQuery({
        queryKey: LIST_KEY,
        queryFn: async () => {
            const list = resultOf(await sellerApi.getCampaigns());
            return Array.isArray(list) ? list : [];
        },
    });

    const visible = rows.filter(TABS.find((t) => t.id === tab).match);
    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: LIST_KEY });
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title="Sale Campaigns"
                description="Admin invites you to sales. You choose which of your products join. Nothing is discounted unless you join."
            />

            <div className="flex gap-1 rounded-lg bg-slate-100 p-1 sm:w-fit">
                {TABS.map((t) => {
                    const count = rows.filter(t.match).length;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            className={cn(
                                'flex-1 rounded-md px-4 py-2 text-xs font-bold sm:flex-none',
                                tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
                            )}
                        >
                            {t.label}{count ? ` (${count})` : ''}
                        </button>
                    );
                })}
            </div>

            <Card className="overflow-hidden p-0">
                <div className="divide-y divide-slate-50">
                    {visible.map((r) => {
                        const c = r.campaign;
                        const [answer, variant] = ANSWER[r.participationStatus] || ANSWER.invited;
                        const left = r.canRespond ? timeLeft(c.joinDeadline) : '';
                        return (
                            <button
                                key={c._id}
                                type="button"
                                onClick={() => setOpenId(c._id)}
                                className="flex w-full flex-col gap-2 px-4 py-4 text-left hover:bg-slate-50/60 md:flex-row md:items-center"
                            >
                                <div className="flex-1">
                                    <p className="text-xs font-black text-slate-900">{c.name}</p>
                                    <p className="mt-0.5 text-[10px] font-bold text-slate-500">
                                        Sale {formatDateTime(c.startAt)} → {formatDateTime(c.endAt)}
                                        {left ? ` · ${left} left to join` : ''}
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="primary">{c.discountLabel}</Badge>
                                    <Badge variant={variant}>
                                        {answer}{r.participationStatus === 'joined' ? ` · ${r.joinedProductCount}` : ''}
                                    </Badge>
                                    {!r.canRespond && (
                                        <Badge variant={(PHASE_META[c.phase] || PHASE_META.ended).variant}>{(PHASE_META[c.phase] || PHASE_META.ended).label}</Badge>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                    {!isLoading && !visible.length && (
                        <div className="p-4">
                            <EmptyState
                                icon={<HiOutlineMegaphone className="h-6 w-6" />}
                                title={tab === 'open' ? 'No invitations right now' : 'Nothing here yet'}
                                description="When admin plans a sale that covers your products, it shows up here."
                            />
                        </div>
                    )}
                    {isLoading && <p className="p-6 text-center text-xs font-bold text-slate-400">Loading...</p>}
                </div>
            </Card>

            {openId && <CampaignSheet campaignId={openId} onClose={() => setOpenId(null)} onChanged={refresh} />}
        </div>
    );
};

export default Campaigns;
