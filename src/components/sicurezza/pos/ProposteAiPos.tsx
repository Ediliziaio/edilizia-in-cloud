import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProgressiveFluxLoader } from "@/components/ui/progressive-flux-loader";
import { LetturaOcrPsc, type ContestoLetturaPsc } from "./LetturaOcrPsc";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useFasiFascicolo } from "@/hooks/useFascicoloCantiere";
import { chiamaServerPos } from "@/hooks/usePos";
import { testoRicercaSchedePos } from "../../../../supabase/functions/_shared/posSchedeStandard";
import type { Lavorazione } from "../../../../supabase/functions/_shared/posModello";
import { RiferimentiSchedaPos } from "./SchedeStandardPos";

export interface PerimetroPropostePos { fasi: string[]; ambito: string; pscOcrDa?: number; computo?: { id: string; capitoli: string[] } }
export interface RisultatoPropostePos { lavorazioni: Lavorazione[]; modalita_organizzative?: string; avvisi?: string[]; ditte?: string[] }
interface IndiceComputo {
  computo: { id: string; titolo: string; capitoli: { nome: string; voci: number; fase: { id: string; name: string } | null }[] } | null;
  avviso?: string;
}

export function PerimetroAiPos({ companyId, orderId, posId, inSubappalto, psc, onClose, onGenera, occupato, errore }: {
  companyId: string; orderId: string; posId: string; inSubappalto: boolean; psc?: ContestoLetturaPsc; onClose: () => void;
  onGenera: (scelta: PerimetroPropostePos) => void; occupato: boolean; errore: string | null;
}) {
  const query = useFasiFascicolo(companyId, orderId);
  const [fasi, scegliFasi] = useState<string[]>([]);
  const [ambito, scriviAmbito] = useState("");
  const [apriComputo, setApriComputo] = useState(false);
  const [capitoli, scegliCapitoli] = useState<string[]>([]);
  const indice = useQuery({
    queryKey: ["pos-capitoli-computo", companyId, orderId, posId],
    enabled: apriComputo,
    queryFn: () => chiamaServerPos<IndiceComputo>({ azione: "computo_ai", company_id: companyId, pos_id: posId }),
    refetchOnWindowFocus: false,
  });
  const computo = indice.data?.computo;
  const selezionati = computo?.capitoli.filter(c => capitoli.includes(c.nome)) ?? [];
  const fasiSuggerite = [...new Set(selezionati.flatMap(c => c.fase ? [c.fase.id] : []))];
  const id = useId();
  const testo = ambito.trim();
  return (
    <Dialog open onOpenChange={aperto => { if (!aperto && !occupato) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Prepara le lavorazioni con l’AI</DialogTitle>
          <DialogDescription>
            {inSubappalto ? "Indica solo le lavorazioni assegnate alla tua impresa." : "Scegli le fasi da esaminare o usa l’intera commessa per preparare la bozza."}
          </DialogDescription>
        </DialogHeader>
        {!!query.data?.length && <fieldset className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-2.5">
          <legend className="px-1 text-xs font-medium">Fasi della commessa</legend>
          {query.data.map(fase => <label key={fase.id} className="flex items-start gap-2 text-sm">
            <Checkbox checked={fasi.includes(fase.id)} disabled={occupato || (!fasi.includes(fase.id) && fasi.length >= 80)}
              onCheckedChange={v => scegliFasi(prev => v === true ? [...prev, fase.id] : prev.filter(idFase => idFase !== fase.id))} />
            <span>{fase.name}</span>
          </label>)}
        </fieldset>}
        {query.isLoading && <p className="text-sm text-muted-foreground" role="status">Caricamento delle fasi…</p>}
        {query.isError && <p className="text-sm text-amber-800">Fasi non disponibili. Puoi descrivere qui le lavorazioni.</p>}
        <div className="space-y-2 rounded-lg border p-2.5">
          <Button size="sm" type="button" variant="ghost" aria-expanded={apriComputo} disabled={occupato}
            onClick={() => setApriComputo(v => !v)}>Capitoli del computo{capitoli.length ? ` (${capitoli.length})` : ""}</Button>
          {apriComputo && <>
            {indice.isLoading && <p role="status" className="text-xs text-muted-foreground">Caricamento dei capitoli…</p>}
            {indice.isError && <p className="text-xs text-destructive">Computo non disponibile. <button type="button" className="underline" onClick={() => void indice.refetch()}>Riprova</button></p>}
            {indice.data?.avviso && <p className="text-xs text-muted-foreground">{indice.data.avviso}</p>}
            {computo && <fieldset className="max-h-44 space-y-2 overflow-y-auto">
              <legend className="text-xs font-medium">{computo.titolo || "Computo collegato"}</legend>
              {computo.capitoli.map(c => <label key={c.nome} className="flex items-start gap-2 text-sm">
                <Checkbox checked={capitoli.includes(c.nome)} disabled={occupato || (capitoli.length >= 80 && !capitoli.includes(c.nome))}
                  onCheckedChange={v => scegliCapitoli(prev => v === true ? [...prev, c.nome] : prev.filter(n => n !== c.nome))} />
                <span>{c.nome || "Voci senza capitolo"} · {c.voci} {c.voci === 1 ? "voce" : "voci"}
                  {c.fase && <span className="block text-xs text-muted-foreground">Fase proposta · {c.fase.name}</span>}</span>
              </label>)}
            </fieldset>}
            {!!fasiSuggerite.length && <Button type="button" size="sm" variant="outline" disabled={occupato}
              onClick={() => scegliFasi(prev => [...new Set([...prev, ...fasiSuggerite])].slice(0, 80))}>Seleziona le fasi proposte</Button>}
          </>}
        </div>
        <div className="space-y-1">
          <Label htmlFor={id}>Lavorazioni da includere</Label>
          <Textarea id={id} value={ambito} maxLength={1000} onChange={e => scriviAmbito(e.target.value)} readOnly={occupato}
            placeholder="Es. solo posa degli infissi e delle schermature ai piani 1 e 2" />
        </div>
        {psc && !occupato && <LetturaOcrPsc {...psc} />}
        {occupato && <ProgressiveFluxLoader label="Preparazione delle proposte" />}
        {errore && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive" role="alert">{errore}</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={occupato}>Annulla</Button>
          <Button disabled={occupato || (capitoli.length > 0 && selezionati.length !== capitoli.length) ||
              (inSubappalto && !fasi.length && !testo && !capitoli.length)}
            onClick={() => onGenera({ fasi, ambito: testo, ...(capitoli.length && computo ? { computo: { id: computo.id, capitoli } } : {}) })}>
            {occupato && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            {occupato ? "Sto preparando le proposte…" : "Genera proposte"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RevisioneProposteAiPos({ risultato, modalitaVuota, preesistenti, onClose, onApplica }: {
  risultato: RisultatoPropostePos; modalitaVuota: boolean; preesistenti: Lavorazione[]; onClose: () => void;
  onApplica: (lavorazioni: Lavorazione[], modalita: string, aggiornamenti: Record<string, string>) => void;
}) {
  const giaPresente = (l: Lavorazione) => preesistenti.some(e =>
    (!l.fase_id || !e.fase_id || l.fase_id === e.fase_id) &&
    testoRicercaSchedePos(l.titolo || l.descrizione) === testoRicercaSchedePos(e.titolo || e.descrizione));
  const [scelte, scegli] = useState(() => new Set(risultato.lavorazioni.filter(l => !giaPresente(l)).map(l => l.id)));
  const [accettaModalita, scegliModalita] = useState(false);
  const [aggiornamenti, aggiorna] = useState<Record<string, string>>({});
  const [svolgimento, setSvolgimento] = useState<Record<string, string>>({});
  const modalita = modalitaVuota ? risultato.modalita_organizzative?.trim() ?? "" : "";
  return (
    <Dialog open onOpenChange={aperto => { if (!aperto) onClose(); }}>
      <DialogContent className="flex max-h-[88vh] min-h-0 max-w-3xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Rivedi le proposte AI</DialogTitle>
          <DialogDescription>Scegli le schede da inserire. Dopo l’inserimento, completa i dati e conferma le singole lavorazioni.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
          {!!risultato.avvisi?.length && <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <ul className="space-y-1">{risultato.avvisi.map(a => <li key={a}>{a}</li>)}</ul>
          </div>}
          {!!modalita && <div className="space-y-2 rounded-md border p-2.5">
            <label className="flex items-start gap-2 text-sm font-medium">
              <Checkbox checked={accettaModalita} onCheckedChange={v => scegliModalita(v === true)} />
              Inserisci anche le modalità organizzative
            </label>
            <p className="whitespace-pre-line text-xs text-muted-foreground">{modalita}</p>
          </div>}
          <ul className="space-y-2">
            {risultato.lavorazioni.map(l => <li key={l.id} className="space-y-2 rounded-lg border p-3">
              <label className="flex items-start gap-2 text-sm font-semibold">
                <Checkbox checked={scelte.has(l.id)} onCheckedChange={v => scegli(prev => {
                  const next = new Set(prev);
                  if (v === true) next.add(l.id);
                  else next.delete(l.id);
                  return next;
                })} />
                {l.titolo || l.descrizione}
              </label>
              {l.titolo && <p className="text-xs text-muted-foreground">{l.descrizione}</p>}
              {giaPresente(l) && <p className="text-xs text-muted-foreground">Una scheda con questo titolo è già in bozza.</p>}
              {l.fonti_scheda && <RiferimentiSchedaPos fonti={l.fonti_scheda} />}
              {!!l.fonti_scheda?.quesiti?.length && <p className="text-xs text-amber-800">{l.fonti_scheda.quesiti.length} dettagli da confermare sul cantiere</p>}
              {!!risultato.ditte?.length && !aggiornamenti[l.id] && <label className="block space-y-1 text-xs">
                <span>Chi esegue · {l.titolo || "lavorazione"}</span>
                <select className="block min-h-9 w-full rounded-md border bg-background px-2" disabled={!scelte.has(l.id)}
                  value={svolgimento[l.id] ?? l.svolgimento_con}
                  onChange={e => setSvolgimento(prev => ({ ...prev, [l.id]: e.target.value }))}>
                  <option value="">La nostra impresa</option>
                  {risultato.ditte.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>}
              {!!preesistenti.length && l.fonti_scheda && <label className="block space-y-1 text-xs">
                <span>Azione per {l.titolo || "la scheda"}</span>
                <select className="block min-h-9 w-full rounded-md border bg-background px-2" value={aggiornamenti[l.id] ?? ""}
                  disabled={!scelte.has(l.id)} onChange={e => aggiorna(prev => ({ ...prev, [l.id]: e.target.value }))}>
                  <option value="">Aggiungi come nuova scheda</option>
                  {preesistenti.filter(x => (!l.fase_id || !x.fase_id || l.fase_id === x.fase_id) &&
                      !Object.entries(aggiornamenti).some(([id, esistente]) => id !== l.id && scelte.has(id) && esistente === x.id))
                    .map(x => <option key={x.id} value={x.id}>Aggiorna le fonti · {x.titolo}</option>)}
                </select>
              </label>}
            </li>)}
          </ul>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button disabled={!scelte.size && !(accettaModalita && modalita)}
            onClick={() => onApplica(risultato.lavorazioni.filter(l => scelte.has(l.id)).map(l => {
              if (!(l.id in svolgimento)) return l;
              const ditta = svolgimento[l.id];
              return { ...l, svolgimento: ditta ? "subappalto" : "diretto", svolgimento_con: ditta };
            }), accettaModalita ? modalita : "", aggiornamenti)}>
            Applica alla bozza{scelte.size ? ` (${scelte.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
