import { ArrowRight, Check, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PassoOperazione {
  id: "unita" | "calendario" | "stime" | "approva" | "fonti";
  titolo: string;
  /** Cosa manca, o cosa è fatto. */
  testo: string;
  fatto: boolean;
  azione?: { etichetta: string; apri: () => void };
}

export function CompletaOperazione({ passi, telefono }: { passi: PassoOperazione[]; telefono: boolean }) {
  const daFare = passi.filter(p => !p.fatto);
  if (!daFare.length) return null;
  const completati = passi.filter(p => p.fatto);

  return (
    <section aria-labelledby="completa-operazione" className="generale-panel overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2 sm:px-4">
        <ListChecks className="size-4 text-primary" aria-hidden="true" />
        <h2 id="completa-operazione" className="text-sm font-semibold">Completa l’operazione</h2>
        <span className="text-xs text-muted-foreground">{daFare.length} da completare</span>
      </header>
      <ul className="divide-y">
        {daFare.map((passo, indice) => (
          <li key={passo.id} className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 sm:px-4",
            indice === 0 && "bg-orange-50/60 dark:bg-orange-500/5",
          )}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{passo.titolo}</p>
              <p className="text-xs text-muted-foreground">{passo.testo}</p>
            </div>
            {passo.azione && !telefono && (
              <button type="button" onClick={passo.azione.apri} className="generale-text-link inline-flex shrink-0 items-center gap-1 text-xs font-medium">
                {passo.azione.etichetta} <ArrowRight className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {completati.length > 0 && (
        <details className="border-t px-3 py-2 text-xs text-muted-foreground sm:px-4">
          <summary className="w-fit cursor-pointer font-medium">{completati.length} passaggi completati</summary>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {completati.map(p => <li key={p.id} className="flex items-start gap-2">
              <Check className="size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
              <span><strong className="font-medium text-foreground">{p.titolo}</strong> · {p.testo}</span>
            </li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
