import axios from 'axios';
import { resolveApiBaseUrl } from './resolveApiBaseUrl';
import { getStoredAuthToken } from '@core/utils/authStorage';
import { getActiveRole, ROLES } from '@core/auth/activeRoleStore';
import { rawRemove, STORAGE_KEYS } from '@core/utils/storage';

const STORAGE_KEY_TO_AUTH_ROUTE = {
    [STORAGE_KEYS.AUTH_ADMIN]: '/admin/auth',
    [STORAGE_KEYS.AUTH_SELLER]: '/seller/auth',
    [STORAGE_KEYS.AUTH_DELIVERY]: '/delivery/auth',
    [STORAGE_KEYS.AUTH_CUSTOMER]: '/login',
};

const ROLE_TO_STORAGE_KEY = {
    [ROLES.SELLER]: STORAGE_KEYS.AUTH_SELLER,
    [ROLES.ADMIN]: STORAGE_KEYS.AUTH_ADMIN,
    [ROLES.DELIVERY]: STORAGE_KEYS.AUTH_DELIVERY,
    [ROLES.CUSTOMER]: STORAGE_KEYS.AUTH_CUSTOMER,
};

// URL-prefix → storage-key map used as a *fallback* for the few call sites
// (e.g. an admin page that calls a /products endpoint) where the request URL
// itself encodes the intended role. The primary source is the activeRoleStore.
// Returns the storage KEY (not the token) so the caller can remember which
// role's session actually served the request.
function tokenForRequestUrlKey(url) {
    if (!url) return null;
    if (url.startsWith('/seller')) return STORAGE_KEYS.AUTH_SELLER;
    if (url.startsWith('/admin')) return STORAGE_KEYS.AUTH_ADMIN;
    if (url.startsWith('/delivery')) return STORAGE_KEYS.AUTH_DELIVERY;
    if (
        url.startsWith('/customer') ||
        url.startsWith('/cart') ||
        url.startsWith('/wishlist') ||
        url.startsWith('/categories') ||
        url.startsWith('/products') ||
        url.startsWith('/payments')
    ) {
        return STORAGE_KEYS.AUTH_CUSTOMER;
    }
    return null;
}

const axiosInstance = axios.create({
    baseURL: resolveApiBaseUrl(),
});

axiosInstance.interceptors.request.use(
    (config) => {
        const url = config.url || '';
        const isMultipartRequest =
            typeof FormData !== 'undefined' && config.data instanceof FormData;

        if (isMultipartRequest) {
            if (typeof config.headers?.delete === 'function') {
                config.headers.delete('Content-Type');
            } else if (config.headers) {
                delete config.headers['Content-Type'];
            }
        }

        // Primary: pick token from the active role (set by the router on mount).
        const activeRole = getActiveRole();
        const primaryStorageKey = ROLE_TO_STORAGE_KEY[activeRole];
        let token = primaryStorageKey ? getStoredAuthToken(primaryStorageKey) : null;
        let resolvedStorageKey = token ? primaryStorageKey : null;

        // Fallback 1: URL-derived token (cross-portal calls, e.g. admin → /products).
        if (!token) {
            const urlKey = tokenForRequestUrlKey(url);
            const urlToken = urlKey ? getStoredAuthToken(urlKey) : null;
            if (urlToken) {
                token = urlToken;
                resolvedStorageKey = urlKey;
            }
        }

        // Fallback 2: customer token for un-prefixed/public-ish endpoints while
        // the user is not currently inside a privileged portal.
        if (
            !token &&
            activeRole !== ROLES.ADMIN &&
            activeRole !== ROLES.SELLER &&
            activeRole !== ROLES.DELIVERY
        ) {
            const customerToken = getStoredAuthToken(STORAGE_KEYS.AUTH_CUSTOMER);
            if (customerToken) {
                token = customerToken;
                resolvedStorageKey = STORAGE_KEYS.AUTH_CUSTOMER;
            }
        }

        // Fallback 3: legacy shared 'token' key.
        if (!token) {
            const legacyToken = getStoredAuthToken(STORAGE_KEYS.AUTH_LEGACY);
            if (legacyToken) {
                token = legacyToken;
                resolvedStorageKey = STORAGE_KEYS.AUTH_LEGACY;
            }
        }

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
            // Audit fix C1/C2: remember which storage key actually supplied
            // this request's token so the response interceptor can act on
            // the right session when the server rejects it (401), instead
            // of re-deriving (and possibly re-guessing wrong) after the
            // fact.
            config._authStorageKey = resolvedStorageKey;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Audit fix C1: a 401 used to be logged and otherwise ignored — the stored
// token was never cleared, so `isAuthenticated` (token-presence-based)
// stayed true forever and the app never routed the user back to login.
// Any component assuming an authenticated session then hung on a
// perpetual loading state or null-referenced against a `user` that could
// never resolve. A 401 from this backend always means the token is
// genuinely dead (invalid signature, expired, or invalidated by a
// password change — see backend authMiddleware.js), so it's safe to
// always treat it as "this session is over."
let redirectInFlight = false;
function clearSessionAndRedirect(storageKey) {
    if (!storageKey || storageKey === STORAGE_KEYS.AUTH_LEGACY) return;
    rawRemove(storageKey);

    // Only force a redirect if the failing request belonged to the portal
    // the user is actually looking at right now. A stale request left over
    // from a different, already-navigated-away-from portal shouldn't yank
    // the user out of whatever they're doing now — dropping its token is
    // enough to stop it from being resent.
    const activeStorageKey = ROLE_TO_STORAGE_KEY[getActiveRole()];
    if (storageKey !== activeStorageKey) return;
    if (redirectInFlight) return;
    if (typeof window === 'undefined') return;

    const authRoute = STORAGE_KEY_TO_AUTH_ROUTE[storageKey];
    if (!authRoute || window.location.pathname === authRoute) return;

    redirectInFlight = true;
    window.location.href = authRoute;
}

// Response interceptor for API calls
axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            clearSessionAndRedirect(originalRequest._authStorageKey);
        }
        return Promise.reject(error);
    }
);

export default axiosInstance;
