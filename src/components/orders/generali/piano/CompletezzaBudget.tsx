// src/components/orders/generali/piano/CompletezzaBudget.tsx
// Il riquadro «Budget da completare»: cosa manca prima di approvare, una riga per problema e,
// accanto, l'azione che lo risolve. È l'unico posto che lo dice — l'elenco «Cosa manca» sopra
// non ripete le stime e i mesi mancanti (PianoEconomico) —: prima le stesse due frasi
// comparivano due volte, in due barre gialle e di nuovo qui.
import { useState } from "react";
import { AlertTriangle, CalendarDays, ChevronDown, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useModificaVoce } from "@/hooks/useGeneralePiano";
import { controllaBudget } from "@/lib/orders/generali/budgetCompletezza";
import type { VocePiano } from "@/lib/orders/generali/pianoConti";
import { cn } from "@/lib/utils";

export function CompletezzaBudget({
  generaleId,
  versioneId,
  voci,
  modificabile,
  onCalendario,
  stimeAperte: stimeAperteAllInizio = false,
}: {
  generaleId: string;
  versioneId: string;
  voci: VocePiano[];
  modificabile: boolean;
  /** Apre il calendario rapido (CalendarioPianoDialog). */
  onCalendario?: () => void;
  /** L'elenco delle voci senza stima già aperto (dalla Panoramica, ?stime=1). */
  stimeAperte?: boolean;
}) {
  const modifica = useModificaVoce(generaleId, versioneId);
  const [stimeAperte, setStimeAperte] = useState(stimeAperteAllInizio);
  const c = controllaBudget(voci);
  if (c.completo)
    return (
      <p className="generale-budget-complete text-xs text-emerald-700" role="status">
        Non risultano stime o scadenze mancanti nel budget.
      </p>
    );
  const riga = "flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2";
  return (
    <section
      aria-labelledby="budget-da-completare"
      className="overflow-hidden rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <header className="flex flex-wrap items-baseline gap-x-2 border-b border-amber-200 px-4 py-2 dark:border-amber-500/30">
        <AlertTriangle className="h-4 w-4 shrink-0 self-center" aria-hidden="true" />
        <h3 id="budget-da-completare" className="font-semibold">Budget da completare</h3>
        <span className="text-xs text-amber-800 dark:text-amber-200/80">L'approvazione si sblocca quando non manca niente.</span>
      </header>
      <ul className="divide-y divide-amber-200 dark:divide-amber-500/30">
        {c.calendario.length > 0 && (
          <li className={riga}>
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{c.calendario.length === 1 ? "1 voce" : `${c.calendario.length} voci`}</span> con un importo
              {c.calendario.length === 1 ? " non ha il mese" : " non hanno il mese"}: non entrano nella cassa né nel capitale impegnato.
            </span>
            {modificabile && onCalendario && (
              <Button variant="brand" size="sm" className="h-8" onClick={onCalendario}>
                <CalendarDays className="mr-1.5 h-3.5 w-3.5" /> Metti i mesi
              </Button>
            )}
          </li>
        )}
        {c.mancanti.length > 0 && (
          <li>
            <div className={riga}>
              <PencilLine className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{c.mancanti.length === 1 ? "1 voce" : `${c.mancanti.length} voci`}</span>
                {c.mancanti.length === 1 ? " non ha" : " non hanno"} ancora una stima. Se non costa niente, si conferma lo zero.
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-amber-300 bg-transparent hover:bg-amber-100 dark:border-amber-500/40"
                aria-expanded={stimeAperte}
                aria-controls="voci-senza-stima"
                onClick={() => setStimeAperte((x) => !x)}
              >
                {stimeAperte ? "Nascondi" : "Vedi le voci"}
                <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition-transform", stimeAperte && "rotate-180")} aria-hidden="true" />
              </Button>
            </div>
            {stimeAperte && (
              <div id="voci-senza-stima" className="border-t border-amber-200 px-4 pb-2 pt-1 dark:border-amber-500/30">
                <p className="py-1 text-xs">Scrivi il previsto nella tabella; se la voce non comporta costi, conferma lo zero.</p>
                <ul className="grid gap-x-6 sm:grid-cols-2">
                  {c.mancanti.map((v) => (
                    <li key={v.descrizione + v.id} className="flex items-center justify-between gap-2 border-t border-amber-200/70 py-1 dark:border-amber-500/20">
                      <span className="min-w-0 truncate" title={v.descrizione}>{v.descrizione}</span>
                      {modificabile && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-xs hover:bg-amber-100"
                          disabled={modifica.isPending}
                          onClick={() =>
                            modifica.mutate(
                              { id: v.id, modifica: { importo: 0 } },
                              { onError: (e) => toast.error(e instanceof Error ? e.message : "Stima non salvata") },
                            )
                          }
                        >
                          Conferma zero
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        )}
        {c.altri.map((p) => (
          <li key={p} className={riga}>
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">{p}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
