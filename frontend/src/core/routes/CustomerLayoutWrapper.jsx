import React, { Suspense, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { setActiveRole, ROLES } from '../auth/activeRoleStore';

// Perf audit FE-B4: this whole subtree (customer cart/wishlist/location
// context stack + the customer layout chrome) previously lived as a
// statically-imported block inside AppRouter.jsx, so an admin-only or
// seller-only session paid for the entire customer stack on first load.
// Moving it to its own module and lazy-loading it from AppRouter.jsx (see
// the `lazy(() => import('./CustomerLayoutWrapper'))` there) means it's
// only downloaded by sessions that actually render a customer route.
import { WishlistProvider } from '../../modules/customer/context/WishlistContext';
import { CartProvider } from '../../modules/customer/context/CartContext';
import { CartAnimationProvider } from '../../modules/customer/context/CartAnimationContext';
import { ProductDetailProvider } from '../../modules/customer/context/ProductDetailContext';
import { LocationProvider } from '../../modules/customer/context/LocationContext';
import ScrollToTop from '../../modules/customer/components/shared/ScrollToTop';
import LocationSetupGate from '../../modules/customer/components/shared/LocationSetupGate';
import CustomerLayout from '../../modules/customer/components/layout/CustomerLayout';

const CustomerLayoutWrapper = () => {
    useEffect(() => {
        setActiveRole(ROLES.CUSTOMER);
    }, []);

    return (
        <LocationProvider>
            <WishlistProvider>
                <CartProvider>
                    <CartAnimationProvider>
                        <ProductDetailProvider>
                            <ScrollToTop />
                            <LocationSetupGate />
                            <CustomerLayout>
                                <Suspense fallback={<div className="flex h-screen items-center justify-center font-outfit">Loading...</div>}>
                                    <Outlet />
                                </Suspense>
                            </CustomerLayout>
                        </ProductDetailProvider>
                    </CartAnimationProvider>
                </CartProvider>
            </WishlistProvider>
        </LocationProvider>
    );
};

export default CustomerLayoutWrapper;
