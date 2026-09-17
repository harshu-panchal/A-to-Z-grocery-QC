import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@core/context/AuthContext';

const ROUTE_PREFIX_TO_ROLE = [
    ['/admin', 'admin'],
    ['/seller', 'seller'],
    ['/delivery', 'delivery'],
];

const ProtectedRoute = ({ children }) => {
    const { authData, isLoading, user } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
            </div>
        );
    }

    // Audit fix M3/H-3: derive "is this user authenticated FOR THIS ROUTE"
    // from the route's own pathname against `authData` (which independently
    // tracks all four portals' tokens) instead of the generic
    // `isAuthenticated`, which is based on `activeRoleStore`'s `currentRole`
    // — only updated by an effect inside the portal route component this
    // guard is deciding whether to render, so it can be stale-by-one-portal
    // on a client-side navigation between portals. See RoleGuard.jsx for
    // the full incident writeup.
    const routeRole = ROUTE_PREFIX_TO_ROLE.find(([prefix]) =>
        location.pathname.startsWith(prefix),
    )?.[1];
    const isAuthenticatedForRoute = routeRole
        ? Boolean(authData?.[routeRole])
        : Boolean(authData?.customer);

    if (!isAuthenticatedForRoute) {
        if (location.pathname.startsWith('/admin')) {
            return <Navigate to="/admin/auth" state={{ from: location }} replace />;
        }
        if (location.pathname.startsWith('/seller')) {
            return <Navigate to="/seller/auth" state={{ from: location }} replace />;
        }
        if (location.pathname.startsWith('/delivery')) {
            return <Navigate to="/delivery/auth" state={{ from: location }} replace />;
        }
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (location.pathname.startsWith('/seller')) {
        const applicationStatus =
            user?.applicationStatus || (user?.isVerified ? 'approved' : 'pending');
        const isApprovedSeller =
            Boolean(user) &&
            user.isVerified === true &&
            user.isActive === true &&
            applicationStatus === 'approved';

        if (!isApprovedSeller) {
            return (
                <Navigate
                    to="/seller/pending-approval"
                    state={{
                        approvalRequired: true,
                        applicationStatus,
                        rejectionReason: user?.rejectionReason || '',
                    }}
                    replace
                />
            );
        }
    }

    return <>{children}</>;
};

export default ProtectedRoute;
