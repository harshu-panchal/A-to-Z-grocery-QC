import { clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Material 3 theme keys (index.css @theme) so overrides like `rounded-xl`
// correctly replace `rounded-m3-full`, `text-sm` replaces `text-m3-label-large`, etc.
const M3_TYPE = ["display", "headline", "title", "body", "label"].flatMap((role) =>
    ["large", "medium", "small"].map((size) => `m3-${role}-${size}`)
)
const M3_COLORS = [
    "primary", "on-primary", "primary-container", "on-primary-container", "inverse-primary",
    "secondary", "on-secondary", "secondary-container", "on-secondary-container",
    "tertiary", "on-tertiary", "tertiary-container", "on-tertiary-container",
    "error", "on-error", "error-container", "on-error-container",
    "surface", "surface-bright", "surface-dim", "surface-container-lowest", "surface-container-low",
    "surface-container", "surface-container-high", "surface-container-highest",
    "on-surface", "on-surface-variant", "outline", "outline-variant",
    "inverse-surface", "inverse-on-surface", "scrim",
].map((c) => `m3-${c}`)

const twMerge = extendTailwindMerge({
    extend: {
        theme: {
            text: M3_TYPE,
            color: M3_COLORS,
            radius: ["m3-none", "m3-xs", "m3-sm", "m3-md", "m3-lg", "m3-lg-plus", "m3-xl", "m3-xl-plus", "m3-2xl", "m3-full"],
            shadow: ["m3-1", "m3-2", "m3-3", "m3-4", "m3-5"],
            ease: ["m3-emphasized", "m3-emphasized-decelerate", "m3-emphasized-accelerate", "m3-standard", "m3-standard-decelerate", "m3-standard-accelerate"],
        },
    },
})

export function cn(...inputs) {
    return twMerge(clsx(inputs))
}
