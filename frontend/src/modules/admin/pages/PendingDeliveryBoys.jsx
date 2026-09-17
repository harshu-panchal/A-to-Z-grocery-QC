import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import PageHeader from '@shared/components/ui/PageHeader';
import FilterBar from '@shared/components/ui/FilterBar';
import DataTable from '@shared/components/ui/DataTable';
import EmptyState from '@shared/components/ui/EmptyState';
import {
    Search,
    FileSearch,
    Phone,
    Mail,
    Truck,
    MapPin,
    Calendar,
    RotateCw,
    Check,
    X,
    ExternalLink,
    ImageOff,
    User,
    Droplets,
    IdCard,
    CreditCard,
    Building2,
    Home,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { adminApi } from '../services/adminApi';

const DOC_LABELS = {
    aadhar: 'Aadhar',
    pan: 'PAN',
    drivingLicense: 'Driving License',
};

const PLACEHOLDER_AVATAR =
    'https://cdn-icons-png.flaticon.com/512/149/149071.png';

function isHttpUrl(value) {
    return /^https?:\/\//i.test(String(value || '').trim());
}

function isProbablyImageUrl(url) {
    const value = String(url || '').toLowerCase();
    if (!isHttpUrl(value)) return false;
    if (/\.(pdf)(\?|#|$)/i.test(value)) return false;
    return (
        /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(value) ||
        value.includes('/image/upload/') ||
        value.includes('res.cloudinary.com')
    );
}

function formatDocumentEntries(documents = {}) {
    if (!documents || typeof documents !== 'object') return [];
    return Object.entries(documents)
        .filter(([, url]) => Boolean(String(url || '').trim()))
        .map(([key, url]) => {
            const href = String(url).trim();
            return {
                key,
                label: DOC_LABELS[key] || key,
                url: href,
                isViewable: isHttpUrl(href),
                isImage: isProbablyImageUrl(href),
            };
        });
}

const PENDING_RIDERS_QUERY_KEY = ['admin', 'pendingDeliveryBoys'];

function mapPendingRider(r) {
    const documentFiles = formatDocumentEntries(r.documents);
    const display = (value, fallback = 'Not provided') => {
        const text = String(value ?? '').trim();
        return text || fallback;
    };
    return {
        id: r._id,
        name: display(r.name, 'Unknown'),
        phone: display(r.phone),
        email: display(r.email),
        address: display(r.address),
        dob: display(r.dob),
        bloodGroup: display(r.bloodGroup),
        preferredArea: display(r.currentArea, display(r.address)),
        avatar: isHttpUrl(r.profileImage) ? r.profileImage : '',
        appliedDate: r.createdAt
            ? new Date(r.createdAt).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
              })
            : '—',
        location: display(r.currentArea, display(r.address, 'Unknown')),
        vehicle: display(r.vehicleType),
        vehicleNumber: display(r.vehicleNumber),
        drivingLicenseNumber: display(r.drivingLicenseNumber),
        aadharNumber: display(r.aadharNumber),
        panNumber: display(r.panNumber),
        accountHolder: display(r.accountHolder),
        accountNumber: display(r.accountNumber),
        ifsc: display(r.ifsc),
        documents: documentFiles.map((d) => d.label),
        documentFiles,
        status: r.isVerified ? 'approved' : 'pending_review',
    };
}

const PendingDeliveryBoys = () => {
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [viewingRider, setViewingRider] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [previewDoc, setPreviewDoc] = useState(null);

    // Perf audit Phase 8: same 500ms debounce as before, now backed by
    // React Query. `filterStatus` never actually fed the request params
    // (it's applied client-side only, below) — the old effect refetched on
    // every filterStatus change anyway even though the response couldn't
    // differ; the query key here is params-only, so that redundant network
    // call no longer happens. No visible change: filteredRiders still
    // recomputes from filterStatus immediately either way.
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm.trim());
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const queryParams = useMemo(() => {
        const params = { verified: 'false' };
        if (debouncedSearchTerm) params.search = debouncedSearchTerm;
        return params;
    }, [debouncedSearchTerm]);

    const { data: pendingRiders = [], isLoading, isError, refetch } = useQuery({
        queryKey: [...PENDING_RIDERS_QUERY_KEY, queryParams],
        queryFn: async () => {
            const response = await adminApi.getDeliveryPartners(queryParams);
            const payload = response.data.result || {};
            const list = Array.isArray(payload.items)
                ? payload.items
                : response.data.results || [];
            return list.map(mapPendingRider);
        },
    });

    useEffect(() => {
        if (isError) {
            console.error('Fetch Pending Riders Error');
            toast.error('Failed to load applications');
        }
    }, [isError]);

    // Perf audit Phase 8: approve/reject used to splice the rider out of
    // page-local state directly for an instant UI update with no refetch —
    // replicate that exact UX by writing the same filtered list straight
    // into the query cache instead of invalidating (which would show a
    // brief loading state before the item disappeared).
    const removeRiderFromCache = (id) => {
        queryClient.setQueryData(
            [...PENDING_RIDERS_QUERY_KEY, queryParams],
            (old) => (Array.isArray(old) ? old.filter((r) => r.id !== id) : old),
        );
    };

    const filteredRiders = useMemo(() => {
        return pendingRiders.filter((r) => {
            const matchesSearch =
                r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                r.phone.includes(searchTerm);

            let matchesStatus = true;
            if (filterStatus === 'pending') {
                matchesStatus = r.status === 'pending_review';
            } else if (filterStatus === 'missing_info') {
                matchesStatus =
                    !r.location ||
                    r.location === 'Unknown' ||
                    r.location === 'Not Specified';
            }

            return matchesSearch && matchesStatus;
        });
    }, [pendingRiders, searchTerm, filterStatus]);

    // Audit fix: approving a rider is what puts them live and able to
    // accept deliveries — reject already gates behind a confirmation and
    // approve didn't. Match it.
    const handleApprove = async (id) => {
        if (!window.confirm('Approve this rider? They will be able to accept deliveries immediately.')) {
            return;
        }
        setIsProcessing(true);
        try {
            await adminApi.approveDeliveryPartner(id);
            toast.success('Rider Approved & Activated!');
            removeRiderFromCache(id);
            setViewingRider(null);
        } catch (error) {
            console.error('Approval Error:', error);
            toast.error('Failed to approve rider');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReject = async (id) => {
        if (window.confirm('Are you sure you want to reject this application?')) {
            setIsProcessing(true);
            try {
                await adminApi.rejectDeliveryPartner(id);
                toast.success('Application Rejected');
                removeRiderFromCache(id);
                setViewingRider(null);
            } catch (error) {
                console.error('Rejection Error:', error);
                toast.error('Failed to reject rider');
            } finally {
                setIsProcessing(false);
            }
        }
    };

    const openDocument = (doc) => {
        if (!doc?.isViewable) {
            toast.error('Document file is not available');
            return;
        }
        if (doc.isImage) {
            setPreviewDoc(doc);
            return;
        }
        window.open(doc.url, '_blank', 'noopener,noreferrer');
    };

    const avatarSrc = (rider) =>
        rider?.avatar && isHttpUrl(rider.avatar)
            ? rider.avatar
            : PLACEHOLDER_AVATAR;

    const riderColumns = [
        {
            header: 'Applicant Details',
            key: 'applicant',
            cell: (rider) => (
                <div className="flex items-center gap-3">
                    <img src={avatarSrc(rider)} alt="" loading="lazy" width="44" height="44" className="h-11 w-11 rounded-full bg-slate-100 object-cover" />
                    <div>
                        <p className="text-sm font-bold text-slate-900">{rider.name}</p>
                        <div className="mt-0.5 flex items-center gap-1.5 text-slate-400">
                            <Phone className="h-3 w-3" />
                            <span className="text-[11px] font-medium">{rider.phone}</span>
                        </div>
                    </div>
                </div>
            ),
        },
        {
            header: 'Operational Intel',
            key: 'intel',
            cell: (rider) => (
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-slate-600">
                        <Truck className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-[11px] font-semibold">{rider.vehicle}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="text-[11px] font-medium">{rider.location}</span>
                    </div>
                </div>
            ),
        },
        {
            header: 'Submission Status',
            key: 'status',
            cell: (rider) => (
                <div className="flex flex-col items-start gap-1.5">
                    <Badge variant={rider.status === 'pending_review' ? 'primary' : 'warning'}>
                        {rider.status.replace('_', ' ')}
                    </Badge>
                    <div className="flex gap-1">
                        {rider.documents.slice(0, 2).map((doc, i) => (
                            <span key={i} className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{doc}</span>
                        ))}
                        {rider.documents.length > 2 && (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400">+{rider.documents.length - 2} more</span>
                        )}
                    </div>
                </div>
            ),
        },
        {
            header: 'Action',
            key: 'action',
            align: 'right',
            cell: (rider) => (
                <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => handleApprove(rider.id)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success transition-all hover:bg-success hover:text-white" title="Approve">
                        <Check className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleReject(rider.id)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger/10 text-danger transition-all hover:bg-danger hover:text-white" title="Reject">
                        <X className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => setViewingRider(rider)}
                        className="ml-1 rounded-lg bg-slate-900 px-3.5 py-2 text-[11px] font-bold text-white transition-all hover:bg-slate-800"
                    >
                        View Application
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
                        Rider Applications
                        <Badge variant="primary">Pending Review</Badge>
                    </span>
                }
                description="Review documents for new delivery partners before they can accept deliveries."
                actions={
                    <>
                        <button
                            type="button"
                            onClick={() => refetch()}
                            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-all hover:text-primary"
                        >
                            <RotateCw className="h-4 w-4" />
                        </button>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-right">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Pending</p>
                            <p className="text-sm font-black text-slate-900">{pendingRiders.length}</p>
                        </div>
                    </>
                }
            />

            <FilterBar
                left={
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by name or mobile..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                    </div>
                }
                pills={['all', 'pending', 'missing_info'].map((status) => ({
                    label: status === 'pending' ? 'Pending' : status.replace('_', ' '),
                    active: filterStatus === status,
                    onClick: () => setFilterStatus(status),
                }))}
            />

            <DataTable
                columns={riderColumns}
                data={filteredRiders}
                rowKey={(r) => r.id}
                loading={isLoading}
                emptyState={
                    <EmptyState
                        icon={<FileSearch className="h-6 w-6" />}
                        title="No pending applications found"
                        description="New rider applications will show up here for review."
                    />
                }
            />

            <AnimatePresence>
                {viewingRider && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-8">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl"
                            onClick={() => setViewingRider(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 30 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 30 }}
                            className="w-full max-w-5xl max-h-[92vh] relative z-10 bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col lg:flex-row"
                        >
                            <div className="lg:w-80 bg-slate-50 p-5 border-r border-slate-100 overflow-y-auto">
                                <div className="text-center mb-8">
                                    <img
                                        src={avatarSrc(viewingRider)}
                                        alt={viewingRider.name}
                                        className="h-24 w-24 rounded-2xl bg-white shadow-md object-cover ring-4 ring-white mx-auto"
                                    />
                                    <h3 className="text-lg font-bold text-slate-900 mt-4">
                                        {viewingRider.name}
                                    </h3>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-primary mt-1">
                                        Delivery Applicant
                                    </p>
                                    <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">
                                        Applied {viewingRider.appliedDate}
                                    </p>
                                    {viewingRider.avatar ? (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                window.open(
                                                    viewingRider.avatar,
                                                    '_blank',
                                                    'noopener,noreferrer',
                                                )
                                            }
                                            className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-primary"
                                        >
                                            <ExternalLink className="h-3 w-3" />
                                            Open profile photo
                                        </button>
                                    ) : null}
                                </div>

                                <div className="space-y-4">
                                    {[
                                        { label: 'Preferred Area', value: viewingRider.preferredArea, icon: MapPin },
                                        { label: 'Full Address', value: viewingRider.address, icon: Home },
                                        { label: 'Date of Birth', value: viewingRider.dob, icon: Calendar },
                                        { label: 'Blood Group', value: viewingRider.bloodGroup, icon: Droplets },
                                    ].map((row) => (
                                        <div key={row.label} className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                {row.label}
                                            </p>
                                            <div className="flex items-start gap-2 text-slate-700">
                                                <row.icon className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                                                <span className="text-xs font-bold break-words">
                                                    {row.value}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="pt-4 border-t border-slate-200">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                                            Submission Completeness
                                        </p>
                                        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary"
                                                style={{
                                                    width: `${Math.min(
                                                        100,
                                                        40 +
                                                            (viewingRider.documentFiles?.length || 0) * 20 +
                                                            (viewingRider.avatar ? 20 : 0),
                                                    )}%`,
                                                }}
                                            />
                                        </div>
                                        <p className="text-[10px] font-bold text-primary mt-2">
                                            {(viewingRider.documentFiles?.length || 0) >= 3 && viewingRider.avatar
                                                ? 'Documents complete'
                                                : 'Review uploaded media carefully'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div
                                className="flex-1 p-5 lg:p-8 bg-white overflow-y-auto min-h-0"
                                data-lenis-prevent
                            >
                                <div className="flex justify-between items-start mb-8">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-900">
                                            Vetting Protocol
                                        </h2>
                                        <p className="text-sm text-slate-500 mt-1">
                                            Check submitted legal documents for platform entry.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setViewingRider(null)}
                                        className="p-2.5 hover:bg-slate-50 rounded-xl transition-all"
                                    >
                                        <X className="h-5 w-5 text-slate-400" />
                                    </button>
                                </div>

                                <div className="space-y-7 mb-10">
                                    <section className="space-y-3">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                            Contact & Personal
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {[
                                                { label: 'Full Name', value: viewingRider.name, icon: User },
                                                { label: 'Phone', value: viewingRider.phone, icon: Phone },
                                                { label: 'Email', value: viewingRider.email, icon: Mail },
                                                { label: 'Date of Birth', value: viewingRider.dob, icon: Calendar },
                                                { label: 'Blood Group', value: viewingRider.bloodGroup, icon: Droplets },
                                                { label: 'Preferred Area', value: viewingRider.preferredArea, icon: MapPin },
                                                { label: 'Address', value: viewingRider.address, icon: Home },
                                            ].map((item) => (
                                                <div key={item.label} className="p-3.5 bg-slate-50 rounded-xl flex items-start gap-3">
                                                    <div className="h-9 w-9 rounded-lg bg-white shadow-sm flex items-center justify-center text-primary shrink-0">
                                                        <item.icon className="h-4 w-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.label}</p>
                                                        <p className="text-sm font-bold text-slate-900 break-words mt-0.5">{item.value}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>

                                    <section className="space-y-3">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                            Vehicle Details
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            {[
                                                { label: 'Vehicle Type', value: viewingRider.vehicle, icon: Truck },
                                                { label: 'Vehicle Number', value: viewingRider.vehicleNumber, icon: IdCard },
                                                { label: 'Driving License No.', value: viewingRider.drivingLicenseNumber, icon: IdCard },
                                            ].map((item) => (
                                                <div key={item.label} className="p-3.5 bg-slate-50 rounded-xl border border-primary/10 flex items-start gap-3">
                                                    <div className="h-9 w-9 rounded-lg bg-white shadow-sm flex items-center justify-center text-primary shrink-0">
                                                        <item.icon className="h-4 w-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.label}</p>
                                                        <p className="text-sm font-bold text-slate-900 break-words mt-0.5">{item.value}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>

                                    <section className="space-y-3">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                            Identity Numbers
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {[
                                                { label: 'Aadhar Number', value: viewingRider.aadharNumber, icon: IdCard },
                                                { label: 'PAN Number', value: viewingRider.panNumber, icon: CreditCard },
                                            ].map((item) => (
                                                <div key={item.label} className="p-3.5 bg-slate-50 rounded-xl flex items-start gap-3">
                                                    <div className="h-9 w-9 rounded-lg bg-white shadow-sm flex items-center justify-center text-primary shrink-0">
                                                        <item.icon className="h-4 w-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.label}</p>
                                                        <p className="text-sm font-bold text-slate-900 break-words mt-0.5">{item.value}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>

                                    <section className="space-y-3">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                            Bank Details
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            {[
                                                { label: 'Account Holder', value: viewingRider.accountHolder, icon: User },
                                                { label: 'Account Number', value: viewingRider.accountNumber, icon: CreditCard },
                                                { label: 'IFSC', value: viewingRider.ifsc, icon: Building2 },
                                            ].map((item) => (
                                                <div key={item.label} className="p-3.5 bg-slate-50 rounded-xl flex items-start gap-3">
                                                    <div className="h-9 w-9 rounded-lg bg-white shadow-sm flex items-center justify-center text-primary shrink-0">
                                                        <item.icon className="h-4 w-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.label}</p>
                                                        <p className="text-sm font-bold text-slate-900 break-words mt-0.5">{item.value}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                </div>

                                <div className="space-y-4 mb-10">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                        Submitted Documents ({viewingRider.documentFiles?.length || 0})
                                    </h4>
                                    {(viewingRider.documentFiles || []).length === 0 ? (
                                        <EmptyState
                                            icon={<ImageOff className="h-6 w-6" />}
                                            title="No documents found"
                                            description="No document files were found for this application."
                                        />
                                    ) : (
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                            {viewingRider.documentFiles.map((doc) => (
                                                <button
                                                    key={doc.key}
                                                    type="button"
                                                    onClick={() => openDocument(doc)}
                                                    className="group relative aspect-[4/3] bg-slate-100 rounded-xl overflow-hidden hover:ring-2 hover:ring-primary transition-all text-left"
                                                >
                                                    {doc.isImage ? (
                                                        <img
                                                            src={doc.url}
                                                            alt={doc.label}
                                                            className="absolute inset-0 h-full w-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                                                            <FileSearch className="h-8 w-8 text-slate-400 group-hover:text-primary transition-colors" />
                                                        </div>
                                                    )}
                                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/80 to-transparent p-3">
                                                        <p className="text-[10px] font-black text-white uppercase tracking-wider">{doc.label}</p>
                                                        <p className="text-[9px] font-bold text-white/80 mt-0.5 flex items-center gap-1">
                                                            <ExternalLink className="h-3 w-3" />
                                                            {doc.isImage ? 'Tap to enlarge' : 'Open file'}
                                                        </p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col sm:flex-row gap-3">
                                    <Button
                                        disabled={isProcessing}
                                        isLoading={isProcessing}
                                        onClick={() => handleApprove(viewingRider.id)}
                                        className="flex-1"
                                    >
                                        {!isProcessing && <Check className="h-4 w-4" />}
                                        {isProcessing ? 'Processing...' : 'Approve & Activate Rider'}
                                    </Button>
                                    <Button
                                        variant="danger"
                                        onClick={() => handleReject(viewingRider.id)}
                                    >
                                        Reject Application
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {previewDoc && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                            onClick={() => setPreviewDoc(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            className="relative z-10 w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl overflow-hidden shadow-2xl"
                        >
                            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                                <div>
                                    <p className="text-sm font-bold text-slate-900 uppercase tracking-wider">{previewDoc.label}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Uploaded document preview</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <a
                                        href={previewDoc.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wider"
                                    >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                        Open
                                    </a>
                                    <button type="button" onClick={() => setPreviewDoc(null)} className="p-2 rounded-lg hover:bg-slate-100">
                                        <X className="h-5 w-5 text-slate-500" />
                                    </button>
                                </div>
                            </div>
                            <div className="bg-slate-50 p-4 max-h-[75vh] overflow-auto">
                                <img
                                    src={previewDoc.url}
                                    alt={previewDoc.label}
                                    className="mx-auto max-h-[70vh] w-auto max-w-full rounded-xl object-contain shadow-sm"
                                />
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PendingDeliveryBoys;
