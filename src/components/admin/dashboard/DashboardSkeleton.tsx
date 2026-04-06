import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Caricamento in corso...">
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-6 space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-6 space-y-4">
            <div className="flex justify-between items-center">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        ))}
      </div>

      <span className="sr-only">Caricamento in corso...</span>
    </div>
  );
}
