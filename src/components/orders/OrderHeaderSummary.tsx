import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Nelle viste di lavoro (cantiere, materiali, economia) il riepilogo si riduce a
 * una riga con i numeri che servono, e si apre con un clic: senza, i quattro
 * blocchi occupavano ~740px e il contenuto della scheda partiva in fondo allo
 * schermo. La panoramica mantiene tutto aperto.
 *
 * I figli restano montati anche a riepilogo chiuso: nessun dato si ricarica.
 */
export function OrderHeaderSummary({
  compact,
  riepilogo,
  children,
}: {
  compact: boolean;
  /** Riga di sintesi mostrata a riepilogo chiuso (stato, avanzamento, importi). */
  riepilogo?: ReactNode;
  children: ReactNode;
}) {
  if (!compact) return <>{children}</>;
  return <details className="group/header-summary rounded-lg border border-slate-200 bg-white">
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-1.5 text-xs font-semibold text-blue-950 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 [&::-webkit-details-marker]:hidden">
      {riepilogo ? <>
        <span className="min-w-0 flex-1">{riepilogo}</span>
        <span className="flex shrink-0 items-center gap-1 text-slate-500">
          <span className="max-sm:hidden group-open/header-summary:hidden">Mostra dettagli</span>
          <span className="hidden group-open/header-summary:inline max-sm:group-open/header-summary:hidden">Nascondi</span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open/header-summary:rotate-180" />
        </span>
      </> : <>
        Numeri e stato commessa
        <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open/header-summary:rotate-180" />
      </>}
    </summary>
    <div className="space-y-3 border-t border-slate-100 p-2">{children}</div>
  </details>;
}

/** Una voce della riga di sintesi: etichetta piccola + valore. */
export function VoceRiepilogo({
  etichetta,
  children,
  tono,
  soloDesktop,
  senzaEtichettaMobile,
}: {
  etichetta: string;
  children: ReactNode;
  tono?: "ok" | "attenzione";
  /** Sul telefono la voce non c'è: la riga resta di due righe al massimo. */
  soloDesktop?: boolean;
  /** Sul telefono si vede solo il valore («100%», non «Avanzamento 100%»). */
  senzaEtichettaMobile?: boolean;
}) {
  return <span className={cn("inline-flex items-baseline gap-1.5 whitespace-nowrap", soloDesktop && "max-sm:hidden")}>
    <span className={cn("text-[10px] font-medium uppercase tracking-wide text-slate-500", senzaEtichettaMobile && "max-sm:hidden")}>{etichetta}</span>
    <span className={tono === "ok" ? "text-emerald-700" : tono === "attenzione" ? "text-amber-700" : "text-slate-900"}>{children}</span>
  </span>;
}
