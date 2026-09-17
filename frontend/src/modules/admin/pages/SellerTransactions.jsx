import React, { useState, useMemo, useEffect } from 'react';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import Modal from '@shared/components/ui/Modal';
import PageHeader from '@shared/components/ui/PageHeader';
import StatCard from '@shared/components/ui/StatCard';
import FilterBar from '@shared/components/ui/FilterBar';
import DataTable from '@shared/components/ui/DataTable';
import EmptyState from '@shared/components/ui/EmptyState';
import { SkeletonStatCard, SkeletonCard } from '@shared/components/ui/Skeleton';
import Pagination from '@shared/components/ui/Pagination';
import { adminApi } from '../services/adminApi';
import { toast } from 'sonner';
import {
    Receipt,
    Search,
    Filter,
    ArrowUpRight,
    Building2,
    Calendar,
    Download,
    Eye,
    TrendingUp,
    CreditCard,
    Percent,
    ShoppingCart,
    Undo2,
    Banknote,
    Info,
    RotateCw,
    Share2,
    ShoppingBag,
    Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';

function mapSellerTransaction(t) {
    return {
        id: (t.reference || t._id || '').toString().substring(0, 10).toUpperCase(),
        orderId: t.order?.orderId || null,
        date: new Date(t.createdAt).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }),
        seller: t.user?.shopName || t.user?.name || 'Unknown',
        type: t.type === 'Seller Earning' ? 'sale' :
            (t.type === 'Withdrawal' || t.type === 'Payout') ? 'payout' :
                t.type.toLowerCase(),
        amount: t.amount,
        commissionRate: t.order?.pricing?.platformFeeRate || 0,
        commissionAmount: t.order?.pricing?.platformFee || 0,
        taxAmount: t.order?.pricing?.tax || 0,
        netPayable: t.amount,
        status: t.status.toLowerCase(),
        paymentMethod: t.paymentMethod || 'Wallet',
        bankDetails: t.bankDetails || t.user?.bankDetails || 'N/A',
        items: t.order?.items?.map(item => ({
            name: item.product?.name || 'Unknown Item',
            qty: item.quantity,
            price: item.price
        })) || []
    };
}

const SellerTransactions = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterType, setFilterType] = useState('all');
    const [selectedSeller, setSelectedSeller] = useState('all');
    const [selectedTxn, setSelectedTxn] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    // Perf audit Phase 8: migrated to React Query — same 500ms debounce and
    // "any filter change resets to page 1" behavior as before.
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm.trim());
            setPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        setPage(1);
    }, [pageSize, filterStatus, filterType, selectedSeller]);

    const queryParams = useMemo(() => {
        const params = { page, limit: pageSize };
        if (debouncedSearchTerm) params.search = debouncedSearchTerm;
        if (filterStatus !== 'all') params.status = filterStatus;
        if (filterType !== 'all') params.type = filterType;
        if (selectedSeller !== 'all') params.sellerId = selectedSeller;
        return params;
    }, [page, pageSize, debouncedSearchTerm, filterStatus, filterType, selectedSeller]);

    const { data: queryData, isLoading, isFetching, isError } = useQuery({
        queryKey: ['admin', 'sellerTransactions', queryParams],
        queryFn: async () => {
            const res = await adminApi.getSellerTransactions(queryParams);
            if (!res.data.success) throw new Error('Failed to fetch transactions');
            const payload = res.data.result || {};
            const data = Array.isArray(payload.items) ? payload.items : (res.data.results || []);
            const mapped = data.map(mapSellerTransaction);
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
            toast.error("Failed to fetch transactions");
        }
    }, [isError]);

    const transactions = queryData?.items ?? [];
    const total = queryData?.total ?? 0;
    const loading = isLoading;

    const sellers = useMemo(() => {
        const unique = Array.from(new Set(transactions.map(t => t.seller)));
        return unique.map(name => ({ id: name, name }));
    }, [transactions]);

    const stats = useMemo(() => {
        return {
            totalGross: transactions.filter(t => t.type === 'sale').reduce((acc, t) => acc + t.amount, 0),
            totalCommission: transactions.filter(t => t.type === 'sale').reduce((acc, t) => acc + (t.commissionAmount || 0), 0),
            totalPayouts: Math.abs(transactions.filter(t => t.type === 'payout').reduce((acc, t) => acc + t.amount, 0)),
            pendingSettlements: transactions.filter(t => t.status === 'pending').reduce((acc, t) => acc + Math.abs(t.amount), 0)
        };
    }, [transactions]);

    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            const matchesSearch = t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (t.orderId && t.orderId.toLowerCase().includes(searchTerm.toLowerCase())) ||
                t.seller.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = filterStatus === 'all' || t.status === filterStatus;
            const matchesType = filterType === 'all' || t.type === filterType;
            const matchesSeller = selectedSeller === 'all' || t.seller === selectedSeller;

            return matchesSearch && matchesStatus && matchesType && matchesSeller;
        });
    }, [transactions, searchTerm, filterStatus, filterType, selectedSeller]);

    const handleExport = async () => {
        try {
            setIsExporting(true);
            toast.loading("Generating Master Ledger...", { id: "export-ledger" });

            const params = { page: 1, limit: 5000 };
            if (searchTerm.trim()) params.search = searchTerm.trim();
            if (filterStatus !== 'all') params.status = filterStatus;
            if (filterType !== 'all') params.type = filterType;
            if (selectedSeller !== 'all') params.sellerId = selectedSeller;

            const res = await adminApi.getSellerTransactions(params);
            if (!res.data.success) throw new Error("Failed to fetch data");

            const payload = res.data.result || {};
            const items = Array.isArray(payload.items) ? payload.items : (res.data.results || []);

            if (!items.length) {
                toast.error("No transactions found to export", { id: "export-ledger" });
                return;
            }

            const csvRows = [];
            csvRows.push(['Date', 'Time', 'Shop Name', 'Transaction Type', 'Amount (INR)', 'Commission (INR)', 'Net Payable (INR)', 'Status', 'Reference ID', 'Order ID', 'Payment Method'].join(','));

            items.forEach(t => {
                const dt = new Date(t.createdAt);
                const date = dt.toLocaleDateString('en-IN');
                const time = dt.toLocaleTimeString('en-IN');
                const seller = `"${(t.user?.shopName || t.user?.name || 'Unknown').replace(/"/g, '""')}"`;

                const rawType = t.type || '';
                const type = rawType === 'Seller Earning' ? 'Sale' : (rawType === 'Withdrawal' || rawType === 'Payout') ? 'Payout' : rawType;

                const amount = t.amount || 0;
                const commission = t.order?.pricing?.platformFee || 0;
                const netPayable = amount;

                const status = (t.status || 'Unknown').toUpperCase();
                const ref = t.reference || t._id || 'N/A';
                const orderId = t.order?.orderId || 'N/A';
                const method = t.paymentMethod || 'Wallet';

                csvRows.push([date, time, seller, type, amount, commission, netPayable, status, ref, orderId, method].join(','));
            });

            const csvString = csvRows.join('\n');
            const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `master_ledger_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast.success("Master Ledger downloaded successfully", { id: "export-ledger" });
        } catch (error) {
            console.error("Export error:", error);
            toast.error("Failed to generate ledger", { id: "export-ledger" });
        } finally {
            setIsExporting(false);
        }
    };

    const handleDownloadVoucher = async () => {
        try {
            const { default: jsPDF } = await import('jspdf');
            const doc = new jsPDF();
            const safeId = (selectedTxn.id || 'txn').substring(0, 10).replace(/[/\\?%*:|"<>]/g, '-');
            const margin = 25;
            const pageWidth = doc.internal.pageSize.getWidth();
            let y = 28;

            doc.setFontSize(22);
            doc.setFont(undefined, 'bold');
            doc.text('Transaction Voucher', margin, y);
            y += 16;

            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.5);
            doc.line(margin, y, pageWidth - margin, y);
            y += 14;

            const typeLabel = selectedTxn.type === 'sale' ? 'ORDER PAYMENT' : selectedTxn.type === 'payout' ? 'PAYOUT' : (selectedTxn.type || '').toUpperCase();
            const row = (label, value, labelBold = false) => {
                doc.setFont(undefined, labelBold ? 'bold' : 'normal');
                doc.setFontSize(10);
                doc.text(label, margin, y);
                doc.setFont(undefined, 'normal');
                doc.text(String(value), margin + 55, y);
                y += 8;
            };

            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.text('Transaction ID:', margin, y);
            doc.setFont(undefined, 'normal');
            const displayId = (selectedTxn.id || 'N/A').substring(0, 10);
            const splitId = doc.splitTextToSize(displayId, pageWidth - margin - 60);
            doc.text(splitId, margin + 55, y);
            y += (splitId.length * 5) + 5;

            row('Amount:', `Rs. ${Math.abs(selectedTxn.amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);
            row('Date:', selectedTxn.date || 'N/A');
            row('Type:', typeLabel);
            row('Status:', (selectedTxn.status || '').toUpperCase());

            y += 8;
            doc.setDrawColor(220, 220, 220);
            doc.line(margin, y, pageWidth - margin, y);
            y += 14;

            doc.setFont(undefined, 'bold');
            doc.text('Merchant:', margin, y);
            doc.setFont(undefined, 'normal');
            doc.text(selectedTxn.seller || 'N/A', margin + 55, y);
            y += 10;

            row('Payment:', selectedTxn.paymentMethod || 'N/A');
            if (selectedTxn.referenceId) row('Reference:', selectedTxn.referenceId);
            row('Bank:', selectedTxn.bankDetails || 'N/A');

            y = doc.internal.pageSize.getHeight() - 20;
            doc.setDrawColor(240, 240, 240);
            doc.line(margin, y - 8, pageWidth - margin, y - 8);
            doc.setFontSize(8);
            doc.setTextColor(120, 120, 120);
            doc.text(`Generated on ${new Date().toLocaleString()} • Voucher ID: ${safeId}`, pageWidth / 2, y, { align: 'center' });
            doc.setTextColor(0, 0, 0);

            doc.save(`transaction-voucher-${safeId}.pdf`);
            toast.success('Voucher downloaded as PDF');
        } catch (err) {
            console.error('PDF generation error:', err);
            toast.error('Failed to download voucher');
        }
    };

    const handleShareTxn = async () => {
        const shareData = {
            title: 'Transaction Details',
            text: `Transaction ID: ${selectedTxn.id}\nAmount: ₹${Math.abs(selectedTxn.amount)}\nType: ${selectedTxn.type.toUpperCase()}\nStatus: ${selectedTxn.status.toUpperCase()}`
        };
        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (err) {
                if (err.name !== 'AbortError') console.error('Share failed:', err);
            }
        } else {
            navigator.clipboard.writeText(shareData.text);
            toast.success('Transaction details copied to clipboard!');
        }
    };

    const txnColumns = [
        {
            header: 'Txn Details',
            key: 'txn',
            cell: (txn) => (
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg",
                        txn.type === 'sale' ? "bg-primary/10 text-primary" : txn.type === 'payout' ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                    )}>
                        {txn.type === 'sale' ? <ShoppingCart className="h-4.5 w-4.5" /> : txn.type === 'payout' ? <ArrowUpRight className="h-4.5 w-4.5" /> : <Undo2 className="h-4.5 w-4.5" />}
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-tight text-slate-400">{txn.id}</p>
                        <p className="mt-0.5 text-xs font-bold text-slate-900">{txn.date}</p>
                    </div>
                </div>
            ),
        },
        {
            header: 'Shop',
            key: 'shop',
            cell: (txn) => (
                <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-slate-300" />
                    <p className="text-sm font-bold text-slate-700">{txn.seller}</p>
                </div>
            ),
        },
        {
            header: 'Info',
            key: 'info',
            cell: (txn) => (
                <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold uppercase text-slate-400">{txn.type}</span>
                    {txn.orderId && <span className="text-[10px] font-bold uppercase tracking-wide text-primary">{txn.orderId}</span>}
                </div>
            ),
        },
        {
            header: 'Amount',
            key: 'amount',
            align: 'center',
            cell: (txn) => <p className={cn("text-sm font-black", txn.amount > 0 ? "text-slate-900" : "text-danger")}>₹{Math.abs(txn.amount).toLocaleString()}</p>,
        },
        {
            header: 'Summary',
            key: 'summary',
            align: 'center',
            cell: (txn) => txn.type === 'sale' ? (
                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-semibold text-danger">(-₹{txn.commissionAmount})</span>
                    <span className="pt-0.5 text-xs font-black text-success">₹{txn.netPayable.toLocaleString()}</span>
                </div>
            ) : (
                <span className="text-[10px] font-bold text-slate-300">---</span>
            ),
        },
        {
            header: 'Status',
            key: 'status',
            align: 'center',
            cell: (txn) => (
                <Badge variant={txn.status === 'settled' || txn.status === 'processed' || txn.status === 'completed' ? 'success' : 'warning'}>
                    {txn.status}
                </Badge>
            ),
        },
        {
            header: 'Action',
            key: 'action',
            align: 'right',
            cell: (txn) => (
                <button onClick={() => setSelectedTxn(txn)} className="rounded-lg p-2 text-slate-400 transition-all hover:bg-primary/10 hover:text-primary">
                    <Eye className="h-4 w-4" />
                </button>
            ),
        },
    ];

    return (
        <div className="space-y-5">
            <PageHeader
                title={
                    <span className="flex items-center gap-2">
                        Shop Transactions
                        <div className="rounded-lg bg-primary/10 p-1.5">
                            <Receipt className="h-4 w-4 text-primary" />
                        </div>
                    </span>
                }
                description="Track sales, our share, and payments to shops."
                actions={
                    <>
                        <Button variant="outline" onClick={handleExport} isLoading={isExporting}>
                            {!isExporting && <Download className="h-4 w-4" />}
                            {isExporting ? 'Generating Report...' : 'Download Master Ledger'}
                        </Button>
                        <Button onClick={() => navigate('/admin/wallet')}>
                            <TrendingUp className="h-4 w-4" />
                            Revenue Insights
                        </Button>
                    </>
                }
            />

            {loading && transactions.length === 0 ? (
                <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                        {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
                    </div>
                    <SkeletonCard lines={6} />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                        {[
                            { label: 'Total Sales', value: `₹${stats.totalGross.toLocaleString()}`, icon: ShoppingBag, color: 'text-primary', bg: 'bg-primary/10' },
                            { label: 'Our Share', value: `₹${stats.totalCommission.toLocaleString()}`, icon: Percent, color: 'text-warning', bg: 'bg-warning/10' },
                            { label: 'Total Paid Out', value: `₹${stats.totalPayouts.toLocaleString()}`, icon: Banknote, color: 'text-success', bg: 'bg-success/10' },
                            { label: 'Pending Total', value: `₹${stats.pendingSettlements.toLocaleString()}`, icon: Clock, color: 'text-info', bg: 'bg-info/10' },
                        ].map((stat, i) => (
                            <StatCard key={i} label={stat.label} value={stat.value} icon={stat.icon} color={stat.color} bg={stat.bg} />
                        ))}
                    </div>

                    <FilterBar
                        left={
                            <div className="relative w-full sm:w-96">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Filter by Store, Order ID, or Txn Reference..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        }
                        right={
                            <div className="flex flex-wrap items-center gap-2">
                                <select
                                    value={filterType}
                                    onChange={(e) => setFilterType(e.target.value)}
                                    className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                                >
                                    <option value="all">All Types</option>
                                    <option value="sale">Sales Only</option>
                                    <option value="payout">Payouts Only</option>
                                    <option value="refund">Refunds</option>
                                </select>
                                <select
                                    value={selectedSeller}
                                    onChange={(e) => setSelectedSeller(e.target.value)}
                                    className="h-9 max-w-[160px] rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                                >
                                    <option value="all">All Merchants</option>
                                    {sellers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                </select>
                            </div>
                        }
                        pills={['all', 'paid', 'pending'].map((status) => ({
                            label: status,
                            active: filterStatus === status,
                            onClick: () => setFilterStatus(status),
                        }))}
                    />

                    <DataTable
                        columns={txnColumns}
                        data={filteredTransactions}
                        rowKey={(t) => t.id}
                        loading={isFetching && transactions.length > 0}
                        emptyState={
                            <EmptyState
                                icon={<Receipt className="h-6 w-6" />}
                                title="No transactions found"
                                description="No transactions match your current search criteria."
                            />
                        }
                    />

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
                        loading={isFetching}
                    />
                </>
            )}

            {/* Drill-down Detail Modal */}
            <Modal isOpen={!!selectedTxn} onClose={() => setSelectedTxn(null)} title="Transaction Intelligence" size="md">
                {selectedTxn && (
                    <div className="space-y-5">
                        <div className="flex flex-col items-center rounded-xl border border-slate-100 bg-slate-50 p-6 text-center">
                            <div className={cn(
                                "mb-4 flex h-14 w-14 items-center justify-center rounded-xl text-white",
                                selectedTxn.type === 'sale' ? "bg-primary" : selectedTxn.type === 'payout' ? "bg-success" : "bg-danger"
                            )}>
                                {selectedTxn.type === 'sale' ? <ShoppingCart className="h-7 w-7" /> : selectedTxn.type === 'payout' ? <ArrowUpRight className="h-7 w-7" /> : <Undo2 className="h-7 w-7" />}
                            </div>
                            <h2 className="text-2xl font-black tracking-tight text-slate-900">
                                {selectedTxn.amount > 0 ? '' : '-'}₹{Math.abs(selectedTxn.amount).toLocaleString()}
                            </h2>
                            <p className="mt-1.5 text-xs font-bold uppercase tracking-widest text-slate-400">{(selectedTxn.id || '').substring(0, 10)}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Chronology</p>
                                <div className="mt-1 flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-slate-400" />
                                    <p className="text-sm font-bold text-slate-700">{selectedTxn.date}</p>
                                </div>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Merchant Name</p>
                                <div className="mt-1 flex items-center gap-2">
                                    <Building2 className="h-4 w-4 text-slate-400" />
                                    <p className="text-sm font-bold text-slate-700">{selectedTxn.seller}</p>
                                </div>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Payment Pathway</p>
                                <div className="mt-1 flex items-center gap-2">
                                    <CreditCard className="h-4 w-4 text-slate-400" />
                                    <p className="text-sm font-bold text-slate-700">{selectedTxn.paymentMethod}</p>
                                </div>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Gateway Status</p>
                                <div className="mt-1">
                                    <Badge variant={selectedTxn.status === 'settled' ? 'success' : 'warning'}>{selectedTxn.status}</Badge>
                                </div>
                            </div>
                        </div>

                        {selectedTxn.type === 'sale' && (
                            <div className="space-y-3">
                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-900">Financial Drill-Down</h4>
                                <div className="space-y-3 rounded-xl bg-slate-900 p-5 text-white">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="opacity-60">Base Subtotal</span>
                                        <span>₹{selectedTxn.amount}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="opacity-60">Admin Fee ({selectedTxn.commissionRate}%)</span>
                                        <span className="text-warning">-₹{selectedTxn.commissionAmount}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="opacity-60">Tax & Surcharge</span>
                                        <span className="text-warning">-₹{selectedTxn.taxAmount}</span>
                                    </div>
                                    <div className="flex items-center justify-between border-t border-white/10 pt-3">
                                        <span className="text-xs font-bold uppercase tracking-widest">Merchant Net Payable</span>
                                        <span className="text-lg font-black text-success">₹{selectedTxn.netPayable}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedTxn.type === 'payout' && (
                            <div className="space-y-3">
                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-900">Transfer Intel</h4>
                                <div className="space-y-3 rounded-xl border border-success/20 bg-success/5 p-5">
                                    <div className="flex items-center gap-3">
                                        <Info className="h-5 w-5 text-success" />
                                        <p className="text-xs font-bold uppercase tracking-widest text-success">Successful Disbursement</p>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between">
                                            <span className="text-[10px] font-bold uppercase text-slate-500">Reference Identifier</span>
                                            <span className="line-clamp-1 font-mono text-xs font-bold text-slate-900">{selectedTxn.referenceId}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[10px] font-bold uppercase text-slate-500">Settlement Target</span>
                                            <span className="text-xs font-bold text-slate-900">{selectedTxn.bankDetails}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3 pt-1">
                            <Button className="flex-1" onClick={handleDownloadVoucher}>
                                Download Voucher
                            </Button>
                            <button onClick={handleShareTxn} className="flex items-center justify-center rounded-xl bg-slate-100 p-3.5 text-slate-900 transition-all hover:bg-slate-200">
                                <Share2 className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default SellerTransactions;
