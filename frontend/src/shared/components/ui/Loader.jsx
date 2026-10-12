import { useContext } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import SettingsContext from '@core/context/SettingsContext';
import DefaultLogo from '@/assets/atoz-logo.webp';

const Loader = ({ size = 'md', fullScreen = false, className }) => {
    // Read settings without useSettings() so the loader also works outside the provider
    const settings = useContext(SettingsContext)?.settings;

    const sizeClasses = {
        sm: 'h-6 w-6',
        md: 'h-10 w-10',
        lg: 'h-16 w-16',
    };

    if (fullScreen) {
        const appName = settings?.appName || 'A to Z Grocery';
        return (
            <div
                role="status"
                aria-live="polite"
                className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white"
            >
                <div className="relative grid h-24 w-24 place-items-center">
                    {/* spinning ring around the logo */}
                    <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-[#047531]/15 border-t-[#047531]" />
                    <img
                        src={settings?.logoUrl || DefaultLogo}
                        alt={appName}
                        className="h-16 w-16 rounded-full object-contain"
                    />
                </div>
                <p className="text-sm font-semibold tracking-wide text-slate-500">Loading…</p>
            </div>
        );
    }

    return (
        <Loader2
            className={cn(
                'animate-spin text-primary',
                sizeClasses[size],
                className
            )}
        />
    );
};

export default Loader;
