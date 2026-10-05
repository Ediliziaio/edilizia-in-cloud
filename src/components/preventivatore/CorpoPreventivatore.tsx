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

interface Props {
  children: ReactNode;
  /** Il pannello di destra; assente = nessuna colonna. */
  anteprima?: ReactNode;
  anteprimaNascosta?: boolean;
  className?: string;
}

export function CorpoPreventivatore({ children, anteprima, anteprimaNascosta, className }: Props) {
  const conColonna = Boolean(anteprima) && !anteprimaNascosta;
  return (
    <div
      className={cn(
        "grid gap-5 px-4 py-4 sm:px-6 max-md:px-3 max-md:py-3",
        conColonna && "xl:grid-cols-[minmax(0,1fr)_clamp(300px,26vw,400px)]",
        className,
      )}
    >
      <div className="min-w-0 space-y-4">{children}</div>
      {conColonna && (
        <aside aria-label="Anteprima del preventivo" className="hidden min-w-0 xl:block">
          <div className={cn("sticky max-h-[calc(100dvh-18rem)] overflow-y-auto overscroll-contain", STICKY_ANTEPRIMA)}>
            {anteprima}
          </div>
        </aside>
      )}
    </div>
  );
}
