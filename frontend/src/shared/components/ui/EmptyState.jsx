import React from 'react';
import { cn } from '@/lib/utils';

/**
 * EmptyState
 *
 * Centered dashed-border icon + bold heading + a helpful instruction
 * sentence — never a bare "No data". `title`/`description` should use
 * real domain language (e.g. "No orders match these filters yet" rather
 * than "No results").
 *
 *   <EmptyState
 *     icon={<Inbox className="h-6 w-6" />}
 *     title="No orders yet"
 *     description="Orders placed by customers will show up here as soon as they come in."
 *     action={<Button onClick={...}>Refresh</Button>}
 *   />
 */
const EmptyState = ({ icon, title, description, action, className }) => {
    return (
        <div className={cn('flex flex-col items-center justify-center gap-3 px-4 py-14 text-center', className)}>
            {icon ? (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 text-slate-400">
                    {icon}
                </div>
            ) : null}
            {title ? <h3 className="text-base font-bold text-slate-900">{title}</h3> : null}
            {description ? <p className="max-w-md text-sm text-slate-500">{description}</p> : null}
            {action ? <div className="mt-2">{action}</div> : null}
        </div>
    );
};

export default EmptyState;
