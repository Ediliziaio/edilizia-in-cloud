import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Una sezione con titolo e una riga che dice cos'è, chiusa finché non serve (01/11/2026). Prima IVA,
 * ritenute, blocca prezzo e provvigioni stavano in fila in fondo alla pagina, senza titolo comune: nessuno
 * sapeva che erano lì.
 */
export function SezioneRichiudibile({ titolo, descrizione, icona, aperta = false, children }: {
  titolo: string; descrizione: string; icona?: ReactNode; aperta?: boolean; children: ReactNode;
}) {
  return (
    <details className="group rounded-lg border bg-white" open={aperta}>
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        {icona && <span className="mt-0.5 text-slate-500" aria-hidden="true">{icona}</span>}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-900">{titolo}</span>
          <span className="block text-xs text-muted-foreground">{descrizione}</span>
        </span>
        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t px-4 py-3">{children}</div>
    </details>
  );
}
