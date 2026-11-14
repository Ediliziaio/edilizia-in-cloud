// src/components/orders/generali/design/CompletaOperazione.tsx
// «Completa l'operazione»: un'operazione appena nata da un business plan ha voci senza mese,
// stime da fare e nessuna unità, e la Panoramica lo diceva in tre avvisi sparsi. Qui è un
// percorso solo, nell'ordine in cui il titolare se lo chiede — cosa vendo, quando entrano ed
// escono i soldi, cosa manca, poi l'approvazione — con l'azione accanto a ogni passo.
// Sparisce quando non manca più niente (lo decide AvvisiPiano, che lo mostra).
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PassoOperazione {
  id: "unita" | "calendario" | "stime" | "approva" | "fonti";
  titolo: string;
  /** Cosa manca, o cosa è fatto. */
  testo: string;
  fatto: boolean;
  azione?: { etichetta: string; apri: () => void };
}

// Classi scritte per intero: Tailwind non vede quelle composte.
const COLONNE: Record<number, string> = { 3: "xl:grid-cols-3", 4: "xl:grid-cols-4", 5: "xl:grid-cols-5" };

export function CompletaOperazione({ passi, telefono }: { passi: PassoOperazione[]; telefono: boolean }) {
  const fatti = passi.filter((p) => p.fatto).length;
  // Il primo passo da fare è quello su cui si lavora: ha l'azione in evidenza.
  const prossimo = passi.find((p) => !p.fatto)?.id;
  return (
    <section aria-labelledby="completa-operazione" className="generale-panel overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5">
        <h2 id="completa-operazione" className="text-sm font-semibold">Completa l'operazione</h2>
        <span className="text-xs text-muted-foreground">Finché mancano, margine finale e fabbisogno di capitale restano sospesi.</span>
        <span className="ml-auto flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
          {fatti} di {passi.length}
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span className="block h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${(fatti / passi.length) * 100}%` }} />
          </span>
        </span>
      </header>
      <ol className={cn("grid divide-y md:grid-cols-2 md:divide-y-0 xl:divide-x", COLONNE[passi.length] ?? "xl:grid-cols-4")}>
        {passi.map((p, i) => (
          <li
            key={p.id}
            className={cn(
              "flex gap-3 px-4 py-3 md:[&:nth-child(n+3)]:border-t xl:[&:nth-child(n+3)]:border-t-0",
              p.id === prossimo && "bg-orange-50/60 dark:bg-orange-500/5",
            )}
            aria-current={p.id === prossimo ? "step" : undefined}
          >
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums",
                p.fatto ? "border-emerald-500 bg-emerald-500 text-white" : p.id === prossimo ? "border-orange-500 text-orange-700 dark:text-orange-300" : "text-muted-foreground",
              )}
              aria-hidden="true"
            >
              {p.fatto ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium leading-tight", p.fatto && "text-muted-foreground")}>
                {p.titolo}
                <span className="sr-only">{p.fatto ? ": fatto" : ": da fare"}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{p.testo}</p>
              {!p.fatto && p.azione && !telefono && (
                <button
                  type="button"
                  onClick={p.azione.apri}
                  className={cn(
                    "mt-1.5 inline-flex items-center gap-1 text-xs font-semibold",
                    p.id === prossimo ? "text-orange-700 hover:text-orange-800 dark:text-orange-300" : "text-foreground/80 hover:text-foreground",
                  )}
                >
                  {p.azione.etichetta} <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
