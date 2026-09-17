import { Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@core/query/queryClient';
import AppRouter from '@core/routes/AppRouter';
import { AuthProvider } from '@core/context/AuthContext';
import { SettingsProvider } from '@core/context/SettingsContext';
import { SupportUnreadProvider } from '@core/context/SupportUnreadContext';
import { SidebarBadgesProvider } from '@core/context/SidebarBadgesContext';
import SeoHead from '@core/components/SeoHead';
import { ToastProvider } from './shared/components/ui/Toast';
import Loader from './shared/components/ui/Loader';
import ErrorBoundary from './shared/components/ErrorBoundary';
import LenisScroll from './shared/components/LenisScroll';

function App() {
    return (
        <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
                <AuthProvider>
                    <SettingsProvider>
                        <SeoHead />
                        <ToastProvider>
                            <Suspense fallback={<Loader fullScreen />}>
                                <SupportUnreadProvider>
                                    <SidebarBadgesProvider>
                                        <LenisScroll />
                                        <AppRouter />
                                    </SidebarBadgesProvider>
                                </SupportUnreadProvider>
                            </Suspense>
                        </ToastProvider>
                    </SettingsProvider>
                </AuthProvider>
            </QueryClientProvider>
        </ErrorBoundary>
    );
}

export default App;
