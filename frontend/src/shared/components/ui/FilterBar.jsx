import React from 'react';
import { cn } from '@/lib/utils';

/**
 * FilterBar
 *
 * The filter block that sits above a data table: a `left` slot (search +
 * dropdown filters) and a `right` slot (bulk actions/export), plus an
 * optional row of toggle "quick filter" pills underneath. Wrapped in the
 * standard card border+shadow so it reads as one distinct block.
 *
 *   <FilterBar
 *     left={<><Input placeholder="Search orders" .../><Select>...</Select></>}
 *     right={<Button onClick={onExport}>Export</Button>}
 *     pills={[
 *       { label: 'Pending', active: filter === 'pending', onClick: () => setFilter('pending') },
 *     ]}
 *   />
 */
const FilterBar = ({ left, right, pills, className, children }) => {
    return (
        <div className={cn('mb-4 rounded-lg border border-slate-200 bg-white p-2.5 shadow-[0_2px_10px_rgba(15,23,42,0.12)]', className)}>
            {children ? (
                <div className="flex flex-wrap items-center gap-2.5">{children}</div>
            ) : (
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">{left}</div>
                    {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
                </div>
            )}

            {pills && pills.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
                    {pills.map((pill) => (
                        <button
                            key={pill.label}
                            type="button"
                            onClick={pill.onClick}
                            className={cn(
                                'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                                pill.active
                                    ? 'border-primary/20 bg-primary/10 text-primary'
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            )}
                        >
                            {pill.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default FilterBar;
