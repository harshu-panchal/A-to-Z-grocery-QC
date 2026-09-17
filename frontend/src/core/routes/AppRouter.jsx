import React, { lazy, useMemo, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Outlet, Navigate } from 'react-router-dom';
import ProtectedRoute from '../guards/ProtectedRoute';
import RoleGuard from '../guards/RoleGuard';
import { UserRole } from '../constants/roles';
import RootErrorBoundary from '../../shared/components/RootErrorBoundary';

// Public Pages (lazy-loaded — perf audit FE-B1/FE-B2/FE-B5/FE-B6: these were
// previously statically imported here, which forced every portal-specific
// dependency they pull in (Google Maps loader, Lottie animations, the
// delivery-only tesseract.js OCR wrapper) into the one entry bundle every
// visitor of every portal downloads before anything renders. Lazy-loading
// them defers that cost to the person who actually opens that specific
// auth screen, matching the pattern already used below for
// SellerModule/AdminModule/DeliveryModule.)
const Auth = lazy(() => import('../../modules/seller/pages/Auth'));
const ApplicationPending = lazy(() => import('../../modules/seller/pages/ApplicationPending'));
const AdminAuth = lazy(() => import('../../modules/admin/pages/AdminAuth'));
const DeliveryAuth = lazy(() => import('../../modules/delivery/pages/DeliveryAuth'));
const CustomerAuth = lazy(() => import('../../modules/customer/pages/CustomerAuth'));

// Customer Pages (lazy-loaded)
const Home = lazy(() => import('../../modules/customer/pages/Home'));
const CategoriesPage = lazy(() => import('../../modules/customer/pages/CategoriesPage'));
const CategoryProductsPage = lazy(() => import('../../modules/customer/pages/CategoryProductsPage'));
const WishlistPage = lazy(() => import('../../modules/customer/pages/WishlistPage'));
const OffersPage = lazy(() => import('../../modules/customer/pages/OffersPage'));
const ShopByStorePage = lazy(() => import('../../modules/customer/pages/ShopByStorePage'));
const ProfilePage = lazy(() => import('../../modules/customer/pages/ProfilePage'));
const OrdersPage = lazy(() => import('../../modules/customer/pages/OrdersPage'));
const OrderTransactionsPage = lazy(() => import('../../modules/customer/pages/OrderTransactionsPage'));
const AddressesPage = lazy(() => import('../../modules/customer/pages/AddressesPage'));
const SettingsPage = lazy(() => import('../../modules/customer/pages/SettingsPage'));
const SupportPage = lazy(() => import('../../modules/customer/pages/SupportPage'));
const ChatPage = lazy(() => import('../../modules/customer/pages/ChatPage'));
const TermsPage = lazy(() => import('../../modules/customer/pages/TermsPage'));
const PrivacyPage = lazy(() => import('../../modules/customer/pages/PrivacyPage'));
const AboutPage = lazy(() => import('../../modules/customer/pages/AboutPage'));
const EditProfilePage = lazy(() => import('../../modules/customer/pages/EditProfilePage'));
const OrderDetailPage = lazy(() => import('../../modules/customer/pages/OrderDetailPage'));
const ProductDetailPage = lazy(() => import('../../modules/customer/pages/ProductDetailPage'));
const CheckoutPage = lazy(() => import('../../modules/customer/pages/CheckoutPage'));
const PaymentStatusPage = lazy(() => import('../../modules/customer/pages/PaymentStatusPage'));
const SearchPage = lazy(() => import('../../modules/customer/pages/SearchPage'));
const WalletPage = lazy(() => import('../../modules/customer/pages/WalletPage'));
const NotificationsPage = lazy(() => import('../../modules/customer/pages/NotificationsPage'));

// Lazy load heavy modules
const SellerModule = lazy(() => import('../../modules/seller/routes/index'));
const AdminModule = lazy(() => import('../../modules/admin/routes/index'));
const DeliveryModule = lazy(() => import('../../modules/delivery/routes/index'));
const SellerTermsPage = lazy(() => import('../../modules/seller/pages/SellerTermsPage'));
const SellerPrivacyPage = lazy(() => import('../../modules/seller/pages/SellerPrivacyPage'));
const SellerAboutPage = lazy(() => import('../../modules/seller/pages/SellerAboutPage'));
const SellerSupportPage = lazy(() => import('../../modules/seller/pages/SellerSupportPage'));
const DeliveryTermsPage = lazy(() => import('../../modules/delivery/pages/DeliveryTermsPage'));
const DeliveryPrivacyPage = lazy(() => import('../../modules/delivery/pages/DeliveryPrivacyPage'));
const DeliveryAboutPage = lazy(() => import('../../modules/delivery/pages/DeliveryAboutPage'));

// Perf audit FE-B4: extracted to its own module + lazy-loaded (see
// CustomerLayoutWrapper.jsx) so the customer cart/wishlist/location context
// stack is only downloaded by sessions that render a customer route.
const CustomerLayoutWrapper = lazy(() => import('./CustomerLayoutWrapper'));

const AppRouter = () => {
    const router = useMemo(() => createBrowserRouter([
        {
            path: '/',
            element: <Outlet />,
            errorElement: <RootErrorBoundary />,
            children: [
                {
                    path: 'login',
                    element: (
                        <Suspense fallback={<div className="flex h-screen items-center justify-center font-outfit">Loading...</div>}>
                            <CustomerAuth />
                        </Suspense>
                    ),
                },
                {
                    path: 'signup',
                    element: (
                        <Suspense fallback={<div className="flex h-screen items-center justify-center font-outfit">Loading...</div>}>
                            <CustomerAuth />
                        </Suspense>
                    ),
                },
                {
                    path: 'seller/auth',
                    element: (
                        <Suspense fallback={<div className="flex h-screen items-center justify-center font-outfit">Loading...</div>}>
                            <Auth />
                        </Suspense>
                    ),
                },
                {
                    path: 'seller/terms',
                    element: (
                        <Suspense fallback={<div className="flex h-screen items-center justify-center font-outfit">Loading...</div>}>
                            <SellerTermsPage />
                        </Suspense>
                    ),
                },
                {
                    path: 'seller/privacy',
                    element: (
                        <Suspense fallback={<div className="flex h-screen items-center justify-center font-outfit">Loading...</div>}>
                            <SellerPrivacyPage />
                        </Suspense>
                    ),
                },
                {
                    path: 'seller/about',
                    element: (
                        <Suspense fallback={<div className="flex h-screen items-center justify-center font-outfit">Loading...</div>}>
                            <SellerAboutPage />
                        </Suspense>
                    ),
                },
                {
                    path: 'seller/support',
                    element: (
                        <Suspense fallback={<div className="flex h-screen items-center justify-center font-outfit">Loading...</div>}>
                            <SellerSupportPage />
                        </Suspense>
                    ),
                },
                {
                    path: 'seller/pending-approval',
                    element: (
                        <Suspense fallback={<div className="flex h-screen items-center justify-center font-outfit">Loading...</div>}>
                            <ApplicationPending />
                        </Suspense>
                    ),
                },
                {
                    path: 'delivery/terms',
                    element: (
                        <Suspense fallback={<div className="flex h-screen items-center justify-center font-outfit">Loading...</div>}>
                            <DeliveryTermsPage />
                        </Suspense>
                    ),
                },
                {
                    path: 'delivery/privacy',
                    element: (
                        <Suspense fallback={<div className="flex h-screen items-center justify-center font-outfit">Loading...</div>}>
                            <DeliveryPrivacyPage />
                        </Suspense>
                    ),
                },
                {
                    path: 'delivery/about',
                    element: (
                        <Suspense fallback={<div className="flex h-screen items-center justify-center font-outfit">Loading...</div>}>
                            <DeliveryAboutPage />
                        </Suspense>
                    ),
                },
                {
                    path: 'admin/auth',
                    element: (
                        <Suspense fallback={<div className="flex h-screen items-center justify-center font-outfit">Loading...</div>}>
                            <AdminAuth />
                        </Suspense>
                    ),
                },
                {
                    path: 'delivery/auth',
                    element: (
                        <Suspense fallback={<div className="flex h-screen items-center justify-center font-outfit">Loading...</div>}>
                            <DeliveryAuth />
                        </Suspense>
                    ),
                },
                {
                    path: 'seller/*',
                    element: (
                        <ProtectedRoute>
                            <RoleGuard allowedRoles={[UserRole.SELLER]}>
                                <SellerModule />
                            </RoleGuard>
                        </ProtectedRoute>
                    ),
                },
                {
                    path: 'admin/*',
                    element: (
                        <ProtectedRoute>
                            <RoleGuard allowedRoles={[UserRole.ADMIN]}>
                                <AdminModule />
                            </RoleGuard>
                        </ProtectedRoute>
                    ),
                },
                {
                    path: 'delivery/*',
                    element: (
                        <ProtectedRoute>
                            <RoleGuard allowedRoles={[UserRole.DELIVERY]}>
                                <DeliveryModule />
                            </RoleGuard>
                        </ProtectedRoute>
                    ),
                },
                {
                    path: 'unauthorized',
                    element: <div className="flex h-screen items-center justify-center font-outfit">Unauthorized Access</div>,
                },
                {
                    element: <CustomerLayoutWrapper />,
                    children: [
                        { index: true, element: <Home /> },
                        { path: 'categories', element: <CategoriesPage /> },
                        { path: 'category/:categoryName', element: <CategoryProductsPage /> },
                        { path: 'product/:id', element: <ProductDetailPage /> },
                        { path: 'terms', element: <TermsPage /> },
                        { path: 'privacy', element: <PrivacyPage /> },
                        { path: 'about', element: <AboutPage /> },
                        { path: 'offers', element: <OffersPage /> },
                        { path: 'shop-by-store', element: <ShopByStorePage /> },
                        { path: 'wishlist', element: <ProtectedRoute><WishlistPage /></ProtectedRoute> },
                        { path: 'orders', element: <ProtectedRoute><OrdersPage /></ProtectedRoute> },
                        { path: 'orders/:orderId', element: <ProtectedRoute><OrderDetailPage /></ProtectedRoute> },
                        { path: 'transactions', element: <ProtectedRoute><OrderTransactionsPage /></ProtectedRoute> },
                        { path: 'addresses', element: <ProtectedRoute><AddressesPage /></ProtectedRoute> },
                        { path: 'settings', element: <ProtectedRoute><SettingsPage /></ProtectedRoute> },
                        { path: 'support', element: <ProtectedRoute><SupportPage /></ProtectedRoute> },
                        { path: 'chat', element: <ProtectedRoute><ChatPage /></ProtectedRoute> },
                        { path: 'checkout', element: <ProtectedRoute><CheckoutPage /></ProtectedRoute> },
                        { path: 'payment-status', element: <PaymentStatusPage /> },
                        { path: 'profile', element: <ProtectedRoute><ProfilePage /></ProtectedRoute> },
                        { path: 'profile/edit', element: <ProtectedRoute><EditProfilePage /></ProtectedRoute> },
                        { path: 'wallet', element: <ProtectedRoute><WalletPage /></ProtectedRoute> },
                        { path: 'notifications', element: <ProtectedRoute><NotificationsPage /></ProtectedRoute> },
                        { path: 'search', element: <SearchPage /> },
                    ]
                },
                {
                    path: '*',
                    element: <Navigate to="/" replace />
                }
            ]
        }
    ]), []);

    return <RouterProvider router={router} />;
};

export default AppRouter;
