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
import { stessaLavorazionePos, testiMancantiDaProposta } from "@/lib/sicurezza/testiLavorazionePos";
import type { Lavorazione } from "../../../../supabase/functions/_shared/posModello";
import { RiferimentiSchedaPos } from "./SchedeStandardPos";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export interface PerimetroPropostePos { fasi: string[]; ambito: string; pscOcrDa?: number; computo?: { id: string; capitoli: string[] } }
export interface RisultatoPropostePos { lavorazioni: Lavorazione[]; modalita_organizzative?: string; avvisi?: string[]; ditte?: string[] }
type AggiornamentoPropostaPos = { id: string; modo: "testi" | "fonti" };
interface IndiceComputo {
  computo: { id: string; titolo: string; capitoli: { nome: string; voci: number; fase: { id: string; name: string } | null }[] } | null;
  avviso?: string;
}

export function PerimetroAiPos({ companyId, orderId, posId, inSubappalto, psc, iniziale, onClose, onGenera, occupato, errore }: {
  companyId: string; orderId: string; posId: string; inSubappalto: boolean; psc?: ContestoLetturaPsc; onClose: () => void;
  iniziale: Pick<PerimetroPropostePos, "ambito" | "fasi">; onGenera: (scelta: PerimetroPropostePos) => void; occupato: boolean; errore: string | null;
}) {
  const t = useT();
  const query = useFasiFascicolo(companyId, orderId);
  const [fasi, scegliFasi] = useState(iniziale.fasi);
  const [ambito, scriviAmbito] = useState(iniziale.ambito);
  const fasiValide = query.data ? fasi.filter(id => query.data.some(f => f.id === id)) : fasi;
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
          <DialogTitle>{t("Prepara le lavorazioni con l’AI")}</DialogTitle>
          <DialogDescription>
            {inSubappalto ? t("Indica solo le lavorazioni assegnate alla tua impresa.") : t("Scegli le fasi da esaminare o usa l’intera commessa per preparare la bozza.")}
          </DialogDescription>
        </DialogHeader>
        {!!query.data?.length && <fieldset className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-2.5">
          <legend className="px-1 text-xs font-medium">{t("Fasi della commessa")}</legend>
          {query.data.map(fase => <label key={fase.id} className="flex items-start gap-2 text-sm">
            <Checkbox checked={fasi.includes(fase.id)} disabled={occupato || (!fasi.includes(fase.id) && fasi.length >= 80)}
              onCheckedChange={v => scegliFasi(prev => v === true ? [...prev, fase.id] : prev.filter(idFase => idFase !== fase.id))} />
            <span>{fase.name}</span>
          </label>)}
        </fieldset>}
        {query.isLoading && <p className="text-sm text-muted-foreground" role="status">{t("Caricamento delle fasi…")}</p>}
        {query.isError && <p className="text-sm text-amber-800">{t("Fasi non disponibili. Puoi descrivere qui le lavorazioni.")}</p>}
        <div className="space-y-2 rounded-lg border p-2.5">
          <Button size="sm" type="button" variant="ghost" aria-expanded={apriComputo} disabled={occupato}
            onClick={() => setApriComputo(v => !v)}>{t("Capitoli del computo")}{capitoli.length ? ` (${capitoli.length})` : ""}</Button>
          {apriComputo && <>
            {indice.isLoading && <p role="status" className="text-xs text-muted-foreground">{t("Caricamento dei capitoli…")}</p>}
            {indice.isError && <p className="text-xs text-destructive">{t("Computo non disponibile.")} <button type="button" className="underline" onClick={() => void indice.refetch()}>{t("Riprova")}</button></p>}
            {indice.data?.avviso && <p className="text-xs text-muted-foreground">{indice.data.avviso}</p>}
            {computo && <fieldset className="max-h-44 space-y-2 overflow-y-auto">
              <legend className="text-xs font-medium">{computo.titolo || t("Computo collegato")}</legend>
              {computo.capitoli.map(c => <label key={c.nome} className="flex items-start gap-2 text-sm">
                <Checkbox checked={capitoli.includes(c.nome)} disabled={occupato || (capitoli.length >= 80 && !capitoli.includes(c.nome))}
                  onCheckedChange={v => scegliCapitoli(prev => v === true ? [...prev, c.nome] : prev.filter(n => n !== c.nome))} />
                <span>{c.nome || t("Voci senza capitolo")} · {t(c.voci === 1 ? "{n} voce" : "{n} voci", { n: c.voci })}
                  {c.fase && <span className="block text-xs text-muted-foreground">{t("Fase proposta · {name}", { name: String(c.fase.name ?? "") })}</span>}</span>
              </label>)}
            </fieldset>}
            {!!fasiSuggerite.length && <Button type="button" size="sm" variant="outline" disabled={occupato}
              onClick={() => scegliFasi(prev => [...new Set([...prev, ...fasiSuggerite])].slice(0, 80))}>{t("Seleziona le fasi proposte")}</Button>}
          </>}
        </div>
        <div className="space-y-1">
          <Label htmlFor={id}>{t("Lavorazioni da includere")}</Label>
          <Textarea id={id} value={ambito} maxLength={1000} onChange={e => scriviAmbito(e.target.value)} readOnly={occupato}
            placeholder={t("Es. solo posa degli infissi e delle schermature ai piani 1 e 2")} />
        </div>
        {psc && !occupato && <LetturaOcrPsc {...psc} />}
        {occupato && <ProgressiveFluxLoader label={t("Preparazione delle proposte")} />}
        {errore && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive" role="alert">{errore}</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={occupato}>{t("Annulla")}</Button>
          <Button disabled={occupato || (capitoli.length > 0 && selezionati.length !== capitoli.length) ||
              (inSubappalto && !fasiValide.length && !testo && !capitoli.length)}
            onClick={() => onGenera({ fasi: fasiValide, ambito: testo, ...(capitoli.length && computo ? { computo: { id: computo.id, capitoli } } : {}) })}>
            {occupato && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            {occupato ? t("Sto preparando le proposte…") : t("Genera proposte")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RevisioneProposteAiPos({ risultato, modalitaVuota, preesistenti, destinazioneId, onClose, onApplica }: {
  risultato: RisultatoPropostePos; modalitaVuota: boolean; preesistenti: Lavorazione[]; destinazioneId?: string; onClose: () => void;
  onApplica: (lavorazioni: Lavorazione[], modalita: string, aggiornamenti: Record<string, AggiornamentoPropostaPos>) => void;
}) {
  const tr = useT();
  const idScelte = useId();
  const giaPresente = (l: Lavorazione) => preesistenti.some(e => stessaLavorazionePos(l, e));
  const stessaFase = (proposta: Lavorazione, esistente: Lavorazione) =>
    !proposta.fase_id || !esistente.fase_id || proposta.fase_id === esistente.fase_id;
  const destinazione = preesistenti.find(l => l.id === destinazioneId);
  const [aggiornamenti, aggiorna] = useState<Record<string, AggiornamentoPropostaPos>>(() => {
    const iniziali: Record<string, AggiornamentoPropostaPos> = {};
    const assegnate = new Set<string>();
    for (const proposta of risultato.lavorazioni) {
      const presenti = preesistenti.filter(e => stessaLavorazionePos(proposta, e));
      if (!presenti.length && risultato.lavorazioni.length === 1 && destinazione && stessaFase(proposta, destinazione)) presenti.push(destinazione);
      if (presenti.length !== 1 || assegnate.has(presenti[0].id) || !testiMancantiDaProposta(presenti[0], proposta).length) continue;
      iniziali[proposta.id] = { id: presenti[0].id, modo: "testi" };
      assegnate.add(presenti[0].id);
    }
    return iniziali;
  });
  const [scelte, scegli] = useState(() => new Set(risultato.lavorazioni.filter(l => aggiornamenti[l.id] || !giaPresente(l)).map(l => l.id)));
  const [accettaModalita, scegliModalita] = useState(false);
  const [svolgimento, setSvolgimento] = useState<Record<string, string>>({});
  const modalita = modalitaVuota ? risultato.modalita_organizzative?.trim() ?? "" : "";
  const pronte: Lavorazione[] = [];
  const nuove: Lavorazione[] = [];
  const assegnate = new Set<string>();
  for (const proposta of risultato.lavorazioni) {
    if (!scelte.has(proposta.id)) continue;
    const scelta = aggiornamenti[proposta.id];
    if (!scelta) {
      if (!giaPresente(proposta) && !nuove.some(l => stessaLavorazionePos(proposta, l))) {
        pronte.push(proposta);
        nuove.push(proposta);
      }
      continue;
    }
    const esistente = preesistenti.find(e => e.id === scelta.id);
    if (!esistente || assegnate.has(esistente.id) || !stessaFase(proposta, esistente)) continue;
    const applicabile = scelta.modo === "fonti" ? !!proposta.fonti_scheda : !!testiMancantiDaProposta(esistente, proposta).length;
    if (!applicabile) continue;
    pronte.push(proposta);
    assegnate.add(esistente.id);
  }
  return (
    <Dialog open onOpenChange={aperto => { if (!aperto) onClose(); }}>
      <DialogContent className="flex max-h-[88vh] min-h-0 max-w-3xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle>{tr("Rivedi le proposte AI")}</DialogTitle>
          <DialogDescription>{tr("Rivedi i testi proposti. Puoi compilare i campi vuoti di una scheda esistente o aggiungere una lavorazione.")}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
          {!!risultato.avvisi?.length && <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <ul className="space-y-1">{risultato.avvisi.map(a => <li key={a}>{a}</li>)}</ul>
          </div>}
          {!!modalita && <div className="space-y-2 rounded-md border p-2.5">
            <div className="flex items-start gap-2">
              <Checkbox id={`${idScelte}-modalita`} checked={accettaModalita} onCheckedChange={v => scegliModalita(v === true)} />
              <Label htmlFor={`${idScelte}-modalita`}>{tr("Inserisci anche le modalità organizzative")}</Label>
            </div>
            <p className="whitespace-pre-line text-xs text-muted-foreground">{modalita}</p>
          </div>}
          <ul className="space-y-2">
            {risultato.lavorazioni.map(l => {
              const idScelta = `${idScelte}-scheda-${l.id}`;
              const azione = aggiornamenti[l.id];
              const esistente = preesistenti.find(x => x.id === azione?.id);
              const testi = esistente && azione?.modo === "testi" ? testiMancantiDaProposta(esistente, l) : [];
              const destinazioni = preesistenti.filter(x => stessaFase(l, x) && (azione?.id === x.id ||
                !Object.entries(aggiornamenti).some(([id, scelta]) => scelte.has(id) && scelta.id === x.id)));
              return <li key={l.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-start gap-2">
                  <Checkbox id={idScelta} checked={scelte.has(l.id)} onCheckedChange={v => scegli(prev => {
                    const next = new Set(prev);
                    if (v === true) next.add(l.id);
                    else next.delete(l.id);
                    return next;
                  })} />
                  <Label htmlFor={idScelta} className="break-words font-semibold">{l.titolo || l.descrizione}</Label>
                </div>
                {l.titolo && !testi.length && <p className="break-words text-xs text-muted-foreground">{l.descrizione}</p>}
                {!!testi.length && <div className="grid gap-2 rounded-md bg-muted/50 p-2.5 text-xs">
                  {testi.map(t => <div key={t.id}><p className="font-medium">{t.titolo}</p><p className="whitespace-pre-wrap break-words text-muted-foreground">{t.testo}</p></div>)}
                </div>}
                {giaPresente(l) && !azione && <p className="text-xs text-muted-foreground">{tr("Scheda già in bozza. Scegli come aggiornarla.")}</p>}
                {l.fonti_scheda && <RiferimentiSchedaPos fonti={l.fonti_scheda} />}
                {!!l.fonti_scheda?.quesiti?.length && <p className="text-xs text-amber-800">{tr("{n} dettagli da confermare sul cantiere", { n: l.fonti_scheda.quesiti.length })}</p>}
                {!!risultato.ditte?.length && !aggiornamenti[l.id] && <label className="block space-y-1 text-xs">
                  <span>{tr("Chi esegue · {titolo}", { titolo: l.titolo || tr("lavorazione") })}</span>
                  <select className="block min-h-9 w-full rounded-md border bg-background px-2" disabled={!scelte.has(l.id)}
                    value={svolgimento[l.id] ?? l.svolgimento_con}
                    onChange={e => setSvolgimento(prev => ({ ...prev, [l.id]: e.target.value }))}>
                    <option value="">{tr("La nostra impresa")}</option>
                    {risultato.ditte.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>}
                {!!destinazioni.length && <label className="block space-y-1 text-xs">
                  <span>{tr("Azione per {titolo}", { titolo: l.titolo || tr("la scheda") })}</span>
                  <select className="block min-h-9 w-full rounded-md border bg-background px-2"
                    value={azione ? `${azione.modo}:${azione.id}` : ""}
                    disabled={!scelte.has(l.id)} onChange={e => {
                      const [modo, id] = e.target.value.split(":");
                      aggiorna(prev => {
                        const prossime = { ...prev };
                        if (id && (modo === "testi" || modo === "fonti")) prossime[l.id] = { id, modo };
                        else delete prossime[l.id];
                        return prossime;
                      });
                    }}>
                    <option value="">{giaPresente(l) ? tr("Scegli come aggiornare la scheda") : tr("Aggiungi come nuova scheda")}</option>
                    {destinazioni.filter(x => x.id === destinazioneId || stessaLavorazionePos(l, x) || (!!l.fase_id && l.fase_id === x.fase_id))
                      .filter(x => testiMancantiDaProposta(x, l).length)
                      .map(x => <option key={x.id} value={`testi:${x.id}`}>{tr("Compila i testi mancanti · {titolo}", { titolo: String(x.titolo ?? "") })}</option>)}
                    {l.fonti_scheda && destinazioni.map(x => <option key={x.id} value={`fonti:${x.id}`}>{tr("Aggiorna le fonti · {titolo}", { titolo: String(x.titolo ?? "") })}</option>)}
                  </select>
                </label>}
              </li>;
            })}
          </ul>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>{tr("Annulla")}</Button>
          <Button disabled={!pronte.length && !(accettaModalita && modalita)}
            onClick={() => onApplica(pronte.map(l => {
              if (!(l.id in svolgimento)) return l;
              const ditta = svolgimento[l.id];
              return { ...l, svolgimento: ditta ? "subappalto" : "diretto", svolgimento_con: ditta };
            }), accettaModalita ? modalita : "", aggiornamenti)}>
            {tr("Applica alla bozza")}{pronte.length ? ` (${pronte.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
