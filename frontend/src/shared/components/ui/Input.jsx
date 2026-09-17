import React from 'react';
import { Input as ShadcnInput } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const Input = React.forwardRef(({ label, error, helperText, className, ...props }, ref) => {
    return (
        <div className="w-full space-y-1">
            {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
            <ShadcnInput
                className={cn(
                    'h-9 rounded-md border-slate-200 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary',
                    error && 'border-danger focus-visible:ring-danger/20 focus-visible:border-danger',
                    className
                )}
                ref={ref}
                {...props}
            />
            {error && <p className="text-xs text-danger">{error}</p>}
            {helperText && !error && <p className="text-xs text-slate-500">{helperText}</p>}
        </div>
    );
});

Input.displayName = 'Input';

export default Input;
