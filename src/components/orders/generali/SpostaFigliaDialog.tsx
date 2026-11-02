// src/components/orders/generali/SpostaFigliaDialog.tsx
// Togliere una commessa da una generale o spostarla in un'altra (piano, F3): prima di confermare
// si vede cosa cambia nei totali. La commessa resta quella che è: cantiere, costi e fatture la seguono.
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  messaggioGenerale, useAltreGenerali, useMisureDellaCommessa, useRiepilogoGenerale, useScollegaCommessa, useSpostaCommessa,
} from "@/hooks/useCommesseGenerali";
import {
  DEFINIZIONI_MODELLI, formattaEuro, totaliGenerale,
  type FigliaGenerale, type RiepilogoGenerale, type TotaliGenerale,
} from "@/lib/orders/commesseGenerali";
import { effettoSpostamento } from "@/lib/orders/listaGenerali";
import { cn } from "@/lib/utils";

export type AzioneFiglia = "togli" | "sposta";

interface Props {
  riepilogo: RiepilogoGenerale;
  totali: TotaliGenerale;
  figlia: FigliaGenerale;
  azione: AzioneFiglia;
  onClose: () => void;
}

const euro = (n: number | null) => (n === null ? "—" : formattaEuro(n));

function Effetto({ titolo, etichettaValore, t, importo, verso }: {
  titolo: string; etichettaValore: string; t: TotaliGenerale; importo: number | null; verso: 1 | -1;
}) {
  const dopo = effettoSpostamento(t, importo, verso);
  const riga = (etichetta: string, prima: number | null, poi: number | null) => (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{etichetta}</dt>
      <dd className="tabular-nums">
        {euro(prima)} → <span className={cn("font-medium", poi !== null && poi < 0 && "text-destructive")}>{euro(poi)}</span>
      </dd>
    </div>
  );
  return (
    <div className="rounded-md border px-3 py-2 text-sm">
      <p className="font-medium">{titolo}</p>
      <dl className="mt-1 space-y-0.5 text-xs">
        {riga(etichettaValore, t.assegnato, dopo.assegnatoDopo)}
        {t.daAssegnare !== null && riga("Da assegnare", t.daAssegnare, dopo.daAssegnareDopo)}
      </dl>
    </div>
  );
}

export function SpostaFigliaDialog({ riepilogo, totali, figlia, azione, onClose }: Props) {
  const g = riepilogo.generale;
  const def = DEFINIZIONI_MODELLI[g.modello];
  const etichetta = figlia.codice ?? figlia.nome;
  const sposta = azione === "sposta";
  const [destinazione, setDestinazione] = useState<string | undefined>(undefined);
  const altre = useAltreGenerali(g.id, sposta);
  const arrivo = useRiepilogoGenerale(destinazione);
  const misure = useMisureDellaCommessa(figlia.id, g.modello === "appalto");
  const scollega = useScollegaCommessa();
  const spostaCommessa = useSpostaCommessa();
  const inCorso = scollega.isPending || spostaCommessa.isPending;
  const importi = riepilogo.permessi.importi;
  // Una commessa divisa non pesa nel valore: è già sostituita dalle sue parti.
  const importo = figlia.divisa ? 0 : figlia.importo;
  const nMisure = misure.data ?? 0;

  const conferma = () => {
    if (sposta) {
      if (!destinazione) return;
      spostaCommessa.mutate({ generaleId: destinazione, commessaId: figlia.id }, {
        onSuccess: () => { toast.success(`${etichetta} spostata`); onClose(); },
        onError: (e) => toast.error(messaggioGenerale(e, "lo spostamento")),
      });
    } else {
      scollega.mutate(figlia.id, {
        onSuccess: () => { toast.success(`${etichetta} ora è una commessa indipendente`); onClose(); },
        onError: (e) => toast.error(messaggioGenerale(e, "la commessa")),
      });
    }
  };

  return (
    <Dialog open onOpenChange={(aperta) => { if (!aperta) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{sposta ? `Sposta ${etichetta}` : `Togli ${etichetta}`}</DialogTitle>
          <DialogDescription>
            {sposta ? "Passa a un'altra commessa generale." : `Esce da «${g.nome}» e torna una commessa indipendente.`} Cantiere, costi e fatture restano sulla commessa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {sposta && (
            <div className="space-y-1.5">
              <Label htmlFor="sposta-destinazione">Commessa generale di arrivo</Label>
              {altre.data?.length === 0 ? (
                <p className="text-sm text-muted-foreground">Non ci sono altre commesse generali in questa azienda.</p>
              ) : (
                <Select value={destinazione} onValueChange={setDestinazione}>
                  <SelectTrigger id="sposta-destinazione"><SelectValue placeholder={altre.isLoading ? "Carico…" : "Scegli"} /></SelectTrigger>
                  <SelectContent>
                    {(altre.data ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{[a.order_code, a.description].filter(Boolean).join(" · ") || "Commessa generale"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {importi && (
            <div className="space-y-2">
              <Effetto titolo={`«${g.nome}»`} etichettaValore="Assegnato" t={totali} importo={importo} verso={-1} />
              {sposta && arrivo.data && (
                <Effetto titolo={`«${arrivo.data.generale.nome}»`} etichettaValore="Assegnato" t={totaliGenerale(arrivo.data)} importo={importo} verso={1} />
              )}
            </div>
          )}

          {nMisure > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {nMisure === 1 ? "Ha una misura" : `Ha ${nMisure} misure`} nel contratto di «{g.nome}»: {nMisure === 1 ? "resta" : "restano"} lì, con i SAL già fatti.
            </p>
          )}
          {g.modello !== "appalto" && (
            <p className="text-xs text-muted-foreground">I costi comuni di «{g.nome}» si ridividono tra {def.figlia.tante.toLowerCase()} che restano.</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button onClick={conferma} disabled={inCorso || (sposta && !destinazione)}>
            {inCorso && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {sposta ? "Sposta" : "Togli"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
