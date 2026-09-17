import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@core/context/AuthContext';

// Audit fix M3/H-3: this guard used to check `useAuth().role` /
// `isAuthenticated`, both derived from `activeRoleStore`'s `currentRole`.
// `currentRole` is only updated by an effect inside each portal's OWN route
// component (e.g. SellerRoutes calls `setActiveRole(SELLER)` on mount) —
// which is a CHILD of this guard, so it hasn't run yet on the render where
// the guard decides whether to render that child at all. On a client-side
// SPA navigation between portals (no full page reload), this guard would
// evaluate against the PREVIOUS portal's role, see a mismatch, and redirect
// away before the child ever got a chance to mount and correct the store —
// permanently bouncing a legitimately logged-in user to `/${staleRole}`
// (often a route that doesn't exist) instead of their intended dashboard.
//
// Fix: check `authData` directly. It holds all four portals' tokens
// independently (populated by `login()`/`logout()`/storage-sync listeners)
// and isn't derived from the possibly-stale active-role store, so it's
// correct on the very first render regardless of navigation order.
const RoleGuard = ({ children, allowedRoles }) => {
    const { authData, isLoading } = useAuth();

    if (isLoading) {
        return null; // Let ProtectedRoute handle the loading spinner
    }

    const hasAccessForRoute = allowedRoles.some((r) => Boolean(authData?.[r]));

    if (!hasAccessForRoute) {
        // Logged in under a different role — send them to their own
        // dashboard instead of stranding them on /unauthorized.
        const fallbackRole = Object.keys(authData || {}).find((r) => authData[r]);
        if (fallbackRole) {
            return <Navigate to={`/${fallbackRole}`} replace />;
        }
        return <Navigate to="/unauthorized" replace />;
    }

    return <>{children}</>;
};

export default RoleGuard;
