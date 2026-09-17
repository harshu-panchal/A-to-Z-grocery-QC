import React, { useState, useEffect } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import PageHeader from '@shared/components/ui/PageHeader';
import EmptyState from '@shared/components/ui/EmptyState';
import Pagination from '@shared/components/ui/Pagination';
import { adminApi } from '../services/adminApi';
import {
    HiOutlineStar,
    HiOutlineTrash,
    HiOutlineShieldCheck,
    HiOutlineExclamationTriangle,
    HiOutlineChatBubbleBottomCenterText,
    HiOutlineBuildingStorefront
} from 'react-icons/hi2';
import { useToast } from '@shared/components/ui/Toast';
import Modal from '@shared/components/ui/Modal';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';

const REVIEWS_QUERY_ROOT = ['admin', 'pendingReviews'];

const ReviewModeration = () => {
    const { showToast } = useToast();
    const queryClient = useQueryClient();
    const [isReplyModalOpen, setIsReplyModalOpen] = useState(false);
    const [selectedReview, setSelectedReview] = useState(null);
    const [replyText, setReplyText] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    useEffect(() => {
        setPage(1);
    }, [pageSize]);

    const queryParams = useMemo(() => ({ page, limit: pageSize }), [page, pageSize]);
    const queryKey = [...REVIEWS_QUERY_ROOT, queryParams];

    // Perf audit Phase 8: migrated to React Query.
    const { data: queryData, isFetching: loading, isError } = useQuery({
        queryKey,
        queryFn: async () => {
            const res = await adminApi.getPendingReviews(queryParams);
            if (!res.data.success) throw new Error('Failed to load reviews');
            const payload = res.data.result || {};
            const data = Array.isArray(payload.items) ? payload.items : (res.data.results || []);
            const mapped = data.map(r => ({
                ...r,
                id: r._id,
                user: r.userId?.name || "Anonymous",
                item: r.productId?.name || "Deleted Product",
                itemImage: r.productId?.images?.[0],
                date: new Date(r.createdAt).toLocaleString(),
                tags: [] // Tags can be empty or logic-based
            }));
            return {
                items: mapped,
                total: typeof payload.total === 'number' ? payload.total : mapped.length,
                page: typeof payload.page === 'number' ? payload.page : queryParams.page,
            };
        },
        placeholderData: keepPreviousData,
    });

    useEffect(() => {
        if (isError) {
            console.error("Fetch Reviews Error");
            showToast("Failed to load reviews", "error");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isError]);

    const reviews = queryData?.items ?? [];
    const total = queryData?.total ?? 0;

    // Audit fix: approving publishes the review publicly — delete already
    // gates behind a confirmation and approve didn't.
    const handleApprove = async (id) => {
        if (!window.confirm('Approve this review? It will be published immediately.')) return;
        try {
            const res = await adminApi.updateReviewStatus(id, 'approved');
            if (res.data.success) {
                queryClient.setQueryData(queryKey, (old) =>
                    old ? { ...old, items: old.items.filter(r => r.id !== id) } : old,
                );
                queryClient.invalidateQueries({ queryKey: REVIEWS_QUERY_ROOT });
                showToast('Review approved and published', 'success');
            }
        } catch (error) {
            showToast("Failed to approve review", "error");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to reject and remove this review?')) return;
        try {
            const res = await adminApi.updateReviewStatus(id, 'rejected');
            if (res.data.success) {
                queryClient.setQueryData(queryKey, (old) =>
                    old ? { ...old, items: old.items.filter(r => r.id !== id) } : old,
                );
                queryClient.invalidateQueries({ queryKey: REVIEWS_QUERY_ROOT });
                showToast('Review rejected and removed', 'warning');
            }
        } catch (error) {
            showToast("Failed to remove review", "error");
        }
    };

    const handleReplyClick = (review) => {
        setSelectedReview(review);
        setIsReplyModalOpen(true);
    };

    const submitReply = () => {
        if (!replyText.trim()) return;
        // Reply logic for reviews is usually public or private.
        // For now we'll just show toast since we don't have review-reply model yet
        showToast(`Reply noted for ${selectedReview.user}`, 'success');
        setIsReplyModalOpen(false);
        setReplyText('');
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title="Moderation Suite"
                description="Protect community integrity and store reputations."
                actions={
                    <div className="flex rounded-xl bg-slate-100 p-1">
                        <button className="rounded-lg bg-white px-4 py-2 text-[10px] font-black uppercase text-slate-900 shadow-sm">All Reviews</button>
                        <button className="rounded-lg px-4 py-2 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600">Flagged Only</button>
                    </div>
                }
            />

            {!loading && reviews.length === 0 ? (
                <EmptyState
                    icon={<HiOutlineChatBubbleBottomCenterText className="h-6 w-6" />}
                    title="No reviews to moderate"
                    description="New customer reviews will appear here for approval."
                />
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {reviews.map((r) => (
                        <Card key={r.id} className="relative overflow-hidden p-5">
                            <div className="flex flex-col gap-5 lg:flex-row">
                                {/* User Info & Rating */}
                                <div className="shrink-0 space-y-3 lg:w-56">
                                    <div className="flex items-center gap-3">
                                        <img
                                            src="https://cdn-icons-png.flaticon.com/512/149/149071.png"
                                            alt=""
                                            className="h-11 w-11 rounded-xl border border-slate-100 bg-slate-50 object-cover"
                                        />
                                        <div>
                                            <h4 className="text-sm font-black text-slate-900">{r.user}</h4>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{r.date}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {[...Array(5)].map((_, i) => (
                                            <HiOutlineStar
                                                key={i}
                                                className={cn("h-4 w-4", i < r.rating ? "fill-warning text-warning" : "text-slate-200")}
                                            />
                                        ))}
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <HiOutlineBuildingStorefront className="h-4 w-4" />
                                            <span className="text-[11px] font-bold">{r.store}</span>
                                        </div>
                                        <p className="text-[10px] font-black uppercase tracking-tight text-primary">Item: {r.item}</p>
                                    </div>
                                </div>

                                {/* Comment & Status */}
                                <div className="flex-1 space-y-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        {r.status === 'flagged' && (
                                            <Badge variant="danger" className="flex items-center gap-1">
                                                <HiOutlineExclamationTriangle className="h-3 w-3" />
                                                Flagged by System
                                            </Badge>
                                        )}
                                        {r.tags.map((tag, i) => (
                                            <Badge key={i} variant="secondary">{tag}</Badge>
                                        ))}
                                    </div>
                                    <blockquote className="rounded-xl border-l-4 border-slate-200 bg-slate-50 p-4 text-sm font-medium italic leading-relaxed text-slate-700">
                                        "{r.comment}"
                                    </blockquote>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center justify-center gap-2.5 lg:w-44 lg:flex-col">
                                    {r.status !== 'approved' && (
                                        <Button className="w-full" onClick={() => handleApprove(r.id)}>
                                            <HiOutlineShieldCheck className="h-4 w-4" />
                                            Approve
                                        </Button>
                                    )}
                                    <Button variant="danger" className="w-full" onClick={() => handleDelete(r.id)}>
                                        <HiOutlineTrash className="h-4 w-4" />
                                        Remove
                                    </Button>
                                    <Button variant="outline" className="w-full" onClick={() => handleReplyClick(r)}>
                                        Reply
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <div className="flex justify-center">
                <Pagination
                    page={queryData?.page ?? page}
                    totalPages={Math.ceil(total / pageSize) || 1}
                    total={total}
                    pageSize={pageSize}
                    onPageChange={(p) => setPage(p)}
                    onPageSizeChange={(newSize) => {
                        setPageSize(newSize);
                        setPage(1);
                    }}
                    loading={loading}
                />
            </div>

            <Modal
                isOpen={isReplyModalOpen}
                onClose={() => setIsReplyModalOpen(false)}
                title="Send Public Response"
            >
                <div className="space-y-4">
                    {selectedReview && (
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Review from {selectedReview.user}</p>
                            <p className="text-xs font-medium italic text-slate-600">"{selectedReview.comment}"</p>
                        </div>
                    )}
                    <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Write your official response..."
                        className="min-h-[120px] w-full rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                    <div className="flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={() => setIsReplyModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button className="flex-1" onClick={submitReply}>
                            Publish Reply
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ReviewModeration;
