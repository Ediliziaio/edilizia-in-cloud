// src/components/orders/generali/documenti/IconaStato.tsx
// L'icona dello stato di una voce della checklist, col suo colore.
import { AlertTriangle, CheckCircle2, Circle, Clock, Minus } from "lucide-react";
import { COLORE_TONO, tonoCasella } from "@/components/orders/generali/documenti/statoVisivo";
import type { CasellaDocumento } from "@/lib/orders/generali/documenti";
import { cn } from "@/lib/utils";

export function IconaStato({ c, className }: { c: CasellaDocumento; className?: string }) {
  const Icona = c.stato === "presente" ? CheckCircle2
    : c.stato === "in_scadenza" ? Clock
      : c.stato === "scaduto" ? AlertTriangle
        : c.stato === "non_serve" ? Minus : Circle;
  return <Icona className={cn("h-4 w-4 shrink-0", COLORE_TONO[tonoCasella(c)], className)} aria-hidden="true" />;
}
