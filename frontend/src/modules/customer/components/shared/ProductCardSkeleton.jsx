import { Skeleton } from "@shared/components/ui/Skeleton";

/** Placeholder matching ProductCard's layout so grids don't jump on load. */
export const ProductCardSkeleton = () => (
  <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white" aria-hidden="true">
    <div className="aspect-square p-2">
      <Skeleton className="h-full w-full rounded-lg" />
    </div>
    <div className="flex flex-1 flex-col gap-1.5 px-2.5 pb-2.5">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-2/3" />
      <Skeleton className="h-3 w-12" />
      <div className="mt-auto flex items-end justify-between pt-1.5">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-9 w-[76px] rounded-lg" />
      </div>
    </div>
  </div>
);

export const ProductGridSkeleton = ({ count = 6, className = "" }) => (
  <div className={className} role="status" aria-label="Loading products">
    {Array.from({ length: count }).map((_, i) => (
      <ProductCardSkeleton key={i} />
    ))}
  </div>
);

export default ProductCardSkeleton;
