import type { ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  const t = useT();
  return (
    <div className="grid gap-6 lg:h-full lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[minmax(0,1fr)]">
      <div className="min-w-0 space-y-4 lg:overflow-y-auto lg:px-2 lg:pb-1">{scelte}</div>
      <aside
        aria-label={t("Riepilogo del prodotto")}
        className="space-y-3 lg:flex lg:max-h-full lg:flex-col lg:self-start lg:overflow-y-auto lg:rounded-xl lg:border lg:bg-muted/20 lg:p-3"
      >
        {riepilogo && (
          <div className="space-y-3 lg:min-h-0 lg:flex-initial lg:overflow-y-auto">
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
  const t = useT();
  if (!inserimentoContinuo) {
    return (
      <Button variant="brand" className="h-auto min-h-11 w-full whitespace-normal px-3 py-2.5 text-left leading-snug" disabled={disabled} onClick={() => onConferma()}>
        <Check className="mr-1 h-4 w-4" />
        {confirmLabel}
      </Button>
    );
  }
  return (
    <div className="space-y-2">
      <Button variant="brand" className="h-auto min-h-11 w-full whitespace-normal px-3 py-2.5 text-left leading-snug" disabled={disabled} onClick={() => onConferma("altro")}>
        <Check className="mr-1 h-4 w-4" />
        {t("Aggiungi e scegli un altro")}
      </Button>
      {puoDuplicare && (
        <Button variant="outline" className="h-auto min-h-11 w-full whitespace-normal px-3 py-2.5 text-left leading-snug" disabled={disabled} onClick={() => onConferma("duplica")}>
          <Copy className="mr-1 h-4 w-4" />
          {t("Aggiungi e duplica con altre misure")}
        </Button>
      )}
      {/* Telefono no: dopo l'aggiunta c'è già «Fatto, torna al preventivo». */}
      <Button variant="ghost" className="w-full max-sm:hidden" disabled={disabled} onClick={() => onConferma("chiudi")}>
        {t("Aggiungi e torna al preventivo")}
      </Button>
    </div>
  );
}
