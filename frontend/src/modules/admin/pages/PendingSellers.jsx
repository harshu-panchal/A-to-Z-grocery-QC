import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import PageHeader from '@shared/components/ui/PageHeader';
import StatCard from '@shared/components/ui/StatCard';
import FilterBar from '@shared/components/ui/FilterBar';
import DataTable from '@shared/components/ui/DataTable';
import EmptyState from '@shared/components/ui/EmptyState';
import { SkeletonStatCard, SkeletonCard } from '@shared/components/ui/Skeleton';
import {
    HiOutlineBuildingOffice2,
    HiOutlineMagnifyingGlass,
    HiOutlineFunnel,
    HiOutlineCheckCircle,
    HiOutlineXCircle,
    HiOutlineEye,
    HiOutlineEnvelope,
    HiOutlinePhone,
    HiOutlineDocumentText,
    HiOutlineMapPin,
    HiOutlineCalendarDays,
    HiOutlineClock,
    HiOutlineXMark,
    HiOutlineArrowPath,
    HiOutlineArrowTopRightOnSquare
} from 'react-icons/hi2';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { adminApi } from '../services/adminApi';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const PENDING_SELLERS_QUERY_KEY = ['admin', 'pendingSellers'];
const DEFAULT_PENDING_SELLERS_STATS = {
    totalApplications: 0,
    receivedToday: 0,
    missingInfo: 0,
    avgReviewTimeHours: 24
};

const PendingSellers = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState('');
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const [viewingSeller, setViewingSeller] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Perf audit Phase 8: migrated to React Query. Preserved exactly as
    // before: this only ever fetches once on mount (the original effect
    // had an empty dependency array, so `searchTerm` was captured at
    // mount time only and never re-sent to the server — all live filtering
    // happens client-side in `filteredSellers` below) — not "fixing" that
    // quirk here, just caching the same one-time fetch.
    const { data: queryData, isLoading, isError, error } = useQuery({
        queryKey: PENDING_SELLERS_QUERY_KEY,
        queryFn: async () => {
            const response = await adminApi.getPendingSellers({});
            const payload = response.data.result || {};
            const items = Array.isArray(payload.items) ? payload.items : [];
            return {
                items,
                stats: {
                    totalApplications: payload.stats?.totalApplications ?? items.length,
                    receivedToday: payload.stats?.receivedToday ?? 0,
                    missingInfo: payload.stats?.missingInfo ?? items.filter((s) => (s.documents || []).length < 3).length,
                    avgReviewTimeHours: payload.stats?.avgReviewTimeHours ?? 24
                },
            };
        },
    });

    useEffect(() => {
        if (isError) {
            console.error('Failed to fetch pending sellers', error);
            toast.error(error?.response?.data?.message || 'Failed to load seller applications');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isError]);

    const pendingSellers = queryData?.items ?? [];
    const summaryStats = queryData?.stats ?? DEFAULT_PENDING_SELLERS_STATS;

    const stats = useMemo(() => ({
        total: summaryStats.totalApplications,
        today: summaryStats.receivedToday,
        urgent: summaryStats.missingInfo
    }), [summaryStats]);

    const filteredSellers = useMemo(() => {
        return pendingSellers.filter(s =>
            String(s.shopName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(s.ownerName || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [pendingSellers, searchTerm]);

    const handleOpenDocument = (docUrl) => {
        if (!docUrl) return;
        if (docUrl.startsWith('data:')) {
            try {
                const arr = docUrl.split(',');
                const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
                const bstr = atob(arr[1]);
                let n = bstr.length;
                const u8arr = new Uint8Array(n);
                while (n--) {
                    u8arr[n] = bstr.charCodeAt(n);
                }
                const blob = new Blob([u8arr], { type: mime });
                const blobUrl = URL.createObjectURL(blob);
                window.open(blobUrl, '_blank');
            } catch (e) {
                const win = window.open();
                if (win) {
                    win.document.write(`<iframe src="${docUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                }
            }
        } else {
            window.open(docUrl, '_blank', 'noopener,noreferrer');
        }
    };

    const reviewDocuments = useMemo(() => {
        if (!viewingSeller) {
            return [];
        }

        if (Array.isArray(viewingSeller.documentFiles) && viewingSeller.documentFiles.length) {
            return viewingSeller.documentFiles.map((doc) => {
                const url = doc.url || (doc.value ? (
                    /^https?:\/\//i.test(doc.value) || /^data:/i.test(doc.value)
                        ? doc.value
                        : `https://placeholder.co/600x400?text=${encodeURIComponent(`${doc.label || 'Document'}: ${doc.value}`)}`
                ) : '');
                return {
                    ...doc,
                    url,
                    isViewable: Boolean(url),
                };
            });
        }

        return (viewingSeller.documents || []).map((label, index) => ({
            key: `legacy-${index}`,
            label,
            url: `https://placeholder.co/600x400?text=${encodeURIComponent(label)}`,
            fileName: label,
            isViewable: true,
            fileType: 'image'
        }));
    }, [viewingSeller]);

    // Audit fix: approving a seller is what puts them live in front of
    // customers — arguably more consequential than rejecting — yet reject
    // already gates behind a confirmation and approve didn't. Match it.
    const handleApprove = async (id) => {
        if (!window.confirm('Approve this seller? They will be able to list products and receive orders immediately.')) {
            return;
        }
        setIsProcessing(true);
        try {
            await adminApi.approveSeller(id);
            setIsReviewModalOpen(false);
            setViewingSeller(null);
            toast.success('Seller approved successfully');
            await queryClient.invalidateQueries({ queryKey: PENDING_SELLERS_QUERY_KEY });
        } catch (error) {
            console.error('Failed to approve seller', error);
            toast.error(error.response?.data?.message || 'Failed to approve seller');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReject = async (id) => {
        if (window.confirm('Are you sure you want to reject this application?')) {
            setIsProcessing(true);
            try {
                const reason = window.prompt('Optional rejection reason (leave blank if not needed):') || '';
                await adminApi.rejectSeller(id, { reason });
                setIsReviewModalOpen(false);
                setViewingSeller(null);
                toast.success('Seller application rejected');
                await queryClient.invalidateQueries({ queryKey: PENDING_SELLERS_QUERY_KEY });
            } catch (error) {
                console.error('Failed to reject seller', error);
                toast.error(error.response?.data?.message || 'Failed to reject seller');
            } finally {
                setIsProcessing(false);
            }
        }
    };

    const sellerColumns = [
        {
            header: 'Applicant Store',
            key: 'store',
            cell: (s) => (
                <div className="flex cursor-pointer items-center gap-3" onClick={() => navigate(`/admin/sellers/active/${s.id}`)}>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                        <HiOutlineBuildingOffice2 className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-900 hover:text-primary">{s.shopName}</p>
                        <p className="text-[11px] font-medium text-slate-400">{s.ownerName}</p>
                    </div>
                </div>
            ),
        },
        {
            header: 'Documentation',
            key: 'docs',
            cell: (s) => (
                <div className="flex flex-wrap items-center gap-1.5">
                    {(s.documents || []).map((doc, idx) => (
                        <Badge key={idx} variant="info">{doc}</Badge>
                    ))}
                </div>
            ),
        },
        {
            header: 'Applied On',
            key: 'applied',
            cell: (s) => (
                <div>
                    <p className="text-xs font-bold text-slate-700">{s.applicationDate}</p>
                    <p className="text-[11px] font-medium text-slate-400">Received {s.receivedAt || 'Recently'}</p>
                </div>
            ),
        },
        {
            header: 'Actions',
            key: 'actions',
            align: 'right',
            cell: (s) => (
                <div className="flex items-center justify-end gap-2">
                    {s.documents && s.documents.length > 0 && (
                        <button
                            onClick={() => handleApprove(s.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success transition-all hover:bg-success hover:text-white"
                            title="Quick Approve"
                        >
                            <HiOutlineCheckCircle className="h-4.5 w-4.5" />
                        </button>
                    )}
                    <button
                        onClick={() => handleReject(s.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger/10 text-danger transition-all hover:bg-danger hover:text-white"
                        title="Quick Reject"
                    >
                        <HiOutlineXCircle className="h-4.5 w-4.5" />
                    </button>
                    <div className="mx-1 h-4 w-px bg-slate-200" />
                    <button
                        onClick={() => { setViewingSeller(s); setIsReviewModalOpen(true); }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-[11px] font-bold text-white transition-all hover:bg-slate-800"
                    >
                        <HiOutlineEye className="h-3.5 w-3.5" />
                        Review
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-5">
            <PageHeader
                title={
                    <span className="flex items-center gap-2">
                        Pending Approvals
                        <Badge variant="warning">Action Required</Badge>
                    </span>
                }
                description="Check new seller applications before they can start selling."
                actions={
                    <div className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/10 px-3 py-1.5">
                        <HiOutlineClock className="h-3.5 w-3.5 text-warning" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-warning">Avg Review Time: {summaryStats.avgReviewTimeHours}h</span>
                    </div>
                }
            />

            {isLoading && pendingSellers.length === 0 ? (
                <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        {Array.from({ length: 3 }).map((_, i) => <SkeletonStatCard key={i} />)}
                    </div>
                    <SkeletonCard lines={6} />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        {[
                            { label: 'Total Applications', val: stats.total, icon: HiOutlineDocumentText, color: 'text-primary', bg: 'bg-primary/10' },
                            { label: 'Received Today', val: stats.today, icon: HiOutlineCalendarDays, color: 'text-info', bg: 'bg-info/10' },
                            { label: 'Missing Info', val: stats.urgent, icon: HiOutlineXCircle, color: 'text-danger', bg: 'bg-danger/10' },
                        ].map((stat, i) => (
                            <StatCard key={i} label={stat.label} value={stat.val} icon={stat.icon} color={stat.color} bg={stat.bg} />
                        ))}
                    </div>

                    <FilterBar
                        left={
                            <div className="relative w-full sm:w-80">
                                <HiOutlineMagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search by shop name or owner..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        }
                        right={
                            <button className="flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                                <HiOutlineFunnel className="h-4 w-4" />
                                Filter by Date
                            </button>
                        }
                    />

                    <DataTable
                        columns={sellerColumns}
                        data={filteredSellers}
                        rowKey={(s) => s.id}
                        emptyState={
                            <EmptyState
                                icon={<HiOutlineCheckCircle className="h-6 w-6" />}
                                title="All caught up!"
                                description="No pending seller applications right now."
                            />
                        }
                    />
                </>
            )}

            {/* Review Modal */}
            <AnimatePresence>
                {isReviewModalOpen && viewingSeller && (
                    <div className="fixed inset-0 z-[100] overflow-y-auto">
                        <div className="min-h-full flex items-center justify-center p-4 lg:p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 bg-slate-900/80 backdrop-blur-md"
                                onClick={() => setIsReviewModalOpen(false)}
                            />

                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 30 }}
                                className="w-full max-w-4xl relative z-10 bg-white rounded-2xl shadow-2xl overflow-hidden"
                            >
                                <div className="grid grid-cols-1 lg:grid-cols-12">
                                    {/* Sidebar Info */}
                                    <div className="lg:col-span-4 bg-slate-50 p-4 border-r border-slate-100">
                                        <div className="flex justify-between items-start mb-8">
                                            <div className="h-20 w-20 rounded-xl bg-white shadow-md flex items-center justify-center text-3xl font-black text-primary border-4 border-white">
                                                {(viewingSeller.shopName || 'S').charAt(0)}
                                            </div>
                                            <button
                                                onClick={() => setIsReviewModalOpen(false)}
                                                className="lg:hidden p-2 hover:bg-slate-200 rounded-full"
                                            >
                                                <HiOutlineXMark className="h-5 w-5" />
                                            </button>
                                        </div>

                                        <div className="space-y-6">
                                            <div>
                                                <h3 className="text-lg font-bold leading-tight text-slate-900">{viewingSeller.shopName}</h3>
                                                <p className="text-xs font-bold text-primary mt-1 uppercase tracking-widest">{viewingSeller.category || 'General'} Partner</p>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="flex items-center gap-3">
                                                    <HiOutlineBuildingOffice2 className="h-4 w-4 text-slate-400" />
                                                    <span className="text-xs font-bold text-slate-700">{viewingSeller.ownerName}</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <HiOutlineEnvelope className="h-4 w-4 text-slate-400" />
                                                    <span className="text-xs font-semibold text-slate-500">{viewingSeller.email}</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <HiOutlinePhone className="h-4 w-4 text-slate-400" />
                                                    <span className="text-xs font-bold text-slate-700">{viewingSeller.phone}</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <HiOutlineMapPin className="h-4 w-4 text-slate-400" />
                                                    <span className="text-xs font-semibold text-slate-500">{viewingSeller.location}</span>
                                                </div>
                                            </div>

                                            <div className="pt-6 border-t border-slate-200">
                                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Application Memo</h4>
                                                <p className="text-xs font-medium text-slate-600 italic leading-relaxed">
                                                    "{viewingSeller.description}"
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Main Review Section */}
                                    <div className="lg:col-span-8 p-4 lg:p-5 bg-white relative">
                                        <button
                                            onClick={() => setIsReviewModalOpen(false)}
                                            className="hidden lg:block absolute right-8 top-4 p-2 hover:bg-slate-100 rounded-full transition-colors"
                                        >
                                            <HiOutlineXMark className="h-6 w-6 text-slate-300" />
                                        </button>

                                        <div className="space-y-6">
                                            <div>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <HiOutlineDocumentText className="h-5 w-5 text-primary" />
                                                    <h4 className="text-sm font-bold text-slate-900">Submitted Verification Documents</h4>
                                                </div>
                                                <p className="text-xs text-slate-400 font-medium">Check each document before final approval.</p>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {reviewDocuments.length > 0 ? reviewDocuments.map((doc) => (
                                                    <div
                                                        key={doc.key}
                                                        className={cn(
                                                            "rounded-xl border p-4 transition-all",
                                                            doc.isViewable ? "border-slate-100 bg-slate-50 hover:border-primary/20 hover:bg-white" : "border-slate-100 bg-slate-50"
                                                        )}
                                                    >
                                                        <div className="flex items-center justify-between gap-4">
                                                            <div className="flex min-w-0 items-center gap-3">
                                                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                                                                    <HiOutlineDocumentText className="h-5 w-5 text-primary" />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold text-slate-700">{doc.label}</p>
                                                                    <p className={cn("truncate text-[10px] font-bold uppercase tracking-tight", doc.isViewable ? "text-primary" : "text-warning")}>
                                                                        {doc.isViewable
                                                                            ? doc.fileType === 'pdf' ? 'Secure PDF' : 'Secure Image'
                                                                            : 'File Link Not Available'}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {doc.isViewable ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenDocument(doc.url)}
                                                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-slate-800"
                                                                >
                                                                    <HiOutlineArrowTopRightOnSquare className="h-3.5 w-3.5" />
                                                                    View
                                                                </button>
                                                            ) : (
                                                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning">
                                                                    <HiOutlineXMark className="h-3.5 w-3.5" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )) : (
                                                    <div className="md:col-span-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                                                        <p className="text-sm font-bold text-slate-500">No documents were submitted with this application.</p>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="rounded-xl border border-warning/20 bg-warning/10 p-5">
                                                <div className="flex gap-4">
                                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning/20 text-warning">
                                                        <HiOutlineCheckCircle className="h-6 w-6" />
                                                    </div>
                                                    <div>
                                                        <h5 className="text-xs font-bold text-slate-900">Initial Review Passed</h5>
                                                        <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-600">
                                                            Our system automatically checked all basic identity and shop locations. You need to check documents manually now.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Action Bar */}
                                            <div className="flex items-center gap-3 pt-2">
                                                <Button
                                                    variant="outline"
                                                    disabled={isProcessing}
                                                    onClick={() => handleReject(viewingSeller.id)}
                                                    className="flex-1"
                                                >
                                                    Reject Application
                                                </Button>
                                                {reviewDocuments.length > 0 && (
                                                    <Button
                                                        disabled={isProcessing}
                                                        isLoading={isProcessing}
                                                        onClick={() => handleApprove(viewingSeller.id)}
                                                        className="flex-[2]"
                                                    >
                                                        {!isProcessing && <HiOutlineCheckCircle className="h-4 w-4" />}
                                                        {isProcessing ? 'Finalizing...' : 'Approve Seller'}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PendingSellers;
