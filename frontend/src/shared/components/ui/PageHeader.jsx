import React from 'react';
import { cn } from '@/lib/utils';
import Breadcrumb from './Breadcrumb';

/**
 * PageHeader
 *
 * Standard page anatomy: breadcrumb -> bold title -> one-sentence subtitle
 * -> right-aligned actions. Every admin/seller page renders this at the
 * top. `description` should read as a real sentence explaining what the
 * page is for, not a terse label.
 *
 * Pass `breadcrumbItems` only when the auto-generated trail (derived from
 * the current URL) doesn't read well for a page; otherwise it's automatic.
 */
const PageHeader = ({ title, description, actions, badge, breadcrumbItems, showBreadcrumb = true, className }) => {
    return (
        <div className={cn('mb-5 space-y-2', className)}>
            {showBreadcrumb && <Breadcrumb items={breadcrumbItems} />}
            <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
                        {badge && badge}
                    </div>
                    {description && <p className="text-sm text-slate-500">{description}</p>}
                </div>
                {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
        </div>
    );
};

export default PageHeader;
