import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Select
 *
 * Native <select> styled to match Input/TextArea (6px radius, same height,
 * primary focus ring, inline red error state). Kept native rather than a
 * custom listbox so it stays fully accessible and dependency-free.
 *
 *   <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
 *     <option value="all">All</option>
 *     <option value="pending">Pending</option>
 *   </Select>
 */
const Select = React.forwardRef(({ label, error, helperText, className, children, ...props }, ref) => {
    return (
        <div className="w-full space-y-1">
            {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
            <div className="relative">
                <select
                    ref={ref}
                    className={cn(
                        'h-9 w-full appearance-none rounded-md border bg-white px-3 pr-8 text-sm text-slate-900 shadow-sm transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        error ? 'border-danger focus-visible:ring-danger/20 focus-visible:border-danger' : 'border-slate-200',
                        className
                    )}
                    {...props}
                >
                    {children}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            {helperText && !error && <p className="text-xs text-slate-500">{helperText}</p>}
        </div>
    );
});

Select.displayName = 'Select';

export default Select;
