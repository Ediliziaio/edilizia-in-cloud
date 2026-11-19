/**
 * Il corpo del preventivatore: il lavoro a sinistra, a tutta la larghezza che
 * resta, e l'anteprima a destra in una colonna stretta che si restringe ancora
 * quando manca spazio (da 300 a 400 px) e si può nascondere.
 *
 * Sotto i 1280 px non c'è colonna (la barra laterale dell'app ne toglie 240 e il
 * lavoro resterebbe stretto): l'anteprima si apre da un pulsante (vedi
 * `AnteprimaMobile`) e il totale resta nella barra delle fasi.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STICKY_ANTEPRIMA } from "./posizione";
import { QuoteCustomFieldsPanel } from "@/components/shared/QuoteCustomFieldsPanel";

interface Props {
  children: ReactNode;
  /** Il pannello di destra; assente = nessuna colonna. */
  anteprima?: ReactNode;
  anteprimaNascosta?: boolean;
  /** Il computo può scorrere la tabella: l'anteprima richiesta è disponibile anche da 1024 px. */
  anteprimaCompatta?: boolean;
  className?: string;
}

export function CorpoPreventivatore({ children, anteprima, anteprimaNascosta, anteprimaCompatta, className }: Props) {
  const conColonna = Boolean(anteprima) && !anteprimaNascosta;
  return (
    <div
      className={cn(
        "grid gap-5 px-4 py-4 sm:px-6 max-md:px-3 max-md:py-3",
        conColonna && (anteprimaCompatta ? "lg:grid-cols-[minmax(0,1fr)_clamp(300px,32%,500px)]" : "xl:grid-cols-[minmax(0,1fr)_clamp(300px,26vw,400px)]"),
        className,
      )}
    >
      <div className="min-w-0 space-y-4">{children}<QuoteCustomFieldsPanel /></div>
      {conColonna && (
        <aside aria-label="Anteprima del preventivo" className={cn("hidden min-w-0", anteprimaCompatta ? "lg:block" : "xl:block")}>
          <div className={cn("sticky max-h-[calc(100dvh-18rem)] overflow-y-auto overscroll-contain", anteprimaCompatta ? "lg:top-[4.25rem]" : STICKY_ANTEPRIMA)}>
            {anteprima}
          </div>
        </aside>
      )}
    </div>
  );
}
