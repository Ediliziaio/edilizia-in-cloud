// La colonna dell'anagrafica nelle schede cliente e committente: al computer si chiude di lato
// e resta una striscia per riaprirla. La scelta vale per chi guarda, su questo browser.
import { useState, type ReactElement, type ReactNode } from "react";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";

const CHIAVE = "scheda-anagrafica-chiusa";

export function useAnagraficaChiusa(): [boolean, (chiusa: boolean) => void] {
  const [chiusa, setChiusa] = useState<boolean>(() => {
    try { return localStorage.getItem(CHIAVE) === "1"; } catch { return false; }
  });
  const cambia = (v: boolean): void => {
    setChiusa(v);
    try { localStorage.setItem(CHIAVE, v ? "1" : "0"); } catch { /* il browser non salva: vale solo per ora */ }
  };
  return [chiusa, cambia];
}

export function ColonnaAnagrafica({ chiusa, onApri, children }: { chiusa: boolean; onApri: () => void; children: ReactNode }): ReactElement {
  return (
    <div className={cn("order-2 shrink-0 lg:order-none", chiusa ? "lg:w-10" : "lg:w-72")}>
      {chiusa && (
        <div className="hidden w-10 flex-col items-center gap-1 rounded-2xl border bg-muted/30 py-2 lg:flex lg:h-full">
          <button type="button" aria-label="Apri l'anagrafica" title="Apri l'anagrafica" onClick={onApri}
            className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <User className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {/* Resta montata anche chiusa: sul telefono si vede sempre, e un campo in modifica non si perde. */}
      <div className={cn("space-y-3", chiusa && "lg:hidden")}>{children}</div>
    </div>
  );
}
