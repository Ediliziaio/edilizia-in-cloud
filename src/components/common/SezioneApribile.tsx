import type { ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Un gruppo che si apre e si chiude (06/10/2026), per le pagine divise in
 * gruppi come gli operai nelle squadre: Subappaltatori, Mezzi e attrezzature.
 * Il titolo ha la riga tutta per sé (nei gruppi stretti e da telefono si
 * tagliava); sotto, quanti sono, cosa sta andando bene e cosa va guardato.
 */
export function SezioneApribile({
  titolo,
  icona: Icona,
  iconaNodo,
  colore,
  conteggio,
  buono,
  avviso,
  dettaglio,
  aperta,
  className,
  children,
}: {
  titolo: string;
  icona?: LucideIcon;
  /** In alternativa a `icona`, un'icona già pronta (es. quella del tipo di mezzo). */
  iconaNodo?: ReactNode;
  colore?: string;
  /** Già in parole: «2 ditte», «3 mezzi». */
  conteggio: string;
  /** In verde dopo il conteggio: «1 al lavoro», «2 sui cantieri». */
  buono?: string | null;
  /** In rosso: «2 DURC da controllare», «1 scadenza». */
  avviso?: string | null;
  /** A destra, solo da tablet e computer. */
  dettaglio?: ReactNode;
  aperta: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details open={aperta} className={cn("group overflow-hidden rounded-2xl border bg-white shadow-sm", className)} style={colore ? { borderTop: `3px solid ${colore}` } : undefined}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 bg-slate-50/70 px-4 py-2.5 group-open:border-b max-sm:px-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
            {Icona ? <Icona className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" /> : iconaNodo}
            <span className="truncate">{titolo}</span>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {conteggio}
            {buono && <span className="text-emerald-700"> · {buono}</span>}
            {avviso && <span className="font-medium text-red-700"> · {avviso}</span>}
          </p>
        </div>
        {dettaglio && <span className="min-w-0 truncate text-xs text-slate-500 max-sm:hidden">{dettaglio}</span>}
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      {children}
    </details>
  );
}

/**
 * I gruppi piccoli (uno o due elementi) uno accanto all'altro, tre per riga; i
 * grandi a tutta larghezza. Prima ogni gruppo prendeva la riga intera, e con un
 * elemento solo lasciava vuote due colonne su tre.
 */
export const TABELLONE_GRUPPI = "grid items-start gap-3 lg:grid-cols-2 xl:grid-cols-3";
export const gruppoPiccolo = (n: number) => n <= 2;
export const larghezzaGruppo = (n: number) => (gruppoPiccolo(n) ? undefined : "lg:col-span-2 xl:col-span-3");
/** Tutte aperte se gli elementi sono pochi; con tanti, aperta solo la prima sezione. */
export const apriGruppo = (indice: number, totale: number) => totale <= 24 || indice === 0;
