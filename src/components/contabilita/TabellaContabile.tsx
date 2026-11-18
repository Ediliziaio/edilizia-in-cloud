import { useState, type ReactNode } from "react";
import { BarraScorrimentoOrizzontale } from "@/components/common/BarraScorrimentoOrizzontale";

export function TabellaContabile({ children }: { children: ReactNode }) {
  const [contenitore, setContenitore] = useState<HTMLDivElement | null>(null);
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
      <BarraScorrimentoOrizzontale contenitore={contenitore} />
      <div ref={setContenitore} className="overflow-x-auto [&_th]:whitespace-nowrap [&_.tabular-nums]:whitespace-nowrap [&_th]:font-medium [&_tbody_tr:hover]:bg-muted/40">
        {children}
      </div>
    </div>
  );
}
