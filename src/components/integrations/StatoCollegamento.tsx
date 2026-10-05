/**
 * Lo stato di un collegamento, detto allo stesso modo in tutta la pagina
 * Integrazioni: un pallino colorato e una parola.
 *
 * Prima ogni pannello aveva colori e parole suoi: lo stesso «token scaduto»
 * era arancione nei calendari e rosso nelle caselle, e lo stato giusto si
 * chiamava a volte Connesso, a volte Attivo, a volte Collegato (05/10/2026).
 */
import type React from "react";
import { cn } from "@/lib/utils";

export type Tono = "ok" | "attenzione" | "errore" | "spento";

const PALLINO: Record<Tono, string> = {
  ok: "bg-emerald-500",
  attenzione: "bg-amber-500",
  errore: "bg-rose-500",
  spento: "border border-muted-foreground/60",
};

const TESTO: Record<Tono, string> = {
  ok: "text-emerald-700 dark:text-emerald-400",
  attenzione: "text-amber-700 dark:text-amber-400",
  errore: "text-rose-700 dark:text-rose-400",
  spento: "text-muted-foreground",
};

export function PallinoStato({
  tono,
  children,
  className,
  title,
}: {
  tono: Tono;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", TESTO[tono], className)} title={title}>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", PALLINO[tono])} aria-hidden="true" />
      {children}
    </span>
  );
}
