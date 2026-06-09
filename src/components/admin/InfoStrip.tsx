import type { ReactNode } from "react";

/**
 * InfoStrip — griglia compatta di coppie etichetta/valore per la "Panoramica"
 * nelle schede espanse delle dashboard admin (produttori/studi).
 */
export function InfoStrip({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-lg border bg-background p-3 sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{it.label}</div>
          <div className="truncate text-sm font-medium" title={typeof it.value === "string" ? it.value : undefined}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}
