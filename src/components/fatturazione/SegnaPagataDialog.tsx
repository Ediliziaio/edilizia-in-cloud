import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/formatters";
import { METODI_INCASSO, metodoIncassoDaCodice, residuoDaIncassare } from "@/lib/fatturazione/incassi";
import { useSegnaPagata } from "@/hooks/useMovimentiCassa";
import type { DocumentoFiscale } from "@/types/fatturazione";

// «Segna pagata» su una fattura o su una selezione (25/09/2026): chiede metodo
// e data, poi registra un incasso vero per ciascuna (registra_incasso_atomico).

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Le fatture da incassare: una (dettaglio, elenco) o tante (selezione). */
  fatture: DocumentoFiscale[];
  /** Selezionate ma non incassabili (bozze, già pagate, preventivi…): solo per dirlo. */
  escluse?: number;
  /** Dopo la registrazione (per esempio: svuotare la selezione). */
  onFatto?: () => void;
}

const oggi = () => new Date().toLocaleDateString("en-CA");

/** Il metodo della fattura; per una selezione, quello comune a tutte, altrimenti bonifico. */
function metodoPredefinito(fatture: DocumentoFiscale[]): string {
  const metodi = new Set(fatture.map((f) => metodoIncassoDaCodice(f.metodo_pagamento_codice)));
  return metodi.size === 1 ? [...metodi][0] : "bonifico";
}

export function SegnaPagataDialog({ open, onOpenChange, fatture, escluse = 0, onFatto }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Montato a ogni apertura: metodo e data ripartono dalla fattura e da oggi. */}
        {open && <ModuloIncasso fatture={fatture} escluse={escluse} onOpenChange={onOpenChange} onFatto={onFatto} />}
      </DialogContent>
    </Dialog>
  );
}

function ModuloIncasso({ fatture, escluse, onOpenChange, onFatto }: Omit<Props, "open"> & { escluse: number }) {
  const segnaPagata = useSegnaPagata();
  const [metodo, setMetodo] = useState(() => metodoPredefinito(fatture));
  const [data, setData] = useState(oggi);

  const una = fatture.length === 1 ? fatture[0] : null;
  const totale = fatture.reduce((t, f) => t + residuoDaIncassare(f), 0);
  const dataValida = /^\d{4}-\d{2}-\d{2}$/.test(data) && data <= oggi();

  const registra = () => {
    if (segnaPagata.isPending || fatture.length === 0 || !dataValida) return;
    segnaPagata.mutate(
      { fatture, metodo, data },
      {
        onSuccess: () => {
          onOpenChange(false);
          onFatto?.();
        },
      },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{una || fatture.length === 0 ? "Segna pagata" : `Segna pagate ${fatture.length} fatture`}</DialogTitle>
        {/* Mobile: la spiegazione resta solo per i lettori di schermo. */}
        <DialogDescription className="max-sm:sr-only">
          {fatture.length === 0
            ? "Nessuna delle fatture selezionate ha qualcosa da incassare."
            : una
              ? `Registra l'incasso di ${formatCurrency(residuoDaIncassare(una))} per la fattura n. ${una.numero}: entra nel registro incassi e in prima nota, e chiude la scadenza.`
              : `Un incasso per fattura, per quanto resta da incassare: ${formatCurrency(totale)} in tutto. Entrano nel registro incassi e in prima nota, e chiudono le scadenze.`}
        </DialogDescription>
      </DialogHeader>

      {escluse > 0 && (
        <p className="text-xs text-muted-foreground">
          {escluse === 1
            ? "1 documento selezionato non si può incassare (bozza, già pagato, preventivo…) e resta com'è."
            : `${escluse} documenti selezionati non si possono incassare (bozze, già pagati, preventivi…) e restano come sono.`}
        </p>
      )}

      {fatture.length > 0 && (
        <div className="grid grid-cols-2 gap-3 max-sm:gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="incasso-metodo">Metodo</Label>
            <Select value={metodo} onValueChange={setMetodo}>
              <SelectTrigger id="incasso-metodo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METODI_INCASSO.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="incasso-data">Data<span className="max-sm:hidden"> dell'incasso</span></Label>
            <Input id="incasso-data" type="date" value={data} max={oggi()} onChange={(e) => setData(e.target.value)} />
            {!dataValida && <p className="text-xs text-destructive">Scegli una data non futura.</p>}
          </div>
        </div>
      )}

      <DialogFooter>
        {/* Mobile: «Annulla» no, c'è la X (resta «Chiudi» quando non c'è altro). */}
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={segnaPagata.isPending} className={fatture.length > 0 ? "max-sm:hidden" : undefined}>
          {fatture.length === 0 ? "Chiudi" : "Annulla"}
        </Button>
        {fatture.length > 0 && (
          <Button onClick={registra} disabled={segnaPagata.isPending || !dataValida}>
            {segnaPagata.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {una ? "Registra incasso" : `Registra ${fatture.length} incassi`}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
