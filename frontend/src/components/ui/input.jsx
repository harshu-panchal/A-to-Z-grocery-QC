import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-m3-xs border border-input bg-transparent px-3 py-1 text-m3-body-large transition-[border-color,box-shadow] duration-200 ease-m3-standard file:border-0 file:bg-transparent file:text-m3-label-large file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-600 disabled:cursor-not-allowed disabled:opacity-40",
        className
      )}
      ref={ref}
      {...props} />
  );
})
Input.displayName = "Input"

export { Input }
