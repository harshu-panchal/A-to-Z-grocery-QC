import React from 'react';
import { Button as ShadcnButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

/**
 * Button
 *
 * Design-system primitive. Renders on top of the shadcn Button (keeps its
 * focus/disabled/asChild/motion behavior) but owns 100% of its own color
 * styling per variant — it does NOT delegate to shadcn's built-in
 * variant classes, since those read the app-wide --secondary/--destructive
 * tokens shared with the customer/delivery panels. Keeping the palette
 * here means this component can't drift when those shared tokens change.
 *
 * variant: primary | secondary | danger | ghost | outline
 * size: sm | md | lg
 */
const VARIANT_CLASSES = {
    primary:
        'bg-primary text-white border border-transparent shadow-sm shadow-primary/30 hover:bg-primary/90',
    secondary:
        'bg-slate-100 text-slate-700 border border-transparent hover:bg-slate-200',
    danger:
        'bg-danger text-white border border-transparent shadow-sm shadow-danger/30 hover:bg-danger/90',
    ghost:
        'bg-transparent text-slate-600 border border-transparent hover:bg-slate-100 shadow-none',
    outline:
        'bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50',
};

const SIZE_CLASSES = {
    sm: 'h-7 px-2.5 text-xs rounded-md',
    md: 'h-9 px-3.5 text-sm rounded-md',
    lg: 'h-10 px-5 text-sm rounded-md',
};

const Button = ({
    children,
    className,
    variant = 'primary',
    size = 'md',
    isLoading = false,
    disabled,
    ...props
}) => {
    return (
        <ShadcnButton
            variant="ghost"
            className={cn(
                'font-semibold transition-colors disabled:opacity-50',
                SIZE_CLASSES[size] || SIZE_CLASSES.md,
                VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary,
                className
            )}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {children}
        </ShadcnButton>
    );
};

export default Button;
