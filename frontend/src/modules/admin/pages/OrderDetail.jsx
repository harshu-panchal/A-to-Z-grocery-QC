// Ultimate Order Intelligence Dossier
import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useSettings } from '@core/context/SettingsContext';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import DataTable from '@shared/components/ui/DataTable';
import { adminApi } from '../services/adminApi';
import {
    ChevronLeft,
    Box,
    Truck,
    User,
    Calendar,
    Clock,
    Printer,
    Mail,
    Phone,
    Copy,
    CreditCard,
    AlertCircle,
    Package,
    Navigation,
    Store,
    Info,
    MapPin
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';
import ConfirmDialog from '@shared/components/ui/ConfirmDialog';
import useConfirmDialog from '@shared/hooks/useConfirmDialog';

const OrderDetail = () => {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { settings } = useSettings();
    const queryClient = useQueryClient();
    const invoiceRef = useRef(null);
    const statusConfirm = useConfirmDialog();

    // Perf audit Phase 8: migrated to React Query — same fetch-on-orderId
    // behavior, and a status update still triggers a fresh refetch
    // (invalidateQueries) exactly like the original's fetchDetail() call.
    const orderQueryKey = ['admin', 'orderDetail', orderId];
    const { data: order, isLoading, isError } = useQuery({
        queryKey: orderQueryKey,
        queryFn: async () => {
            const response = await adminApi.getOrderDetails(orderId);
            if (response.data.success) {
                return response.data.result;
            }
            return null;
        },
        enabled: !!orderId,
    });

    useEffect(() => {
        if (isError) showToast("Failed to load order details", "error");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isError]);

    const applyStatusUpdate = async (newStatus) => {
        try {
            await adminApi.updateOrderStatus(orderId, { status: newStatus });
            showToast(`Order status updated to ${newStatus}`, "success");
            queryClient.invalidateQueries({ queryKey: orderQueryKey }); // Refresh data
        } catch (error) {
            console.error("Failed to update status:", error);
            showToast("Failed to update status", "error");
        }
    };

    // Audit fix: this dropdown mutated a live customer order's status
    // (including "Cancelled"/"Delivered", both of which trigger real
    // finance side effects) directly on `onChange`, with no confirmation
    // step and no undo. Gate the two consequential transitions behind the
    // shared confirm dialog.
    const handleStatusUpdate = (newStatus) => {
        if (newStatus === 'cancelled' || newStatus === 'delivered') {
            statusConfirm.open({
                title: newStatus === 'cancelled' ? 'Cancel this order?' : 'Mark as delivered?',
                message: newStatus === 'cancelled'
                    ? 'This cancels the order and triggers any applicable refunds. This cannot be undone from here.'
                    : 'This marks the order delivered and settles seller/rider payouts. This cannot be undone from here.',
                confirmLabel: newStatus === 'cancelled' ? 'Cancel Order' : 'Mark Delivered',
                cancelLabel: 'Go Back',
                onConfirm: () => applyStatusUpdate(newStatus),
            });
            return;
        }
        applyStatusUpdate(newStatus);
    };

    const getStatusStyles = (status) => {
        switch (status.toLowerCase()) {
            case 'pending': return 'bg-warning/10 text-warning border-warning/20';
            case 'confirmed': return 'bg-primary/10 text-primary border-primary/20';
            case 'packed': return 'bg-primary/10 text-primary border-primary/20';
            case 'out_for_delivery': return 'bg-info/10 text-info border-info/20';
            case 'delivered': return 'bg-success/10 text-success border-success/20';
            case 'cancelled': return 'bg-danger/10 text-danger border-danger/20';
            default: return 'bg-slate-100 text-slate-600 border-slate-200';
        }
    };

    const copyToClipboard = (text, label) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        showToast(`${label} copied to internal clipboard`, 'success');
    };

    const handlePrintInvoice = async () => {
        const element = invoiceRef.current;
        if (!element) return;

        showToast("Generating PDF Invoice...", "info");

        try {
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                allowTaint: true,
                backgroundColor: "#ffffff",
                onclone: (clonedDoc) => {
                    // Forcefully remove any elements or styles that might use oklch
                    // html2canvas crashes when it encounters oklch color functions in stylesheets
                    const styleSheets = clonedDoc.styleSheets;
                    for (let i = 0; i < styleSheets.length; i++) {
                        try {
                            const rules = styleSheets[i].cssRules || styleSheets[i].rules;
                            for (let j = rules.length - 1; j >= 0; j--) {
                                if (rules[j].cssText && rules[j].cssText.includes('oklch')) {
                                    styleSheets[i].deleteRule(j);
                                }
                            }
                        } catch (e) {
                            // Skip cross-origin stylesheets that we can't access
                        }
                    }

                    // Also explicitly reset root variables just in case
                    const style = clonedDoc.createElement('style');
                    style.innerHTML = `
                        :root {
                            --primary: var(--primary) !important;
                            --secondary: #64748b !important;
                            --background: #ffffff !important;
                            --foreground: #0f172a !important;
                        }
                    `;
                    clonedDoc.head.appendChild(style);
                }
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Invoice_${order.orderId}.pdf`);
            showToast("Invoice downloaded successfully", "success");
        } catch (error) {
            console.error("PDF generation failed:", error);
            showToast("Failed to generate PDF", "error");
        }
    };

    if (isLoading) {
        return (
            <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Loading order details...</p>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center">
                <AlertCircle className="h-14 w-14 text-danger/30" />
                <h2 className="text-xl font-black text-slate-900">Order Not Found</h2>
                <Button onClick={() => navigate(-1)}>Return to List</Button>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Control Bar */}
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="group rounded-xl border border-slate-200 bg-white p-2.5 text-slate-400 transition-all hover:bg-slate-50"
                    >
                        <ChevronLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-xl font-black text-slate-900">Order #{order.orderId}</h1>
                            <div className="relative inline-block w-40">
                                <select
                                    value={order.status}
                                    onChange={(e) => handleStatusUpdate(e.target.value)}
                                    className={cn(
                                        "w-full cursor-pointer appearance-none rounded-lg border py-1.5 pl-3 pr-8 text-[10px] font-bold uppercase tracking-widest shadow-sm outline-none transition-all",
                                        getStatusStyles(order.status)
                                    )}
                                >
                                    <option value="pending">Pending</option>
                                    <option value="confirmed">Confirmed</option>
                                    <option value="packed">Packed</option>
                                    <option value="out_for_delivery">Out for Delivery</option>
                                    <option value="delivered">Delivered</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                                <Info className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-60" />
                            </div>
                        </div>
                        <p className="mt-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })} • <Clock className="ml-1 h-3.5 w-3.5" /> {new Date(order.createdAt).toLocaleTimeString()}
                        </p>
                    </div>
                </div>
                <Button variant="outline" onClick={handlePrintInvoice}>
                    <Printer className="h-4 w-4" />
                    Print Invoice
                </Button>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                {/* Left Column */}
                <div className="space-y-5 lg:col-span-2">
                    {/* Items Section */}
                    <Card className="overflow-hidden p-0">
                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/30 p-5">
                            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-900">
                                <Box className="h-4 w-4 text-primary" />
                                Items in Order
                            </h3>
                            <Badge variant="primary">{order.items.length} Items</Badge>
                        </div>
                        <DataTable
                            columns={[
                                {
                                    key: 'product',
                                    header: 'Product',
                                    primary: true,
                                    cell: (item) => (
                                        <div className="flex items-center gap-4">
                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                                                {item.image ? (
                                                    <img src={item.image} alt="" className="h-full w-full object-cover" />
                                                ) : (
                                                    <Package className="h-5 w-5 text-slate-200" />
                                                )}
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-black text-slate-900">{item.name}</h4>
                                                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">ID: {item.product?._id || item.product}</p>
                                            </div>
                                        </div>
                                    ),
                                },
                                {
                                    key: 'price',
                                    header: 'Unit Price',
                                    align: 'center',
                                    cell: (item) => <span className="text-sm font-bold text-slate-600">₹{item.price}</span>,
                                },
                                {
                                    key: 'qty',
                                    header: 'Qty',
                                    align: 'center',
                                    cell: (item) => (
                                        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">x{item.quantity}</span>
                                    ),
                                },
                                {
                                    key: 'aggregate',
                                    header: 'Aggregate',
                                    align: 'right',
                                    cell: (item) => <span className="text-sm font-black text-slate-900">₹{item.price * item.quantity}</span>,
                                },
                            ]}
                            data={order.items}
                            rowKey={(item) => item._id}
                            className="rounded-none border-none shadow-none"
                        />
                        <div className="flex flex-col items-end border-t border-slate-100 bg-slate-50/50 p-5">
                            <div className="w-full space-y-3 sm:w-80">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Subtotal</span>
                                    <span className="text-sm font-bold text-slate-700">₹{order.pricing?.subtotal || 0}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Delivery Fee</span>
                                    <span className="text-sm font-bold text-primary">₹{order.pricing?.deliveryFee || 0}</span>
                                </div>
                                <div className="h-px w-full bg-slate-200" />
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-black uppercase tracking-tight text-slate-900">Total Payable</span>
                                    <span className="text-2xl font-black text-primary">₹{order.pricing?.total || 0}</span>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Shop Details */}
                    <Card className="p-5">
                        <h4 className="mb-5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            <Store className="h-4 w-4" />
                            Shop Information
                        </h4>
                        <div className="flex items-center gap-4">
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-warning/10 text-lg font-black uppercase text-warning">
                                {order.seller?.shopName?.[0] || 'S'}
                            </div>
                            <div className="text-left">
                                <h3 className="text-base font-black leading-tight text-slate-900">{order.seller?.shopName || 'Unknown Shop'}</h3>
                                <p className="text-xs font-bold uppercase tracking-tight text-primary">Verified Partner</p>
                                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Owner: {order.seller?.name}</p>
                            </div>
                        </div>
                    </Card>

                    {/* Logistical Timeline */}
                    <Card className="p-5">
                        <h3 className="mb-6 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-900">
                            <Navigation className="h-4 w-4 text-primary" />
                            Real-time Status
                        </h3>
                        <div className="relative ml-4 space-y-5">
                            <div className="absolute bottom-0 left-[7.5px] top-0 w-0.5 bg-slate-100" />
                            <div className="relative flex gap-5">
                                <div className="z-10 mt-1 h-4 w-4 rounded-full bg-primary shadow-sm ring-4 ring-white" />
                                <div className="flex-1 pb-3">
                                    <div className="mb-1 flex items-center justify-between">
                                        <h4 className="text-xs font-black uppercase tracking-tight text-slate-900">
                                            Status: {order.status.replace(/_/g, ' ')}
                                        </h4>
                                        <span className="text-[10px] font-bold uppercase text-slate-400">{new Date(order.updatedAt).toLocaleTimeString()}</span>
                                    </div>
                                    <p className="text-[11px] font-medium italic leading-relaxed text-slate-400">"System verified current logistical state as {order.status}."</p>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Right Column */}
                <div className="space-y-5">
                    {/* Customer */}
                    <Card className="p-5">
                        <h4 className="mb-5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            <User className="h-4 w-4" />
                            Customer Information
                        </h4>
                        <div className="flex items-center gap-4">
                            <img
                                src="https://cdn-icons-png.flaticon.com/512/149/149071.png"
                                alt=""
                                className="h-14 w-14 rounded-xl border border-slate-100 bg-slate-50 object-cover"
                            />
                            <div className="text-left">
                                <h3 className="text-base font-black leading-tight text-slate-900">
                                    {order.customer?.name}
                                </h3>
                                <p className="text-xs font-bold text-slate-400">
                                    ID: {order.customer?._id}
                                </p>
                            </div>
                        </div>
                        <div className="mt-5 space-y-5 text-left">
                            <div className="flex flex-col gap-2">
                                <span className="flex items-center gap-2.5 text-[10px] font-bold text-slate-400">
                                    <Mail className="h-3.5 w-3.5" /> {order.customer?.email}
                                </span>
                                <span className="flex items-center gap-2.5 text-[10px] font-bold text-slate-400">
                                    <Phone className="h-3.5 w-3.5" /> {order.customer?.phone}
                                </span>
                            </div>
                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        Delivery Address
                                    </span>
                                    {order?.address?.location &&
                                        typeof order.address.location.lat === "number" &&
                                        typeof order.address.location.lng === "number" && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const { lat, lng } = order.address.location;
                                                    window.open(
                                                        `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
                                                        "_blank",
                                                    );
                                                }}
                                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-primary transition-colors hover:bg-primary/10"
                                            >
                                                <MapPin className="h-3 w-3" />
                                                Open in Maps
                                            </button>
                                        )}
                                </div>
                                <p className="text-xs font-bold italic leading-relaxed text-slate-600">
                                    "{order.address?.address}, {order.address?.landmark}, {order.address?.city}"
                                </p>
                            </div>
                            {order.address?.type === "Other" &&
                                (order.address?.name || order.address?.phone) && (
                                    <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-4">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                                            Recipient (Order For Someone Else)
                                        </span>
                                        <p className="text-xs font-black text-slate-800">
                                            {order.address?.name}
                                        </p>
                                        {order.address?.phone && (
                                            <p className="flex items-center gap-2 text-[11px] font-bold text-primary">
                                                <Phone className="h-3.5 w-3.5" />
                                                {order.address.phone}
                                            </p>
                                        )}
                                    </div>
                                )}
                        </div>
                    </Card>

                    {/* Rider Section */}
                    <Card className="p-5 text-left">
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <h4 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    <Truck className="h-3.5 w-3.5" /> Delivery Agent
                                </h4>
                                <Badge variant={order.deliveryBoy ? "success" : "secondary"}>
                                    {order.deliveryBoy ? "Assigned" : "Unassigned"}
                                </Badge>
                            </div>
                            <div className="mt-1 flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50 text-slate-300">
                                    {order.deliveryBoy ? (
                                        <div className="flex h-full w-full items-center justify-center bg-primary/10 text-sm font-black text-primary">{order.deliveryBoy.name.charAt(0)}</div>
                                    ) : (
                                        <User className="h-5 w-5" />
                                    )}
                                </div>
                                <div>
                                    <h5 className="text-sm font-black text-slate-900">{order.deliveryBoy?.name || "Pending Rider Assignment"}</h5>
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Contact: {order.deliveryBoy?.phone || "N/A"}</p>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Payment */}
                    <Card className="overflow-hidden p-0 text-left">
                        <div className="bg-slate-900 p-5 text-white">
                            <h4 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white">
                                <CreditCard className="h-4 w-4 text-primary" />
                                Payment Details
                            </h4>
                        </div>
                        <div className="space-y-5 p-4">
                            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</span>
                                <Badge variant={order.payment?.status === 'completed' ? 'success' : 'warning'}>
                                    {order.payment?.status || 'Pending'}
                                </Badge>
                            </div>
                            <div className="flex items-center justify-between px-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">TXN ID</span>
                                <div className="flex items-center gap-2">
                                    <span className="max-w-[100px] truncate text-[10px] font-black text-slate-700">{order.payment?.transactionId || 'N/A'}</span>
                                    <button onClick={() => copyToClipboard(order.payment?.transactionId, 'Transaction ID')} className="rounded-md p-1.5 text-slate-300 hover:bg-slate-50"><Copy className="h-3 w-3" /></button>
                                </div>
                            </div>
                            <div className="flex items-center justify-between px-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Payment Method</span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">{order.payment?.method || 'CASH'}</span>
                            </div>
                        </div>
                    </Card>

                    {/* Notes */}
                    <Card className="border-warning/20 bg-warning/5 p-5 text-left">
                        <h4 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-warning">
                            <Info className="h-4 w-4" />
                            Notes
                        </h4>
                        <p className="text-xs font-medium italic leading-relaxed text-warning/90">
                            "{order.cancelReason ? `Cancellation reason: ${order.cancelReason}` : `Delivery window scheduled for ${order.timeSlot}. Instructions: Follow local logistical protocols.`}"
                        </p>
                    </Card>
                </div>
            </div>

            {/* Hidden Printable Invoice Template */}
            <div className="fixed -left-[9999px] top-0">
                <div
                    ref={invoiceRef}
                    className="w-[800px] bg-white p-1"
                    style={{ backgroundColor: "#f8fafc" }}
                >
                    {/* Inner Paper with Border */}
                    <div style={{
                        backgroundColor: "#ffffff",
                        margin: "40px",
                        padding: "65px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "2px",
                        boxShadow: "0 0 10px rgba(0,0,0,0.02)",
                        fontFamily: "'Inter', system-ui, sans-serif",
                        color: "#1e293b",
                        minHeight: "1050px"
                    }}>
                        {/* Header: Centered Brand */}
                        <div style={{ textAlign: "center", marginBottom: "50px" }}>
                            {settings?.logoUrl ? (
                                <img src={settings.logoUrl} alt="Logo" width="130" style={{ display: "inline-block", marginBottom: "16px" }} crossOrigin="anonymous" />
                            ) : (
                                <div style={{ fontSize: "26px", fontWeight: "900", color: "#0f172a", marginBottom: "4px" }}>{settings?.appName || 'NOYO KART'}</div>
                            )}
                            <div style={{ fontSize: "10px", color: "#64748b", fontWeight: "800", textTransform: "uppercase", letterSpacing: "3px" }}>Official Tax Invoice</div>
                        </div>

                        {/* Top Meta Details */}
                        <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: "50px", borderBottom: "1px solid #f1f5f9", paddingBottom: "25px" }}>
                            <tr>
                                <td width="50%" style={{ verticalAlign: "bottom" }}>
                                    <div style={{ fontSize: "28px", fontWeight: "900", color: "#0f172a" }}>INVOICE</div>
                                </td>
                                <td width="50%" align="right" style={{ verticalAlign: "bottom" }}>
                                    <div style={{ fontSize: "12px", fontWeight: "700", marginBottom: "4px" }}>Reference: <span style={{ color: "#2563eb" }}>#{order.orderId}</span></div>
                                    <div style={{ fontSize: "10px", color: "#64748b", fontWeight: "700" }}>Issued: {new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
                                </td>
                            </tr>
                        </table>

                        {/* Address Grid */}
                        <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: "55px" }}>
                            <tr>
                                <td width="48%" style={{ verticalAlign: "top", paddingRight: "25px" }}>
                                    <div style={{ fontSize: "9px", fontWeight: "900", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "12px" }}>Billed To</div>
                                    <div style={{ fontSize: "16px", fontWeight: "800", color: "#0f172a", marginBottom: "8px" }}>{order.customer?.name}</div>
                                    <div style={{ fontSize: "12px", color: "#475569", lineHeight: "1.7" }}>
                                        {order.address?.address},<br />
                                        {order.address?.landmark && `${order.address.landmark}, `}{order.address?.city}
                                    </div>
                                    <div style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", marginTop: "15px" }}>Contact: {order.customer?.phone}</div>
                                </td>
                                <td width="4%" style={{ borderLeft: "1px solid #f1f5f9" }}></td>
                                <td width="48%" style={{ verticalAlign: "top", paddingLeft: "25px" }}>
                                    <div style={{ fontSize: "9px", fontWeight: "900", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "12px" }}>Shipped From</div>
                                    <div style={{ fontSize: "16px", fontWeight: "800", color: "#0f172a", marginBottom: "8px" }}>{order.seller?.shopName || 'Partner Merchant'}</div>
                                    <div style={{ fontSize: "12px", color: "#475569", lineHeight: "1.7" }}>
                                        {settings?.address || 'Verified Business Location'}<br />
                                        Inventory Fulfillment Center
                                    </div>
                                    <div style={{ fontSize: "11px", fontWeight: "800", color: "#2563eb", marginTop: "15px" }}>{settings?.taxId ? `GSTIN: ${settings.taxId}` : 'Tax Verified Partner'}</div>
                                </td>
                            </tr>
                        </table>

                        {/* Manifest Table */}
                        <div style={{ marginBottom: "50px" }}>
                            <table width="100%" cellPadding="0" cellSpacing="0" style={{ borderCollapse: "collapse" }}>
                                <thead>
                                    <tr style={{ backgroundColor: "#f8fafc", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" }}>
                                        <th align="left" style={{ padding: "16px 20px", fontSize: "11px", fontWeight: "900", color: "#475569", textTransform: "uppercase" }}>Description</th>
                                        <th align="center" style={{ padding: "16px 20px", fontSize: "11px", fontWeight: "900", color: "#475569", textTransform: "uppercase" }}>Unit Rate</th>
                                        <th align="center" style={{ padding: "16px 20px", fontSize: "11px", fontWeight: "900", color: "#475569", textTransform: "uppercase" }}>Qty</th>
                                        <th align="right" style={{ padding: "16px 20px", fontSize: "11px", fontWeight: "900", color: "#475569", textTransform: "uppercase" }}>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {order.items.map((item, idx) => (
                                        <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                            <td style={{ padding: "18px 20px" }}>
                                                <div style={{ fontSize: "13px", fontWeight: "700", color: "#0f172a" }}>{item.name}</div>
                                                <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "4px" }}>Item Ref: {item.product?._id?.slice(-8).toUpperCase() || item._id?.slice(-8).toUpperCase()}</div>
                                            </td>
                                            <td align="center" style={{ padding: "18px 20px", fontSize: "13px", color: "#475569", fontWeight: "700" }}>₹{item.price}</td>
                                            <td align="center" style={{ padding: "18px 20px", fontSize: "13px", color: "#475569", fontWeight: "800" }}>{item.quantity}</td>
                                            <td align="right" style={{ padding: "18px 20px", fontSize: "14px", fontWeight: "900", color: "#0f172a" }}>₹{item.price * item.quantity}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Totals Summary */}
                        <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: "60px" }}>
                            <tr>
                                <td width="50%" style={{ verticalAlign: "top" }}>
                                    <div style={{ backgroundColor: "#f8fafc", padding: "25px", borderRadius: "8px", border: "1px solid #f1f5f9" }}>
                                        <div style={{ fontSize: "10px", color: "#94a3b8", fontWeight: "900", textTransform: "uppercase", marginBottom: "12px", letterSpacing: "1.5px" }}>Transaction Detail</div>
                                        <div style={{ fontSize: "12px", color: "#475569", marginBottom: "8px" }}>Method: <b style={{ color: "#0f172a" }}>{order.paymentMode || order.payment?.method || 'CASH'}</b></div>
                                        <div style={{ fontSize: "12px", color: "#475569" }}>Status: <b style={{ color: "#0f172a", textTransform: "uppercase" }}>{order.paymentStatus || order.payment?.status || 'PENDING'}</b></div>
                                    </div>
                                </td>
                                <td width="10%"></td>
                                <td width="40%" style={{ verticalAlign: "top" }}>
                                    <table width="100%" cellPadding="8" cellSpacing="0">
                                        <tr>
                                            <td align="left" style={{ fontSize: "12px", color: "#64748b", fontWeight: "700" }}>Subtotal Aggregate</td>
                                            <td align="right" style={{ fontSize: "13px", fontWeight: "800", color: "#0f172a" }}>₹{order.pricing?.subtotal || 0}</td>
                                        </tr>
                                        <tr>
                                            <td align="left" style={{ fontSize: "12px", color: "#64748b", fontWeight: "700" }}>Logistics Cost</td>
                                            <td align="right" style={{ fontSize: "13px", fontWeight: "800", color: "#2563eb" }}>+ ₹{order.pricing?.deliveryFee || 0}</td>
                                        </tr>
                                        <tr>
                                            <td colSpan="2" style={{ padding: "12px 0" }}><div style={{ height: "1px", backgroundColor: "#e2e8f0" }}></div></td>
                                        </tr>
                                        <tr>
                                            <td align="left" style={{ fontSize: "15px", fontWeight: "900", color: "#0f172a" }}>Grand Total</td>
                                            <td align="right" style={{ fontSize: "24px", fontWeight: "900", color: "#2563eb" }}>₹{order.pricing?.total || 0}</td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>

                        {/* Footer: Centered Verification */}
                        <div style={{ marginTop: "auto", paddingTop: "40px", borderTop: "1px solid #f1f5f9", textAlign: "center" }}>
                            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: "800", textTransform: "uppercase", letterSpacing: "3px" }}>
                                Thank you for your business
                            </div>
                            <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "10px", fontWeight: "600" }}>
                                This is a system-generated commercial invoice. No physical signature required.
                            </div>
                            <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "5px" }}>
                                {settings?.appName || 'Noyo Kart'} • Customer Support: support@appzeto.com
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <ConfirmDialog
                isOpen={statusConfirm.isOpen}
                title={statusConfirm.title}
                message={statusConfirm.message}
                confirmLabel={statusConfirm.confirmLabel}
                cancelLabel={statusConfirm.cancelLabel}
                onConfirm={statusConfirm.handleConfirm}
                onCancel={statusConfirm.close}
                loading={statusConfirm.loading}
                variant="danger"
            />
        </div>
    );
};

export default OrderDetail;
