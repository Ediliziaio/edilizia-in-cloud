/**
 * Il piede del preventivatore: lo stato del salvataggio a sinistra, le azioni a
 * destra (Indietro / Salva / Avanti). Fisso in basso (vedi `posizione.ts`).
 *
 * Il salvataggio si dice com'è davvero: «Salvato alle 11:24» oppure «Solo su
 * questo dispositivo». Non «Salvataggio automatico» a prescindere.
 */
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { STICKY_BASSO } from "./posizione";

export type StatoSalvataggio = "salvando" | "modifiche" | "salvato" | "errore" | "locale" | "nuovo";

interface StatoProps {
  stato: StatoSalvataggio;
  /** «Salvato 12s fa»: il testo lo compone chi conosce l'ora. */
  testo?: string | null;
}

const PUNTO: Record<Exclude<StatoSalvataggio, "salvando">, string> = {
  modifiche: "bg-amber-500",
  salvato: "bg-emerald-500",
  errore: "bg-red-500",
  locale: "bg-amber-500",
  nuovo: "bg-slate-300",
};

const TESTO_DI_DEFAULT: Record<StatoSalvataggio, string> = {
  salvando: "Salvataggio…",
  modifiche: "Modifiche non salvate: si salvano da sole tra un attimo",
  salvato: "Salvato",
  errore: "Salvataggio non riuscito: riprova",
  locale: "Solo su questo dispositivo",
  nuovo: "Nuovo: si crea con «Crea e continua»",
};

export function StatoDelSalvataggio({ stato, testo }: StatoProps) {
  const colore = stato === "salvando" ? "text-blue-600" : stato === "errore" ? "text-red-600" : stato === "salvato" ? "text-emerald-700" : "text-slate-500";
  return (
    <span role="status" className={cn("flex min-w-0 items-center gap-1.5 text-xs font-medium", colore)}>
      {stato === "salvando" ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", PUNTO[stato])} />
      )}
      <span className="truncate">{testo?.trim() || TESTO_DI_DEFAULT[stato]}</span>
    </span>
  );
}

interface PiedeProps {
  /** A sinistra, da computer: di solito `<StatoDelSalvataggio />`. */
  stato?: ReactNode;
  /** A destra: Indietro, Salva, Avanti. */
  children: ReactNode;
  /** Da telefono, a sinistra delle azioni (per esempio il totale che apre l'anteprima). */
  telefono?: ReactNode;
  className?: string;
}

export function PiedePreventivatore({ stato, children, telefono, className }: PiedeProps) {
  return (
    <div
      className={cn(
        "sticky z-30 flex items-center gap-3 border-t border-slate-200 bg-white/95 px-4 py-2.5 shadow-[0_-4px_12px_rgba(15,23,42,0.04)] backdrop-blur sm:px-6",
        "max-md:gap-2 max-md:rounded-2xl max-md:border max-md:px-2.5 max-md:py-2 max-md:shadow-[0_-8px_20px_rgba(15,23,42,0.08)]",
        STICKY_BASSO,
        className,
      )}
    >
      {stato && <div className="min-w-0 flex-1 max-md:hidden">{stato}</div>}
      {telefono && <div className="min-w-0 md:hidden">{telefono}</div>}
      <div className="flex items-center gap-2 max-md:min-w-0 max-md:flex-1 max-md:justify-end">{children}</div>
    </div>
  );
}
