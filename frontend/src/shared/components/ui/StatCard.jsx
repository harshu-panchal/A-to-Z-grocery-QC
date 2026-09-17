import React from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

/**
 * StatCard
 *
 * KPI tile: tinted icon chip, uppercase eyebrow label, font-black big
 * number. `color`/`bg` accept either a full Tailwind class (kept for
 * backward compatibility with existing call sites) or leave the defaults,
 * which use the primary tint.
 */
const StatCard = ({
    label,
    value,
    icon: Icon,
    trend,
    trendDirection = 'up',
    description,
    color = 'text-primary',
    bg = 'bg-primary/10',
    onClick,
    className
}) => {
    return (
        <div
            onClick={onClick}
            className={cn(
                'rounded-xl border border-slate-200 bg-white p-3.5 shadow-[0_2px_10px_rgba(15,23,42,0.12)] transition-shadow',
                onClick && 'cursor-pointer hover:shadow-md',
                className
            )}
        >
            <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', bg)}>
                    {Icon && <Icon className={cn('h-3.5 w-3.5', color)} strokeWidth={2.5} />}
                </div>
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
                <p className="text-2xl font-black tracking-tight text-slate-900">{value}</p>
                {trend && (
                    <span
                        className={cn(
                            'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                            trendDirection === 'up' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                        )}
                    >
                        {trendDirection === 'up' ? (
                            <TrendingUp className="h-2.5 w-2.5" />
                        ) : (
                            <TrendingDown className="h-2.5 w-2.5" />
                        )}
                        {trend}
                    </span>
                )}
            </div>
            {description && <p className="mt-1 text-[11px] text-slate-400">{description}</p>}
        </div>
    );
};

export default StatCard;
