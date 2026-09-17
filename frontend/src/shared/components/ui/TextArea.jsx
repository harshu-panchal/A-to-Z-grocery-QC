import React from 'react';
import { Textarea as ShadcnTextarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * TextArea
 *
 * Multi-line counterpart to Input — same label/error/helperText contract.
 */
const TextArea = React.forwardRef(({ label, error, helperText, className, ...props }, ref) => {
    return (
        <div className="w-full space-y-1">
            {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
            <ShadcnTextarea
                ref={ref}
                className={cn(
                    'rounded-md border-slate-200 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary',
                    error && 'border-danger focus-visible:ring-danger/20 focus-visible:border-danger',
                    className
                )}
                {...props}
            />
            {error && <p className="text-xs text-danger">{error}</p>}
            {helperText && !error && <p className="text-xs text-slate-500">{helperText}</p>}
        </div>
    );
});

TextArea.displayName = 'TextArea';

export default TextArea;
