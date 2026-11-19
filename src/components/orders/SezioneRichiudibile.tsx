import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Una sezione con titolo e una riga che dice cos'è, chiusa finché non serve (01/11/2026). Prima IVA,
 * ritenute, blocca prezzo e provvigioni stavano in fila in fondo alla pagina, senza titolo comune: nessuno
 * sapeva che erano lì.
 */
export function SezioneRichiudibile({ titolo, descrizione, riepilogo, icona, aperta = false, children }: {
  titolo: string; descrizione?: string; riepilogo?: ReactNode; icona?: ReactNode; aperta?: boolean; children: ReactNode;
}) {
  return (
    <details className="group rounded-lg border bg-background" open={aperta}>
      <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5 gap-y-2 rounded-lg px-3 py-2.5 hover:bg-muted/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center [&::-webkit-details-marker]:hidden">
        <span className="col-start-1 row-start-1 mt-0.5 text-muted-foreground sm:mt-0" aria-hidden="true">{icona}</span>
        <span className="col-start-2 row-start-1 min-w-0">
          <span className="block text-sm font-semibold">{titolo}</span>
          {descrizione && <span className="mt-0.5 block text-xs text-muted-foreground">{descrizione}</span>}
        </span>
        {riepilogo && <span className="col-span-2 col-start-2 row-start-2 flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:justify-end">{riepilogo}</span>}
        <ChevronDown className="col-start-3 row-start-1 h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180 sm:col-start-4" aria-hidden="true" />
      </summary>
      <div className="border-t px-3 py-3">{children}</div>
    </details>
  );
}
