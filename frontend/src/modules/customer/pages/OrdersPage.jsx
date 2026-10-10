import { Skeleton } from '@shared/components/ui/Skeleton';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { onOrderStatusUpdate } from '@/core/services/orderSocket';
import { createSocketTokenReader } from '@core/utils/authStorage';
import { STORAGE_KEYS } from '@core/utils/storage';
import { useNavigate, Link } from 'react-router-dom';
import { Package, ChevronRight, CheckCircle, ChevronLeft } from 'lucide-react';
import { customerApi } from '../services/customerApi';
import { getOrderStatusLabel, getLegacyStatusFromOrder } from '@/shared/utils/orderStatus';
import { applyCloudinaryTransform } from '@/core/utils/imageUtils';

const OrdersPage = () => {
    const navigate = useNavigate();

    // Perf audit Phase 8: migrated to React Query.
    const { data: orders = [], isLoading: loading } = useQuery({
        queryKey: ['customer', 'myOrders'],
        queryFn: async () => {
            try {
                const response = await customerApi.getMyOrders();
                // Backend uses handleResponse():
                // - arrays => { results: [...] }
                // - objects => { result: { items: [...] } }
                const payload = response?.data;
                const items =
                    payload?.result?.items ||
                    payload?.results ||
                    [];
                return Array.isArray(items) ? items : [];
            } catch (error) {
                console.error("Failed to fetch orders:", error);
                const apiMessage = error?.response?.data?.message;
                // Orders page is a primary screen; surface failures instead of silently showing empty state.
                if (apiMessage) {
                    console.warn("[OrdersPage] API error:", apiMessage);
                }
                return [];
            }
        },
    });

    // Live: refresh the list whenever any of this customer's orders changes status
    const queryClient = useQueryClient();
    useEffect(() => {
        const getToken = createSocketTokenReader(STORAGE_KEYS.AUTH_CUSTOMER);
        let timer = null;
        const off = onOrderStatusUpdate(getToken, () => {
            clearTimeout(timer);
            timer = setTimeout(() => queryClient.invalidateQueries({ queryKey: ['customer', 'myOrders'] }), 400);
        });
        return () => {
            off();
            clearTimeout(timer);
        };
    }, [queryClient]);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 pb-24">
                <div className="sticky top-0 z-30 bg-slate-50/95 px-4 pt-4 pb-3 border-b border-slate-200/60 mb-4">
                    <h1 className="text-xl font-semibold text-slate-900 tracking-tight pl-11">My Orders</h1>
                </div>
                <div className="space-y-4 px-4" role="status" aria-label="Loading your orders">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between">
                                <Skeleton className="h-4 w-28" />
                                <Skeleton className="h-6 w-20 rounded-full" />
                            </div>
                            <div className="mt-4 flex gap-2">
                                <Skeleton className="h-12 w-12 rounded-lg" />
                                <Skeleton className="h-12 w-12 rounded-lg" />
                                <Skeleton className="h-12 w-12 rounded-lg" />
                            </div>
                            <div className="mt-4 flex items-center justify-between">
                                <Skeleton className="h-3 w-24" />
                                <Skeleton className="h-4 w-14" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-24">
            <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-sm px-4 pt-4 pb-3 border-b border-slate-200/60 mb-4 flex items-center gap-2">
                <button
                    onClick={() => navigate(-1)}
                    className="w-10 h-10 flex items-center justify-center hover:bg-slate-200/70 rounded-full transition-colors -ml-1"
                >
                    <ChevronLeft size={22} className="text-slate-800" />
                </button>
                <h1 className="text-xl font-semibold text-slate-900 tracking-tight">My Orders</h1>
            </div>

            <div className="space-y-4 px-4 pb-2">
                {orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Package size={56} className="text-slate-300 mb-4" />
                        <h3 className="text-base font-semibold text-slate-900 mb-1">No orders yet</h3>
                        <p className="text-slate-500 text-sm mb-6 max-w-[260px]">
                            When you place an order, it will appear here so you can track it easily.
                        </p>
                        <Link to="/" className="inline-flex h-11 items-center bg-primary hover:opacity-90 text-primary-foreground px-7 rounded-xl font-semibold text-sm shadow-sm transition-opacity">
                            Start Shopping
                        </Link>
                    </div>
                ) : (
                    orders.map((order) => {
                        const legacy = getLegacyStatusFromOrder(order);
                        return (
                        <Link
                            to={`/orders/${order.orderId}`}
                            key={order._id}
                            className="block bg-white rounded-2xl px-4 py-3.5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] border border-slate-100/80 active:scale-[0.985] transition-transform cursor-pointer hover:shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
                        >
                            <div className="flex justify-between items-start gap-3 mb-3.5">
                                <div className="flex gap-3.5 flex-1 min-w-0">
                                    <div className="h-12 w-12 rounded-xl overflow-hidden flex items-center justify-center bg-slate-50 ring-1 ring-slate-200/90 shrink-0">
                                        {order.items[0]?.image ? (
                                            <img
                                                src={applyCloudinaryTransform(order.items[0].image)}
                                                alt={order.items[0]?.name || 'Order thumbnail'}
                                                loading="lazy"
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <Package size={22} className="text-slate-400" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-semibold text-slate-900 text-sm tracking-tight leading-snug">
                                            Order #{order.orderId.slice(-6)}
                                        </h3>
                                        <p className="mt-0.5 whitespace-nowrap text-[11px] text-slate-500 font-medium leading-tight">
                                            {new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}{' '}
                                            <span className="mx-1 text-slate-400">•</span>
                                            {new Date(order.createdAt).toLocaleTimeString('en-IN', {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </p>
                                        {/* status lives under the title: long return labels used to
                                            push into (and print over) the order number on phones */}
                                        <span
                                            className={`mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-[10px] font-semibold uppercase leading-tight tracking-[0.08em] ${
                                                legacy === 'delivered'
                                                    ? 'bg-brand-50 text-brand-700 border-brand-100'
                                                    : legacy === 'cancelled'
                                                        ? 'bg-rose-50 text-rose-700 border-rose-100'
                                                        : 'bg-brand-50 text-brand-700 border-brand-100'
                                            }`}
                                        >
                                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/80">
                                                <CheckCircle
                                                    size={9}
                                                    className={`${
                                                        legacy === 'delivered'
                                                            ? 'text-brand-600'
                                                            : legacy === 'cancelled'
                                                                ? 'text-rose-500'
                                                                : 'text-brand-500'
                                                    }`}
                                                />
                                            </span>
                                            <span className="min-w-0 break-words">{getOrderStatusLabel(order).toUpperCase()}</span>
                                        </span>
                                    </div>
                                </div>
                                <span className="shrink-0 pt-0.5 text-[10px] font-medium text-slate-400 whitespace-nowrap">
                                    Tap to view
                                </span>
                            </div>

                            <div className="border-t border-slate-100 pt-3 flex justify-between items-center gap-3">
                                <div className="text-[11px] text-slate-500 font-medium truncate flex-1 min-w-0">
                                    {order.items.map((i) => i.name).join(', ')}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[11px] font-medium text-slate-400">Total</span>
                                    <span className="text-sm font-semibold text-slate-900">
                                    ₹{order.pricing.total}
                                    </span>
                                    <ChevronRight size={16} className="text-slate-300" />
                                </div>
                            </div>
                        </Link>
                    );
                    })
                )}
            </div>
        </div>
    );
};

export default OrdersPage;

