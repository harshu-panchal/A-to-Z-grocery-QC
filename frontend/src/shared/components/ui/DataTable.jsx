import React from 'react';
import { cn } from '@/lib/utils';
import { SkeletonTableRows, SkeletonCard } from './Skeleton';

/**
 * DataTable
 *
 * Bold uppercase headers, hover row highlight, wrapped in the standard
 * card border+shadow. `loading` renders content-shaped skeleton rows
 * instead of real data; `emptyState` renders in place of the body when
 * `data` is empty and not loading — both optional and additive, existing
 * callers that only pass columns/data/onRowClick are unaffected.
 *
 * Below `md:` the table becomes a stacked card list built from the same
 * `columns`/`data` (pure CSS toggle — `hidden md:block` desktop table,
 * `md:hidden` card list — no JS media query, no hydration risk). One
 * column is promoted to each card's title (first column by default, or
 * whichever column sets `primary: true`); the rest render as label:value
 * lines using `column.header` as the label. Set `hideOnMobile: true` on a
 * column to drop it from the card entirely (e.g. a bulk-select checkbox
 * column that has no useful label:value form).
 */
const DataTable = ({ columns, data, rowKey, onRowClick, loading = false, emptyState, className }) => {
    const rows = Array.isArray(data) ? data : [];
    const getRowKey = (row, index) => (rowKey ? rowKey(row) : row?._id || row?.id || index);

    const primaryColumn = columns.find((c) => c.primary) || columns[0];
    const secondaryColumns = columns.filter((c) => c !== primaryColumn && !c.hideOnMobile);

    const renderCell = (column, row) => (column.cell ? column.cell(row) : row[column.accessor]);

    return (
        <div className={cn('overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.12)]', className)}>
            {/* Desktop / tablet table */}
            <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50/70">
                        <tr>
                            {columns.map((column, index) => (
                                <th
                                    key={column.key || index}
                                    className={cn(
                                        'px-6 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500',
                                        column.align === 'right' && 'text-right',
                                        column.align === 'center' && 'text-center'
                                    )}
                                >
                                    {column.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <SkeletonTableRows rows={5} columns={columns.length} />
                        ) : rows.length === 0 && emptyState ? (
                            <tr>
                                <td colSpan={columns.length} className="p-0">
                                    {emptyState}
                                </td>
                            </tr>
                        ) : (
                            rows.map((row, rowIndex) => (
                                <tr
                                    key={getRowKey(row, rowIndex)}
                                    className={cn(
                                        'border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50',
                                        onRowClick && 'cursor-pointer'
                                    )}
                                    onClick={() => onRowClick && onRowClick(row)}
                                >
                                    {columns.map((column, colIndex) => (
                                        <td
                                            key={column.key || colIndex}
                                            className={cn(
                                                'px-6 py-5 align-middle text-sm text-slate-700',
                                                column.align === 'right' && 'text-right',
                                                column.align === 'center' && 'text-center'
                                            )}
                                        >
                                            {renderCell(column, row)}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden">
                {loading ? (
                    <div className="space-y-3 p-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <SkeletonCard key={i} lines={2} />
                        ))}
                    </div>
                ) : rows.length === 0 ? (
                    emptyState || null
                ) : (
                    <div className="divide-y divide-slate-100">
                        {rows.map((row, rowIndex) => (
                            <div
                                key={getRowKey(row, rowIndex)}
                                className={cn(
                                    'p-4 transition-colors',
                                    onRowClick && 'cursor-pointer active:bg-slate-50'
                                )}
                                onClick={() => onRowClick && onRowClick(row)}
                            >
                                <div>{renderCell(primaryColumn, row)}</div>

                                {secondaryColumns.length > 0 && (
                                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                                        {secondaryColumns.map((column, colIndex) => (
                                            <div key={column.key || colIndex} className="flex items-center justify-between gap-3">
                                                {column.header ? (
                                                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                                        {column.header}
                                                    </span>
                                                ) : <span />}
                                                <div className="min-w-0 text-sm text-slate-700">
                                                    {renderCell(column, row)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DataTable;
