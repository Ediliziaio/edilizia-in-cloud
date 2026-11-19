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
import {Input} from "@/components/ui/input";
import {preparaPianoSal, type ModalitaPiano, type PianoSalAperto} from "@/lib/orders/pianoSalAperto";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useModelliPagamento } from "@/hooks/useModelliPagamento";
import { formatCurrency } from "@/lib/formatters";
import type { Installment } from "@/lib/orderUtils";
import { quandoSiIncassa, rateDaModello, riepilogoModello, type ModelloPagamento } from "@/lib/orders/modelliPagamento";

interface Props {
 aperto:boolean; totaleLordo:number; sostituisce:boolean; onChiudi:()=>void;
 onScegli:(rate:Installment[],piano?:PianoSalAperto|null)=>void;
}
export function ScegliPianoPagamento(props:Props){
 const {offerti}=useModelliPagamento();
 return <SceltaPianoPagamento {...props} modelli={offerti}/>;
}
/** Stessa interfaccia anche nella prova locale, senza richieste al gestionale. */
export function SceltaPianoPagamento({aperto,totaleLordo,sostituisce,onChiudi,onScegli,modelli:offerti}:Props & {modelli:ReadonlyArray<ModelloPagamento>}) {
  const [modo,setModo]=useState<ModalitaPiano>("fixed");
  const [acconto,setAcconto]=useState("20");
  const [unita,setUnita]=useState<"percent"|"amount">("percent");
  const [scelto, setScelto] = useState("");
  // Riaprendo non resta selezionato il piano di prima: si riparte dalla domanda.
  useEffect(() => { if (aperto) {setScelto("");setModo("fixed");setAcconto("20");setUnita("percent");} }, [aperto]);

  const modello = offerti.find((m) => m.id === scelto) ?? null;
  const dinamico=modo!=="fixed"?preparaPianoSal(modo,totaleLordo,acconto,unita):null;
  const anteprima = dinamico?.rate ?? (modello ? rateDaModello(modello, totaleLordo) : []);

  return (
    <Dialog open={aperto} onOpenChange={(o) => { if (!o) onChiudi(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Come si paga</DialogTitle>
          <DialogDescription>
            Scegli se concordare le rate in anticipo oppure pagare secondo i lavori eseguiti.
            Totale contratto con IVA: {formatCurrency(totaleLordo)}.
            {sostituisce ? " Il piano attuale viene sostituito." : ""}
          </DialogDescription>
        </DialogHeader>

        <RadioGroup aria-label="Modalità di pagamento" value={modo} onValueChange={v=>setModo(v as ModalitaPiano)} className="gap-2">
          {([{id:"fixed",title:"Rate a percentuale",text:"Importi e momenti concordati prima: acconto, rate intermedie e saldo."},{id:"advance_sal",title:"Acconto + SAL",text:"Definisci solo l’acconto. I SAL seguono l’avanzamento effettivo del cantiere."},{id:"sal",title:"Solo SAL",text:"Nessun acconto e nessun numero di SAL da fissare oggi."}] as const).map(option=><label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal ${modo===option.id?"border-primary bg-primary/5":""}`}><RadioGroupItem value={option.id} className="mt-0.5" aria-label={option.title}/><span className="min-w-0 space-y-0.5"><span className="block text-sm font-medium">{option.title}</span><span className="block text-xs text-muted-foreground">{option.text}</span></span></label>)}
        </RadioGroup>
        {modo!=="fixed" && <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
          {modo==="advance_sal" && <><Label htmlFor="sal-acconto">Acconto iniziale · IVA inclusa</Label><div className="flex gap-2"><Input id="sal-acconto" inputMode="decimal" value={acconto} onChange={e=>setAcconto(e.target.value)} aria-invalid={!!dinamico?.error}/><select aria-label="Inserisci acconto in" value={unita} onChange={e=>{setUnita(e.target.value as "percent"|"amount");setAcconto("");}} className="rounded-md border bg-background px-2 text-sm"><option value="percent">Percentuale %</option><option value="amount">Importo €</option></select></div></>}
          <p className="text-sm font-medium">I SAL si definiscono durante i lavori</p><p className="text-xs text-muted-foreground">Non servono numero, percentuali o date dei SAL futuri. Ogni verbale registra i lavori eseguiti; dalla quota certificata prepari la fattura e la sua scadenza. Il recupero dell’eventuale acconto si verifica nel certificato.</p>
          {dinamico?.error && <p role="alert" className="text-xs text-destructive">{dinamico.error}</p>}
        </div>}
        {modo==="fixed" && <p className="text-xs font-medium text-muted-foreground">Scegli un modello con quote già concordate</p>}
        {modo!=="fixed" ? null : totaleLordo <= 0 ? (
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
                  <span className="block text-sm font-medium">{m.nome === "Ristrutturazione a SAL" ? "Ristrutturazione · SAL a percentuale" : m.nome}</span>
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
          <Button disabled={modo==="fixed"?!modello:!!dinamico?.error} onClick={() => { if (modo!=="fixed"&&!dinamico?.error) {onScegli(anteprima,{version:1,mode:modo});onChiudi();} else if (modello) {onScegli(anteprima,null);onChiudi();} }}>
            Usa questo piano
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
