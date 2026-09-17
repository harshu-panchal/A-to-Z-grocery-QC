import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const PAGE_SIZE_OPTIONS = [10, 25, 50];

/**
 * Pagination
 *
 * The footer bar under a DataTable: live row count on the left, page size
 * + prev/next controls on the right.
 */
const Pagination = ({
    page,
    totalPages,
    total,
    pageSize,
    onPageChange,
    onPageSizeChange,
    loading = false,
    compact = false,
    className,
}) => {
    if (totalPages <= 1 && !onPageSizeChange) return null;

    const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);

    return (
        <div className={cn('flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-[0_2px_10px_rgba(15,23,42,0.12)] sm:flex-row sm:items-center sm:justify-between sm:gap-4', compact && 'gap-2 px-3 py-2', className)}>
            <p className="text-xs font-medium text-slate-500">
                Showing <span className="font-bold text-slate-900">{start}-{end}</span> of {total}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
                {onPageSizeChange && (
                    <select
                        value={pageSize}
                        onChange={(e) => onPageSizeChange(Number(e.target.value))}
                        disabled={loading}
                        className={cn(
                            'rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600',
                            'focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 cursor-pointer'
                        )}
                    >
                        {PAGE_SIZE_OPTIONS.map((size) => (
                            <option key={size} value={size}>{size} / page</option>
                        ))}
                    </select>
                )}
                <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => onPageChange(page - 1)}
                    className={cn(
                        'inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600',
                        'hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white'
                    )}
                >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Prev
                </button>
                <span className="px-1 text-xs font-semibold text-slate-500">
                    Page {page} {totalPages > 0 && `of ${totalPages}`}
                </span>
                <button
                    type="button"
                    disabled={page >= totalPages || loading}
                    onClick={() => onPageChange(page + 1)}
                    className={cn(
                        'inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600',
                        'hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white'
                    )}
                >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    );
};

export default Pagination;
