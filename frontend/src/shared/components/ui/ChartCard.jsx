import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2, BarChart3 } from 'lucide-react';

/**
 * ChartCard
 *
 * Common chrome wrapper for every chart on a dashboard — title, subtitle,
 * a loading spinner overlay, and an empty-state message — so charts look
 * identical regardless of which chart library rendered them (Recharts,
 * etc). Pass the chart itself (ResponsiveContainer/etc.) as `children`.
 *
 *   <ChartCard title="Revenue" subtitle="Last 30 days" loading={loading} isEmpty={!data.length}>
 *     <ResponsiveContainer>...</ResponsiveContainer>
 *   </ChartCard>
 */
const ChartCard = ({
    title,
    subtitle,
    actions,
    loading = false,
    isEmpty = false,
    emptyMessage = 'No data to show for this period yet.',
    height = 320,
    className,
    children,
}) => {
    return (
        <div className={cn('rounded-xl border border-slate-200 bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.12)]', className)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    {title && <h3 className="truncate text-sm font-bold text-slate-900">{title}</h3>}
                    {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
                </div>
                {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
            </div>

            <div className="relative mt-3 w-full" style={{ height }}>
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/70 backdrop-blur-[1px]">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                ) : isEmpty ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 text-center">
                        <BarChart3 className="h-8 w-8 text-slate-300" />
                        <p className="text-sm text-slate-500">{emptyMessage}</p>
                    </div>
                ) : (
                    children
                )}
            </div>
        </div>
    );
};

export default ChartCard;
