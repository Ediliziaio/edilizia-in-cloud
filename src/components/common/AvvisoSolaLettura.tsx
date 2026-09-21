import type { ReactNode } from "react";
import { Info } from "lucide-react";

/**
 * Nota per chi apre una pagina che può vedere ma non modificare. I pulsanti di
 * modifica restano nascosti (il database li rifiuterebbe comunque): questa riga
 * dice perché mancano e a chi chiedere, invece di lasciare l'utente a cercarli.
 */
export function AvvisoSolaLettura({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground" role="note">
      <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
