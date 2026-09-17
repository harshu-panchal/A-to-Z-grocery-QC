import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Skeleton
 *
 * Base pulsing placeholder block. Size it with className (h-4 w-32, etc).
 * Use the composed helpers below for the common list/card/table shapes so
 * pages don't hand-roll skeleton layouts — a simple spinner (see Loader)
 * is reserved for single-record detail pages, per the design system.
 */
export const Skeleton = ({ className }) => (
    <div className={cn('animate-pulse rounded-md bg-slate-200/70', className)} />
);

/** Mirrors the StatCard layout: label + icon chip, then a big number. */
export const SkeletonStatCard = () => (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-[0_2px_10px_rgba(15,23,42,0.12)]">
        <div className="flex items-center justify-between">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-7 w-7 rounded-lg" />
        </div>
        <Skeleton className="mt-2.5 h-6 w-20" />
    </div>
);

/** Mirrors a generic Card with a title row and a few content lines. */
export const SkeletonCard = ({ lines = 3 }) => (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.12)]">
        <Skeleton className="h-4 w-1/3" />
        <div className="mt-3.5 space-y-2.5">
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton key={i} className="h-3 w-full last:w-2/3" />
            ))}
        </div>
    </div>
);

/** Mirrors DataTable rows so a loading table keeps its shape. */
export const SkeletonTableRows = ({ rows = 5, columns = 4 }) => (
    <>
        {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-b border-slate-100">
                {Array.from({ length: columns }).map((_, c) => (
                    <td key={c} className="px-6 py-5">
                        <Skeleton className="h-3.5 w-full max-w-[140px]" />
                    </td>
                ))}
            </tr>
        ))}
    </>
);

export default Skeleton;
