import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Checkbox
 *
 * Native <input type="checkbox"> visually replaced with a 6px-radius box,
 * primary fill when checked. Wraps its own <label> so the whole row is
 * clickable; pass `label` for the standard case or `children` for a richer
 * label (e.g. with a secondary description line).
 *
 *   <Checkbox checked={agreed} onChange={(e) => setAgreed(e.target.checked)} label="I agree to the terms" />
 */
const Checkbox = React.forwardRef(({ label, children, className, id, ...props }, ref) => {
    return (
        <label
            htmlFor={id}
            className={cn('inline-flex items-center gap-2 cursor-pointer select-none text-sm text-slate-700', className)}
        >
            <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
                <input
                    ref={ref}
                    id={id}
                    type="checkbox"
                    className="peer h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-md border border-slate-300 bg-white transition-colors checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
                    {...props}
                />
                <Check className="pointer-events-none absolute h-3 w-3 text-white opacity-0 peer-checked:opacity-100" strokeWidth={3} />
            </span>
            {label || children}
        </label>
    );
});

Checkbox.displayName = 'Checkbox';

export default Checkbox;
