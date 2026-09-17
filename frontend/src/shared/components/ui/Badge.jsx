import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Badge
 *
 * Design-system primitive for status pills / chips / tags. Every colored
 * variant renders as a TINT (10%-opacity fill, full-strength text,
 * 20%-opacity border) rather than a solid fill, per the design system's
 * color-usage rule. Pill-shaped (rounded-full).
 *
 * variant: primary | secondary | success | warning | danger | info | outline
 *
 * Backward-compat aliases kept so existing call sites across ~60 pages
 * don't need to change: `error` -> danger, `gray` -> secondary.
 */
const VARIANT_ALIASES = {
    error: 'danger',
    gray: 'secondary',
};

const VARIANT_CLASSES = {
    primary: 'bg-primary/10 text-primary border-primary/20',
    secondary: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
    success: 'bg-success/10 text-success border-success/20',
    warning: 'bg-warning/10 text-warning border-warning/20',
    danger: 'bg-danger/10 text-danger border-danger/20',
    info: 'bg-info/10 text-info border-info/20',
    outline: 'bg-transparent text-slate-600 border-slate-300',
};

const Badge = ({ children, variant = 'secondary', className, ...props }) => {
    const resolved = VARIANT_ALIASES[variant] || variant;

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide whitespace-nowrap',
                VARIANT_CLASSES[resolved] || VARIANT_CLASSES.secondary,
                className
            )}
            {...props}
        >
            {children}
        </span>
    );
};

export default Badge;
