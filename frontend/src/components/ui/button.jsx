import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-m3-full text-m3-label-large transition-[background-color,color,box-shadow,border-radius] duration-200 ease-m3-standard active:rounded-m3-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-m3-1",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-m3-1",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:shadow-m3-1",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        brand: "bg-black text-primary-foreground hover:bg-brand-700 hover:shadow-m3-1",
        brandOutline: "border-2 border-brand-50 bg-white text-brand-600 hover:bg-brand-50",
      },
      size: {
        default: "h-8 px-4 py-1.5",
        sm: "h-7 px-3 text-m3-label-medium",
        lg: "h-10 px-6",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  // motion.button stays so callers can still pass framer props (whileTap etc.).
  // M3 press feedback is the CSS shape morph (active:rounded-m3-md), not scaling.
  const Comp = asChild ? Slot : motion.button

  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
