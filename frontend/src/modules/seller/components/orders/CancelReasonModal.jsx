import { useEffect, useState } from 'react';
import Modal from '@shared/components/ui/Modal';
import Button from '@shared/components/ui/Button';
import { cn } from '@/lib/utils';

const QUICK_REASONS = [
    'Item out of stock',
    'Store is closed',
    'Cannot deliver to this address',
    'Price or item details are wrong',
];

/** Asks the seller why they are cancelling; the reason is shown to the customer. */
const CancelReasonModal = ({ isOpen, onClose, onConfirm }) => {
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (isOpen) setReason('');
    }, [isOpen]);

    const trimmed = reason.trim();

    const submit = async () => {
        if (!trimmed) return;
        setBusy(true);
        try {
            await onConfirm(trimmed);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={busy ? () => {} : onClose}
            title="Cancel this order?"
            size="sm"
            footer={(
                <>
                    <Button variant="outline" onClick={onClose} disabled={busy}>Keep Order</Button>
                    <Button variant="danger" onClick={submit} disabled={!trimmed} isLoading={busy}>Cancel Order</Button>
                </>
            )}
        >
            <p className="text-sm text-slate-600">The customer will see this reason on their order.</p>
            <div className="mt-3 flex flex-wrap gap-2">
                {QUICK_REASONS.map((r) => (
                    <button
                        key={r}
                        type="button"
                        onClick={() => setReason(r)}
                        className={cn(
                            'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                            reason === r ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        )}
                    >
                        {r}
                    </button>
                ))}
            </div>
            <textarea
                className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-red-400"
                rows={3}
                maxLength={200}
                placeholder="Write the reason…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
            />
            <p className="text-right text-[11px] text-slate-400">{reason.length}/200</p>
        </Modal>
    );
};

export default CancelReasonModal;
