import React from 'react';
import {
    Card as ShadcnCard,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { cn } from '@/lib/utils';

/**
 * Card
 *
 * Design-system primitive: 12px radius, a 1px neutral border AND a soft
 * black-tinted shadow together (never one without the other), flat white
 * surface — no glassmorphism/blur, per the design system's border+shadow
 * rule.
 */
const Card = ({ children, title, subtitle, className, headerAction, footer, contentClassName, ...props }) => {
    return (
        <ShadcnCard
            className={cn(
                "bg-white border border-slate-200 rounded-xl shadow-[0_2px_10px_rgba(15,23,42,0.12)]",
                className
            )}
            {...props}
        >
            {(title || subtitle || headerAction) && (
                <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-slate-100 px-4 py-3">
                    <div className="space-y-0.5">
                        {title && <CardTitle className="text-sm font-bold text-slate-900 tracking-tight">{title}</CardTitle>}
                        {subtitle && <CardDescription className="text-xs font-medium text-slate-500">{subtitle}</CardDescription>}
                    </div>
                    {headerAction && <div>{headerAction}</div>}
                </CardHeader>
            )}
            <CardContent className={cn("p-4", !title && !subtitle && !headerAction && "pt-4", contentClassName)}>
                {children}
            </CardContent>
            {footer && (
                <CardFooter className="bg-slate-50 border-t border-slate-100 px-4 py-2.5">
                    {footer}
                </CardFooter>
            )}
        </ShadcnCard>
    );
};

export default Card;
