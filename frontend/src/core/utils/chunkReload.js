// After a new deploy the hashed chunk filenames change, so a tab (or cached
// index.html) built against the previous deploy requests chunks that no longer
// exist. The fix is a hard reload to pick up the fresh index.html + chunks.
// A sessionStorage timestamp guards against reload loops if the failure is
// real (e.g. offline) rather than a stale deploy.

const RELOAD_KEY = 'chunk-reload-at';
const RELOAD_COOLDOWN_MS = 10000;

const CHUNK_ERROR_PATTERNS = [
    /error loading dynamically imported module/i, // Firefox
    /failed to fetch dynamically imported module/i, // Chrome
    /importing a module script failed/i, // Safari
    /unable to preload css/i,
    /loading (css )?chunk [\w-]+ failed/i,
];

export const isChunkLoadError = (error) => {
    const message = typeof error === 'string' ? error : error?.message;
    if (!message) return false;
    return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

// Returns true if a reload was triggered, false if we already tried recently.
export const reloadOnceForChunkError = () => {
    try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
        if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
        // sessionStorage unavailable (private mode etc.): don't risk a loop.
        return false;
    }
    window.location.reload();
    return true;
};

export const installChunkErrorHandlers = () => {
    // Fired by Vite whenever a dynamic import / preload fails.
    window.addEventListener('vite:preloadError', (event) => {
        if (reloadOnceForChunkError()) event.preventDefault();
    });

    window.addEventListener('unhandledrejection', (event) => {
        if (isChunkLoadError(event.reason)) reloadOnceForChunkError();
    });
};
