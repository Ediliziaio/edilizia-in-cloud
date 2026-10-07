// src/components/orders/PianoPagamentiAzioni.tsx
import { useState } from "react";
import { Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useModelliPagamento } from "@/hooks/useModelliPagamento";
import { useSalLegatiARate, useSostituisciRate } from "@/hooks/usePianoPagamenti";
import { formatCurrency } from "@/lib/formatters";
import type { Installment } from "@/lib/orderUtils";
import {
  puoCambiarePiano, quandoSiIncassa, rataPerServer, rateDaModello, riepilogoModello, saldoDaAllineare,
} from "@/lib/orders/modelliPagamento";

interface Props {
  orderId: string;
  /** Imponibile della commessa. */
  totalAmount: number;
  vatRate: number;
  paymentType: "standard" | "financing";
  financingCost?: number;
  installments: Installment[];
  /** Chi ha «Ordini e Commesse»: gli altri non vedono comandi. */
  puoModificare: boolean;
}

const arrotonda = (n: number): number => Math.round(n * 100) / 100;

/**
 * Sopra il piano rate di una commessa: «Come si paga questa commessa?» (se non ha rate), «Cambia il piano»
 * (finché non ha incassi, fatture o SAL legati), e l'avviso del saldo salvato che non torna con il totale.
 */
export function PianoPagamentiAzioni({ orderId, totalAmount, vatRate, paymentType, financingCost = 0, installments, puoModificare }: Props) {
  const confirm = useConfirm();
  const { offerti } = useModelliPagamento();
  const { rateConSal } = useSalLegatiARate(orderId);
  const sostituisci = useSostituisciRate(orderId);
  const [aperto, setAperto] = useState(false);
  const [scelto, setScelto] = useState("");

  if (!puoModificare) return null;
  const totaleLordo = arrotonda(totalAmount * (1 + vatRate / 100));
  const standard = paymentType === "standard";
  const cambio = puoCambiarePiano(installments, rateConSal);
  const saldo = standard ? saldoDaAllineare(installments, totaleLordo, financingCost) : null;
  const modello = offerti.find((m) => m.id === scelto) ?? null;
  const anteprima = modello ? rateDaModello(modello, totaleLordo) : [];

  const applica = () => {
    if (!modello) return;
    sostituisci.mutate(anteprima.map(rataPerServer), { onSuccess: () => setAperto(false) });
  };

  const allinea = async () => {
    if (!saldo) return;
    const ok = await confirm({
      title: `Portare il saldo a ${formatCurrency(saldo.calcolato)}?`,
      description: `Adesso nel database vale ${formatCurrency(saldo.salvato)}, ma col totale con IVA risulta ${formatCurrency(saldo.calcolato)}: le previsioni di cassa e gli avvisi leggono quello salvato. Le rate già incassate non cambiano; le provvigioni sul saldo si ricalcolano sul nuovo importo.`,
      confirmLabel: "Allinea il saldo",
    });
    if (!ok) return;
    sostituisci.mutate(installments.map((r) => rataPerServer(r.id === saldo.id ? { ...r, amount: saldo.calcolato } : r)));
  };

  const senzaRate = installments.length === 0;
  const puoScegliere = standard && offerti.length > 0 && cambio.ok;

  return (
    <div className="space-y-2">
      {senzaRate && puoScegliere && (
        <Card className="border-dashed">
          <CardContent className="flex flex-wrap items-center gap-3 p-3">
            <Banknote aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-700" />
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">Come si paga questa commessa?</span>
              <span className="text-muted-foreground max-sm:hidden"> Scegli un piano: le rate nascono già con il loro momento d'incasso.</span>
            </p>
            <Button size="sm" onClick={() => setAperto(true)}>Scegli il piano</Button>
          </CardContent>
        </Card>
      )}

      {!senzaRate && puoScegliere && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setAperto(true)}>
            <Banknote className="mr-1 h-3.5 w-3.5" />Cambia il piano
          </Button>
        </div>
      )}

      {saldo && (
        <div role="status" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">Il saldo salvato non torna con il totale</p>
          <p className="text-xs text-amber-800">
            Salvato {formatCurrency(saldo.salvato)}; col totale con IVA risulta {formatCurrency(saldo.calcolato)}. Le previsioni di cassa e gli avvisi leggono quello salvato.
          </p>
          <Button size="sm" variant="outline" className="border-amber-400 bg-white text-amber-900" disabled={sostituisci.isPending} onClick={() => { void allinea(); }}>
            Allinea il saldo a {formatCurrency(saldo.calcolato)}
          </Button>
        </div>
      )}

      <Dialog open={aperto} onOpenChange={(o) => { if (!o) setAperto(false); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Come si paga</DialogTitle>
            <DialogDescription>
              Scegli il piano: le rate sono una parte del totale con IVA ({formatCurrency(totaleLordo)}) e hanno ognuna il suo momento d'incasso.
              {installments.length > 0 ? " Le rate di adesso vengono sostituite." : ""}
            </DialogDescription>
          </DialogHeader>

          {totaleLordo <= 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">La commessa non ha ancora un importo: scrivilo (Modifica) e poi scegli il piano.</p>
          ) : (
            <RadioGroup value={scelto} onValueChange={setScelto} className="gap-2">
              {offerti.map((m) => (
                <div key={m.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <RadioGroupItem value={m.id} id={`piano-${m.id}`} className="mt-0.5" />
                  <Label htmlFor={`piano-${m.id}`} className="cursor-pointer space-y-0.5 font-normal">
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
                  <span className="min-w-0 truncate">{r.label} <span className="text-xs text-muted-foreground">{quandoSiIncassa(r.trigger_evento, r.trigger_numero)}</span></span>
                  <span className="shrink-0 font-medium">{formatCurrency(r.amount)}</span>
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAperto(false)}>Annulla</Button>
            <Button onClick={applica} disabled={!modello || sostituisci.isPending}>Applica questo piano</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
