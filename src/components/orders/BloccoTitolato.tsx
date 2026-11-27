import type { ReactNode } from "react";

/** Un blocco titolato dei moduli di cantiere: titolo piccolo a sinistra, un dato a destra, il contenuto sotto.
 *  Lo usano il rapportino dell'ufficio e il rendiconto giornaliero, perché le due finestre si leggano uguali. */
export function Blocco({ titolo, destra, children }: { titolo: string; destra?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{titolo}</p>
        {destra && <p className="text-xs tabular-nums text-muted-foreground">{destra}</p>}
      </div>
      {children}
    </div>
  );
}
