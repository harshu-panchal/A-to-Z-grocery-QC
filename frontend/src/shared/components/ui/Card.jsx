import {
    Card as ShadcnCard,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { cn } from '@/lib/utils';

/**
 * Card
 *
 * Design-system primitive (Material 3 elevated card): medium corner
 * (12px), 1px neutral border plus level-1 elevation, flat white surface,
 * M3 title/body typescale.
 */
const Card = ({ children, title, subtitle, className, headerAction, footer, contentClassName, ...props }) => {
    return (
        <ShadcnCard
            className={cn(
                "bg-white border border-slate-200 rounded-m3-md shadow-m3-1",
                className
            )}
            {...props}
        >
            {(title || subtitle || headerAction) && (
                <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-slate-100 px-4 py-3">
                    <div className="space-y-0.5">
                        {title && <CardTitle className="text-m3-title-medium text-slate-900">{title}</CardTitle>}
                        {subtitle && <CardDescription className="text-m3-body-small text-slate-500">{subtitle}</CardDescription>}
                    </div>
                    {headerAction && <div>{headerAction}</div>}
                </CardHeader>
            )}
            <CardContent className={cn("p-4", !title && !subtitle && !headerAction && "pt-4", contentClassName)}>
                {children}
            </CardContent>
            {footer && (
                <CardFooter className="bg-slate-50 border-t border-slate-100 px-4 py-2.5">
                    {footer}
                </CardFooter>
            )}
        </ShadcnCard>
    );
};

export default Card;
