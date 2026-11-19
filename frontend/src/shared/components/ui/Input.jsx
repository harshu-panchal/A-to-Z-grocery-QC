import React from 'react';
import { Input as ShadcnInput } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const Input = React.forwardRef(({ label, error, helperText, className, ...props }, ref) => {
    return (
        <div className="w-full space-y-1">
            {label && <label className="block text-m3-label-large text-slate-700">{label}</label>}
            <ShadcnInput
                className={cn(
                    'h-10 rounded-m3-xs border-slate-200 text-m3-body-large focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary',
                    error && 'border-danger focus-visible:ring-danger focus-visible:border-danger',
                    className
                )}
                ref={ref}
                {...props}
            />
            {error && <p className="text-m3-body-small text-danger">{error}</p>}
            {helperText && !error && <p className="text-m3-body-small text-slate-500">{helperText}</p>}
        </div>
    );
});

Input.displayName = 'Input';

export default Input;
