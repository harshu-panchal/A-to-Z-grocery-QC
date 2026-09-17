import React from 'react';
import Badge from './Badge';

/**
 * StatusBadge
 *
 * Single, shared mapping from domain status strings (order status, return
 * status, payment status, payout status) to badge colors. Eliminates the
 * scattered `getStatusColor()` helpers re-implemented in every page.
 *
 *   <StatusBadge status={order.status} />
 *   <StatusBadge status={payment.paymentStatus} kind="payment" />
 *
 * `kind` lets the same status string map to different colors when it has
 * different meaning across domains. If `kind` is unknown, falls through to
 * the default mapping. Unknown statuses render as `gray`.
 */

const ORDER_STATUS_VARIANT = {
    pending: 'warning',
    confirmed: 'info',
    packed: 'info',
    out_for_delivery: 'info',
    delivered: 'success',
    cancelled: 'danger',
    returned: 'danger',
    return_requested: 'warning',
    return_approved: 'info',
    return_rejected: 'danger',
    return_pickup_assigned: 'info',
    return_completed: 'success',
};

const PAYMENT_STATUS_VARIANT = {
    PAID: 'success',
    CAPTURED: 'success',
    PENDING: 'warning',
    CREATED: 'secondary',
    FAILED: 'danger',
    REFUNDED: 'secondary',
};

const PAYOUT_STATUS_VARIANT = {
    pending: 'warning',
    on_hold: 'warning',
    released: 'success',
    failed: 'danger',
};

function pickVariant(status, kind) {
    if (!status) return 'gray';
    const key = String(status);
    switch (kind) {
        case 'payment':
            return PAYMENT_STATUS_VARIANT[key.toUpperCase()] || 'gray';
        case 'payout':
            return PAYOUT_STATUS_VARIANT[key.toLowerCase()] || 'gray';
        case 'order':
        default:
            return ORDER_STATUS_VARIANT[key.toLowerCase()] || 'gray';
    }
}

function formatLabel(status) {
    if (!status) return '';
    return String(status)
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

const StatusBadge = ({ status, kind = 'order', className }) => {
    const variant = pickVariant(status, kind);
    return (
        <Badge variant={variant} className={className}>
            {formatLabel(status)}
        </Badge>
    );
};

export default StatusBadge;
