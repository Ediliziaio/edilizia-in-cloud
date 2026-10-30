// src/components/orders/generali/fatture/FatturaDialog.tsx
// «Crea fattura» da un SAL di contratto o da un pagamento di un'unità: mostra cosa finirà nella
// bozza (cliente, importi, IVA), chiede solo le scelte che spettano all'utente e apre l'editor.
// La fattura nasce sempre bozza: numero ed invio allo SDI restano azioni dell'editor.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCreaFatturaGenerale, useDatiFatturaGenerale } from "@/hooks/useGeneraleFatture";
import { datiClienteMancanti, nomeCliente } from "@/lib/fatturazione/clienteSnapshot";
import {
  ALIQUOTE_SAL, AVVISO_CAPARRA, IVA_VENDITA, NOMI_PAGAMENTO,
  bozzaFatturaPagamento, bozzaFatturaSal, etichettaFattura, messaggioFattura, snapshotCliente,
  type AliquotaSal, type DatiFattura, type IvaVendita, type OrigineFattura,
} from "@/lib/orders/generali/fatture";
import type { DocumentoFiscale } from "@/types/fatturazione";

const euro = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);

interface Props {
  generaleId: string;
  origine: OrigineFattura;
  /** id del SAL (sal_records) o del pagamento (unita_movimenti) */
  id: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function FatturaDialog({ generaleId, origine, id, open, onOpenChange }: Props) {
  const dati = useDatiFatturaGenerale(origine, id, open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Crea fattura</DialogTitle>
          <DialogDescription>
            Nasce una bozza: la controlli nell'editor, e da lì la emetti e la mandi allo SDI.
          </DialogDescription>
        </DialogHeader>
        {dati.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Preparo i dati…</div>
        ) : dati.error ? (
          <Alert variant="destructive"><AlertDescription>{messaggioFattura(dati.error)}</AlertDescription></Alert>
        ) : dati.data ? (
          <Contenuto generaleId={generaleId} origine={origine} id={id} dati={dati.data} chiudi={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Contenuto({ generaleId, origine, id, dati, chiudi }: { generaleId: string; origine: OrigineFattura; id: string; dati: DatiFattura; chiudi: () => void }) {
  const navigate = useNavigate();
  const crea = useCreaFatturaGenerale(generaleId);
  const [aliquotaSal, setAliquotaSal] = useState<AliquotaSal>("22");
  const [ivaVendita, setIvaVendita] = useState<IvaVendita>("10");
  const [ivaInclusa, setIvaInclusa] = useState(true);
  const [caparraVoluta, setCaparraVoluta] = useState(false);

  const bozza: Partial<DocumentoFiscale> = useMemo(
    () => (dati.origine === "sal" ? bozzaFatturaSal(dati, aliquotaSal) : bozzaFatturaPagamento(dati, ivaVendita, ivaInclusa)),
    [dati, aliquotaSal, ivaVendita, ivaInclusa],
  );
  const cliente = snapshotCliente(dati.cliente);
  const mancaNelCliente = cliente ? datiClienteMancanti(cliente) : [];
  const caparra = dati.origine === "movimento" && dati.pagamento.tipo === "caparra";

  const apri = (docId: string) => {
    chiudi();
    navigate(`/azienda/documenti/${docId}`);
  };

  if (dati.esistente) {
    return (
      <div className="space-y-4">
        <p className="text-sm">Da qui è già nata la {etichettaFattura(dati.esistente).toLowerCase()}: non se ne crea una seconda.</p>
        <DialogFooter>
          <Button variant="outline" onClick={chiudi}>Chiudi</Button>
          <Button onClick={() => apri(dati.esistente!.id)}><FileText className="mr-1.5 h-4 w-4" /> Apri la fattura</Button>
        </DialogFooter>
      </div>
    );
  }

  const prepara = () => {
    if (crea.isPending) return;
    crea.mutate({ origine, id, bozza }, {
      onSuccess: (r) => {
        toast.success(r.esistente ? "C'era già una fattura: apro quella." : "Bozza di fattura pronta: controllala e emettila dall'editor.");
        apri(r.id);
      },
      onError: (e) => toast.error(messaggioFattura(e)),
    });
  };

  const sal = dati.origine === "sal" ? dati.sal : null;
  const pag = dati.origine === "movimento" ? dati.pagamento : null;

  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Cliente</dt>
        <dd className="font-medium">{cliente ? nomeCliente(cliente) : "—"}</dd>
        {sal && (
          <>
            <dt className="text-muted-foreground">SAL</dt>
            <dd>n. {sal.numero}{sal.riferimentoContratto ? ` · contratto ${sal.riferimentoContratto}` : ""}</dd>
            <dt className="text-muted-foreground">Lordo</dt>
            <dd className="tabular-nums">{euro(sal.lordo)}</dd>
            {sal.ritenuta !== 0 && (<><dt className="text-muted-foreground">Ritenuta</dt><dd className="tabular-nums">−{euro(sal.ritenuta)}</dd></>)}
            {sal.recupero !== 0 && (<><dt className="text-muted-foreground">Anticipazione</dt><dd className="tabular-nums">−{euro(sal.recupero)}</dd></>)}
            <dt className="text-muted-foreground">Imponibile</dt>
            <dd className="font-medium tabular-nums">{euro(sal.netto)} <span className="font-normal text-muted-foreground">(netto del SAL)</span></dd>
            {(sal.cig || sal.cup) && (<><dt className="text-muted-foreground">CIG / CUP</dt><dd>{[sal.cig, sal.cup].filter(Boolean).join(" · ")}</dd></>)}
          </>
        )}
        {pag && (
          <>
            <dt className="text-muted-foreground">Pagamento</dt>
            <dd>{NOMI_PAGAMENTO[pag.tipo]} di {euro(pag.importo)}</dd>
            <dt className="text-muted-foreground">Unità</dt>
            <dd>{[pag.unita, pag.piano ? `piano ${pag.piano}` : null, pag.mq ? `${pag.mq} m²` : null].filter(Boolean).join(" · ")}</dd>
          </>
        )}
        <dt className="text-muted-foreground">IVA</dt>
        <dd className="tabular-nums">{euro(bozza.iva_totale ?? 0)}</dd>
        <dt className="text-muted-foreground">Totale</dt>
        <dd className="font-semibold tabular-nums">
          {euro(bozza.totale_documento ?? 0)}
          {bozza.totale_da_pagare !== bozza.totale_documento && (
            <span className="ml-1 font-normal text-muted-foreground">· da incassare {euro(bozza.totale_da_pagare ?? 0)}</span>
          )}
        </dd>
      </dl>

      {sal && sal.reverseCharge && (
        <p className="text-muted-foreground">Contratto in reverse charge: IVA a zero (N6.3) con la dicitura di legge.</p>
      )}
      {sal && !sal.reverseCharge && (
        <fieldset className="space-y-2">
          <legend className="font-medium">Aliquota IVA</legend>
          {sal.splitPayment && <p className="text-muted-foreground">Split payment dal contratto: l'IVA la versa il committente, a te arriva l'imponibile.</p>}
          <RadioGroup value={aliquotaSal} onValueChange={(v) => setAliquotaSal(v as AliquotaSal)} className="gap-1.5">
            {ALIQUOTE_SAL.map((a) => (
              <div key={a.valore} className="flex items-center gap-2">
                <RadioGroupItem id={`aliquota-sal-${a.valore}`} value={a.valore} />
                <Label htmlFor={`aliquota-sal-${a.valore}`} className="text-sm font-normal">{a.etichetta}</Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>
      )}

      {pag && (
        <fieldset className="space-y-2">
          <legend className="font-medium">IVA della vendita</legend>
          <RadioGroup value={ivaVendita} onValueChange={(v) => setIvaVendita(v as IvaVendita)} className="gap-1.5">
            {IVA_VENDITA.map((a) => (
              <div key={a.valore} className="flex items-start gap-2">
                <RadioGroupItem id={`iva-vendita-${a.valore}`} value={a.valore} className="mt-0.5" />
                <Label htmlFor={`iva-vendita-${a.valore}`} className="text-sm font-normal leading-snug">
                  {a.etichetta} <span className="text-muted-foreground">— {a.aiuto}</span>
                </Label>
              </div>
            ))}
          </RadioGroup>
          {ivaVendita !== "esente" && (
            <div className="flex items-center gap-2 pt-1">
              <Checkbox id="iva-inclusa" checked={ivaInclusa} onCheckedChange={(v) => setIvaInclusa(v === true)} />
              <Label htmlFor="iva-inclusa" className="text-sm font-normal">L'importo versato comprende l'IVA (si scorpora)</Label>
            </div>
          )}
        </fieldset>
      )}

      {caparra && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="space-y-2">
            <p>{AVVISO_CAPARRA}</p>
            <div className="flex items-center gap-2">
              <Checkbox id="caparra-voluta" checked={caparraVoluta} onCheckedChange={(v) => setCaparraVoluta(v === true)} />
              <Label htmlFor="caparra-voluta" className="text-sm font-normal">La fatturo lo stesso</Label>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {!cliente ? (
        <Alert variant="destructive">
          <AlertDescription>
            {origine === "sal" ? "La commessa generale non ha un committente" : "L'unità non ha un acquirente"}: la bozza nasce senza cliente e lo scegli nell'editor.
          </AlertDescription>
        </Alert>
      ) : mancaNelCliente.length > 0 ? (
        <p className="text-muted-foreground">Prima di emettere, nell'editor completa {mancaNelCliente.join(", ")}.</p>
      ) : null}

      <DialogFooter>
        <Button variant="outline" onClick={chiudi}>Annulla</Button>
        <Button onClick={prepara} disabled={crea.isPending || (caparra && !caparraVoluta)}>
          {crea.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />}
          Prepara la bozza
        </Button>
      </DialogFooter>
    </div>
  );
}
