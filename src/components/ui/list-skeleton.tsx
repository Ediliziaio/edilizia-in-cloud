/**
 * IMPROVEMENT #22 — Skeleton loaders specifici (vs spinner generico)
 *
 * Componenti riusabili per stati di loading. Mostrano la "shape" della
 * pagina/lista prima che i dati arrivino, riducendo il flicker.
 */
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton per liste di righe (orders, quotes, contacts...).
 */
export function ListRowsSkeleton({
  rows = 5,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="space-y-2" aria-label="Caricamento elenco">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 border rounded-md"
        >
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton
              key={j}
              className={
                j === 0
                  ? "h-4 w-1/3"
                  : j === columns - 1
                    ? "h-4 w-16 ml-auto"
                    : "h-4 flex-1"
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton per griglia di card (catalog, dashboard).
 */
export function CardsGridSkeleton({
  cards = 6,
}: {
  cards?: number;
}) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      aria-label="Caricamento cards"
    >
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton per dettaglio (header + corpo + sidebar).
 */
export function DetailPageSkeleton() {
  return (
    <div className="container mx-auto p-4 space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}
