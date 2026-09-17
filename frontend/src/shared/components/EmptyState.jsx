import React from 'react';

const EmptyState = ({ icon, title, description, action }) => {
    return (
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center">
            {icon && (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 text-slate-400">
                    {icon}
                </div>
            )}
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            <p className="max-w-md text-sm text-slate-500">{description}</p>
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
};

export default EmptyState;
