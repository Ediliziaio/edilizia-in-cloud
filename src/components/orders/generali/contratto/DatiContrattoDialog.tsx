// src/components/orders/generali/contratto/DatiContrattoDialog.tsx
// Il contratto con il committente: importi, date, penale, anticipazione, ritenuta, CIG/CUP e IVA.
// Il valore aggiornato si vede mentre si scrive: è quello che diventa il valore della generale.
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSalvaContratto } from "@/hooks/useGeneraleContratto";
import {
  CONTRATTO_VUOTO, anticipazioneProposta, erroriContratto, messaggioContratto, valoreContratto,
  type AttoAggiuntivo, type ContrattoGenerale,
} from "@/lib/orders/generali/contratto";
import { Campo, CampoNumero } from "./campi";
import { euro, haNumeriSbagliati } from "./formato";

export function DatiContrattoDialog({ open, onOpenChange, generaleId, contratto, atti }: {
  open: boolean; onOpenChange: (o: boolean) => void; generaleId: string;
  contratto: ContrattoGenerale | null; atti: AttoAggiuntivo[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {/* Il modulo nasce a ogni apertura con i valori di adesso. */}
        {open && <Modulo onOpenChange={onOpenChange} generaleId={generaleId} iniziale={contratto ?? CONTRATTO_VUOTO} atti={atti} nuovo={!contratto} />}
      </DialogContent>
    </Dialog>
  );
}

function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">{titolo}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Modulo({ onOpenChange, generaleId, iniziale, atti, nuovo }: {
  onOpenChange: (o: boolean) => void; generaleId: string; iniziale: ContrattoGenerale; atti: AttoAggiuntivo[]; nuovo: boolean;
}) {
  const salva = useSalvaContratto(generaleId);
  const [c, setC] = useState<ContrattoGenerale>(iniziale);
  const metti = <K extends keyof ContrattoGenerale>(k: K, v: ContrattoGenerale[K]) => setC((x) => ({ ...x, [k]: v }));
  const errori = erroriContratto(c);
  const bloccato = Object.keys(errori).length > 0 || haNumeriSbagliati(c);
  const valore = haNumeriSbagliati(c) ? null : valoreContratto(c, atti);
  const proposta = valore ? anticipazioneProposta(c, atti) : null;
  const testo = (v: string) => (v.trim() === "" ? null : v.trim());

  const conferma = () => {
    if (bloccato) return;
    salva.mutate(c, {
      onSuccess: () => { toast.success(nuovo ? "Contratto salvato" : "Contratto aggiornato"); onOpenChange(false); },
      onError: (e) => toast.error(messaggioContratto(e, "il contratto")),
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{nuovo ? "Compila il contratto" : "Modifica il contratto"}</DialogTitle>
        <DialogDescription>Importi al netto dell'IVA. Il valore aggiornato diventa il valore della commessa generale.</DialogDescription>
      </DialogHeader>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); conferma(); }}>
        <Sezione titolo="Importi">
          <CampoNumero etichetta="Importo lavori a base del contratto" valore={c.importoBase} onChange={(v) => metti("importoBase", v)} errore={errori.importoBase} suffisso="€" aiuto="La parte soggetta a ribasso." />
          <CampoNumero etichetta="Ribasso" valore={c.ribassoPct} onChange={(v) => metti("ribassoPct", v ?? 0)} errore={errori.ribassoPct} suffisso="%" decimali={4} />
          <CampoNumero etichetta="Oneri della sicurezza" valore={c.oneriSicurezza} onChange={(v) => metti("oneriSicurezza", v ?? 0)} errore={errori.oneriSicurezza} suffisso="€" aiuto="Non soggetti a ribasso." />
          <Campo etichetta="Numero o riferimento del contratto">
            {(id) => <Input id={id} value={c.riferimento ?? ""} onChange={(e) => metti("riferimento", testo(e.target.value))} placeholder="Rep. 1234/2027" />}
          </Campo>
          <div className="rounded-md bg-muted/40 px-3 py-2 text-sm sm:col-span-2" aria-live="polite">
            {valore ? (
              <span>
                Valore aggiornato: <strong className="tabular-nums">{euro(valore.aggiornato)}</strong>
                <span className="text-muted-foreground"> = lavori ribassati {euro(valore.lavoriNetti)} + sicurezza {euro(valore.sicurezza)}{valore.atti !== 0 ? ` ${valore.atti > 0 ? "+" : "−"} atti ${euro(Math.abs(valore.atti))}` : ""}</span>
              </span>
            ) : <span className="text-muted-foreground">Scrivi l'importo a base per vedere il valore aggiornato.</span>}
          </div>
        </Sezione>

        <Sezione titolo="Date">
          <Campo etichetta="Firma del contratto">{(id) => <Input id={id} type="date" value={c.dataFirma ?? ""} onChange={(e) => metti("dataFirma", testo(e.target.value))} />}</Campo>
          <Campo etichetta="Consegna dei lavori">{(id) => <Input id={id} type="date" value={c.dataConsegnaLavori ?? ""} onChange={(e) => metti("dataConsegnaLavori", testo(e.target.value))} />}</Campo>
          <Campo etichetta="Fine lavori prevista" errore={errori.dataFinePrevista} aiuto="Le proroghe si aggiungono come atti.">
            {(id) => <Input id={id} type="date" value={c.dataFinePrevista ?? ""} onChange={(e) => metti("dataFinePrevista", testo(e.target.value))} />}
          </Campo>
          <Campo etichetta="Lavori ultimati il" aiuto="Da qui la penale non cresce più.">
            {(id) => <Input id={id} type="date" value={c.dataUltimazione ?? ""} onChange={(e) => metti("dataUltimazione", testo(e.target.value))} />}
          </Campo>
          <CampoNumero etichetta="Penale per ogni giorno di ritardo" valore={c.penaleGiornaliera} onChange={(v) => metti("penaleGiornaliera", v)} errore={errori.penaleGiornaliera} suffisso="€" />
          <CampoNumero etichetta="Tetto della penale" valore={c.penaleMassimaPct} onChange={(v) => metti("penaleMassimaPct", v ?? 10)} errore={errori.penaleMassimaPct} suffisso="%" aiuto="Del valore del contratto (di solito il 10%)." />
        </Sezione>

        <Sezione titolo="Anticipazione e ritenuta">
          <CampoNumero etichetta="Anticipazione" valore={c.anticipazionePct} onChange={(v) => metti("anticipazionePct", v ?? 0)} errore={errori.anticipazionePct} suffisso="%" aiuto="La stessa quota si recupera da ogni SAL." />
          <CampoNumero
            etichetta="Anticipazione ricevuta"
            valore={c.anticipazioneImporto}
            onChange={(v) => metti("anticipazioneImporto", v)}
            errore={errori.anticipazioneImporto}
            suffisso="€"
            aiuto={proposta !== null && c.anticipazioneImporto === null ? `Sul valore aggiornato sarebbe ${euro(proposta)}.` : "Quanto ti ha versato il committente."}
          />
          <Campo etichetta="Ricevuta il">{(id) => <Input id={id} type="date" value={c.anticipazioneData ?? ""} onChange={(e) => metti("anticipazioneData", testo(e.target.value))} />}</Campo>
          <CampoNumero etichetta="Ritenuta di garanzia" valore={c.ritenutaPct} onChange={(v) => metti("ritenutaPct", v ?? 0)} errore={errori.ritenutaPct} suffisso="%" aiuto="Trattenuta su ogni SAL e svincolata a fine lavori (0,5% negli appalti pubblici)." />
        </Sezione>

        <Sezione titolo="Dati per le fatture">
          <Campo etichetta="CIG">{(id) => <Input id={id} value={c.cig ?? ""} onChange={(e) => metti("cig", testo(e.target.value))} />}</Campo>
          <Campo etichetta="CUP">{(id) => <Input id={id} value={c.cup ?? ""} onChange={(e) => metti("cup", testo(e.target.value))} />}</Campo>
          <label className="flex items-start gap-3 rounded-md border px-3 py-2">
            <Switch checked={c.splitPayment} onCheckedChange={(v) => metti("splitPayment", v)} className="mt-0.5" />
            <span className="text-sm">Scissione dei pagamenti<span className="block text-xs text-muted-foreground">L'IVA la versa il committente (pubblica amministrazione).</span></span>
          </label>
          <label className="flex items-start gap-3 rounded-md border px-3 py-2">
            <Switch checked={c.reverseCharge} onCheckedChange={(v) => metti("reverseCharge", v)} className="mt-0.5" />
            <span className="text-sm">Inversione contabile<span className="block text-xs text-muted-foreground">Subappalto edile: fattura senza IVA.</span></span>
          </label>
          {errori.reverseCharge && <p className="text-xs text-destructive sm:col-span-2">{errori.reverseCharge}</p>}
        </Sezione>

        <Campo etichetta="Note">{(id) => <Textarea id={id} rows={2} value={c.note ?? ""} onChange={(e) => metti("note", e.target.value || null)} />}</Campo>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button type="submit" disabled={salva.isPending || bloccato}>
            {salva.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salva il contratto
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
