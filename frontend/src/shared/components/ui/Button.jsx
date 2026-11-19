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
 *
 * Material 3: fully-rounded shape (morphs to medium corners on press),
 * label typescale, no resting shadow (level-1 elevation on hover for
 * filled variants). Colors are the app's own.
 */
const VARIANT_CLASSES = {
    primary:
        'bg-primary text-white border border-transparent hover:bg-primary/90 hover:shadow-m3-1',
    secondary:
        'bg-slate-100 text-slate-700 border border-transparent hover:bg-slate-200',
    danger:
        'bg-danger text-white border border-transparent hover:bg-danger/90 hover:shadow-m3-1',
    ghost:
        'bg-transparent text-slate-600 border border-transparent hover:bg-slate-100 shadow-none',
    outline:
        'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50',
};

const SIZE_CLASSES = {
    sm: 'h-7 px-3 text-m3-label-medium',
    md: 'h-9 px-4 text-m3-label-large',
    lg: 'h-10 px-6 text-m3-label-large',
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
                'rounded-m3-full disabled:opacity-40',
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
