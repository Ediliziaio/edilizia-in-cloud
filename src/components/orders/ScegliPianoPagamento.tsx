/**
 * «Come si paga questa commessa?»: la scelta del piano, senza salvare niente.
 *
 * Il gemello `PianoPagamentiAzioni` scrive le rate sul server e serve a una commessa che
 * esiste già. Qui le rate tornano a chi ha aperto il riquadro, così la stessa scelta vale
 * anche mentre la commessa si sta creando e non ha ancora un id (04/11/2026).
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useModelliPagamento } from "@/hooks/useModelliPagamento";
import { formatCurrency } from "@/lib/formatters";
import type { Installment } from "@/lib/orderUtils";
import { quandoSiIncassa, rateDaModello, riepilogoModello } from "@/lib/orders/modelliPagamento";

export function ScegliPianoPagamento({ aperto, totaleLordo, sostituisce, onChiudi, onScegli }: {
  aperto: boolean;
  /** Totale con IVA: le percentuali del modello si applicano a questo. */
  totaleLordo: number;
  /** C'è già un piano scritto: la scelta lo sostituisce, e va detto prima. */
  sostituisce: boolean;
  onChiudi: () => void;
  onScegli: (rate: Installment[]) => void;
}) {
  const { offerti } = useModelliPagamento();
  const [scelto, setScelto] = useState("");
  // Riaprendo non resta selezionato il piano di prima: si riparte dalla domanda.
  useEffect(() => { if (aperto) setScelto(""); }, [aperto]);

  const modello = offerti.find((m) => m.id === scelto) ?? null;
  const anteprima = modello ? rateDaModello(modello, totaleLordo) : [];

  return (
    <Dialog open={aperto} onOpenChange={(o) => { if (!o) onChiudi(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Come si paga</DialogTitle>
          <DialogDescription>
            Le rate sono una parte del totale con IVA ({formatCurrency(totaleLordo)}) e hanno ognuna il suo
            momento d'incasso. Dopo averle messe puoi cambiare nome, importo e momento di ciascuna.
            {sostituisce ? " Le rate di adesso vengono sostituite." : ""}
          </DialogDescription>
        </DialogHeader>

        {totaleLordo <= 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            Scrivi prima l'importo della commessa: le rate sono una parte di quello.
          </p>
        ) : offerti.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            Non ci sono piani da scegliere. Si creano in Impostazioni → Pagamenti.
          </p>
        ) : (
          <RadioGroup value={scelto} onValueChange={setScelto} className="gap-2">
            {offerti.map((m) => (
              <div key={m.id} className="flex items-start gap-3 rounded-lg border p-3">
                <RadioGroupItem value={m.id} id={`nuovo-piano-${m.id}`} className="mt-0.5" />
                <Label htmlFor={`nuovo-piano-${m.id}`} className="cursor-pointer space-y-0.5 font-normal">
                  <span className="block text-sm font-medium">{m.nome}</span>
                  <span className="block text-xs text-muted-foreground">{riepilogoModello(m.righe)}</span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}

        {anteprima.length > 0 && (
          <ul aria-label="Anteprima delle rate" className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
            {anteprima.map((r) => (
              <li key={r.position} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">
                  {r.label} <span className="text-xs text-muted-foreground">{quandoSiIncassa(r.trigger_evento, r.trigger_numero)}</span>
                </span>
                <span className="shrink-0 font-medium">{formatCurrency(r.amount)}</span>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onChiudi}>Annulla</Button>
          <Button disabled={!modello} onClick={() => { if (modello) { onScegli(anteprima); onChiudi(); } }}>
            Usa questo piano
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
