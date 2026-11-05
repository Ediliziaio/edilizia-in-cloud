import type { ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Cosa fare dopo aver aggiunto il prodotto. */
export type DopoAggiunta = "altro" | "duplica" | "chiudi";

/**
 * Le due colonne della configurazione: a sinistra le scelte, a destra ciò che
 * deve restare sempre sotto gli occhi (disegno, prezzo, pulsanti). Sul telefono
 * diventano una colonna sola, nello stesso ordine.
 */
export function LayoutConfigurazione({
  scelte,
  riepilogo,
  azioni,
}: {
  scelte: ReactNode;
  riepilogo?: ReactNode;
  azioni: ReactNode;
}) {
  return (
    <div className="grid gap-6 md:h-full md:grid-cols-[minmax(0,1fr)_320px] md:grid-rows-[minmax(0,1fr)]">
      <div className="min-w-0 space-y-4 md:overflow-y-auto md:px-2 md:pb-1">{scelte}</div>
      <aside
        aria-label="Riepilogo del prodotto"
        className="space-y-3 md:flex md:max-h-full md:flex-col md:self-start md:overflow-y-auto md:rounded-xl md:border md:bg-muted/20 md:p-3"
      >
        {riepilogo && (
          <div className="space-y-3 md:min-h-0 md:flex-initial md:overflow-y-auto">
            {riepilogo}
          </div>
        )}
        <div className="shrink-0 space-y-3">{azioni}</div>
      </aside>
    </div>
  );
}

/**
 * I pulsanti di conferma. Fuori dal popup del preventivo c'è un pulsante solo;
 * dentro, chi inserisce più prodotti sceglie subito come continuare.
 */
export function AzioniProdotto({
  disabled,
  confirmLabel,
  inserimentoContinuo,
  puoDuplicare,
  onConferma,
}: {
  disabled: boolean;
  confirmLabel: string;
  inserimentoContinuo?: boolean;
  puoDuplicare?: boolean;
  onConferma: (dopo?: DopoAggiunta) => void;
}) {
  if (!inserimentoContinuo) {
    return (
      <Button variant="brand" className="w-full" disabled={disabled} onClick={() => onConferma()}>
        <Check className="mr-1 h-4 w-4" />
        {confirmLabel}
      </Button>
    );
  }
  return (
    <div className="space-y-2">
      <Button variant="brand" className="w-full" disabled={disabled} onClick={() => onConferma("altro")}>
        <Check className="mr-1 h-4 w-4" />
        Aggiungi e scegli un altro
      </Button>
      {puoDuplicare && (
        <Button variant="outline" className="w-full" disabled={disabled} onClick={() => onConferma("duplica")}>
          <Copy className="mr-1 h-4 w-4" />
          Aggiungi e duplica con altre misure
        </Button>
      )}
      {/* Telefono no: dopo l'aggiunta c'è già «Fatto, torna al preventivo». */}
      <Button variant="ghost" className="w-full max-sm:hidden" disabled={disabled} onClick={() => onConferma("chiudi")}>
        Aggiungi e torna al preventivo
      </Button>
    </div>
  );
}
