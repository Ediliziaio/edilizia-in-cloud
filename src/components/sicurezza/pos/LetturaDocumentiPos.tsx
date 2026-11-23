import { useMemo, useState, type ReactNode } from "react";
import { ExternalLink, FileSearch, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { UniformSelect } from "@/components/ui/uniform-select";
import { useContrattiCommessaPos, useLetturaDocumentiPos, type LetturaDocumentiVista } from "@/hooks/useLetturaDocumentiPos";
import { apriFileRiservato } from "@/lib/storagePrivato";
import type { PropostaEmergenzaPsc } from "../../../../supabase/functions/_shared/posEmergenzePsc";
import {
  CAMPI_LETTORE, DOCUMENTO_LETTORE_LABEL, eCampoOrganizzazione, indicazioniValide, proposteEmergenzaDaLettura, righeOrganizzazioneLettore,
  type CampoLettore, type DecisioniLettore, type IndicazioneLettore, type SceltaConflitto,
} from "../../../../supabase/functions/_shared/posLettoreDocumenti";
import type { RiferimentoPsc } from "../../../../supabase/functions/_shared/posPsc";

/** Quando un aspetto manca in entrambi i documenti, la domanda da farsi. */
const DOMANDE: Record<CampoLettore, string> = {
  accessi: "Da dove entrano persone e mezzi, e con quale percorso fino alla zona di lavoro?",
  scarico: "Dove si scaricano e si depositano i materiali, e in quali fasce orarie?",
  servizi: "Quali servizi e spazi comuni usa l’impresa, e con quali regole?",
  fronti: "Chi coordina i passaggi fra le zone occupate e le attività in contemporanea?",
  orari: "In quali orari si lavora e quali lavorazioni hanno vincoli di orario?",
  raccolta: "Dove si trova il punto di raccolta?",
  esodo: "Quali sono le vie di esodo e le uscite di emergenza?",
  primo_soccorso: "Dove sono i presidi di primo soccorso?",
  antincendio: "Dove sono gli estintori e gli altri presidi antincendio?",
  accesso_soccorsi: "Da dove accedono i mezzi di soccorso?",
  allarme: "Chi dà l’allarme e chi chiama i soccorsi?",
  planimetria: "Quale planimetria o tavola riporta le vie di esodo e i presidi?",
};
const chiaveIndicazione = (i: IndicazioneLettore) => [i.campo, i.documento, i.pagina, i.citazione].join("|");

interface Props {
  companyId: string;
  posId: string;
  orderId: string;
  /** Il PSC del POS, se ce n'è uno collegato. */
  psc?: RiferimentoPsc;
  salva?: () => Promise<boolean>;
  onInserisci: (righeOrganizzazione: string[], emergenze: PropostaEmergenzaPsc[]) => void;
}

export function LetturaDocumentiPos(props: Props) {
  const [aperto, setAperto] = useState(false);
  const { stato } = useLetturaDocumentiPos(props.companyId, props.posId);
  const lettura = stato.data;
  const etichetta = lettura?.stato === "in_corso" && !lettura.ferma ? "Lettura in corso…"
    : lettura?.stato === "pronta" && lettura.risultato ? "Risultati della lettura" : "Leggi PSC e contratto";
  return <>
    <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setAperto(true)}>
      {lettura?.stato === "in_corso" && !lettura.ferma
        ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileSearch className="size-4" aria-hidden="true" />}
      {etichetta}
    </Button>
    {aperto && <Dialog open onOpenChange={setAperto}>
      <DialogContent className="flex max-h-[90dvh] min-w-0 max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-1 px-4 pb-3 pt-5 pr-10 sm:px-6">
          <DialogTitle>Leggi PSC e contratto</DialogTitle>
          <DialogDescription>Accessi, consegne, servizi, coordinamento, orari ed emergenze, ciascuno con la frase esatta della pagina da cui viene.</DialogDescription>
        </DialogHeader>
        <CorpoLettura {...props} lettura={lettura ?? null} caricamento={stato.isLoading} erroreStato={stato.isError}
          rileggi={() => void stato.refetch()} chiudi={() => setAperto(false)} />
      </DialogContent>
    </Dialog>}
  </>;
}

function CorpoLettura({ companyId, posId, orderId, psc, salva, onInserisci, lettura, caricamento, erroreStato, rileggi, chiudi }: Props & {
  lettura: LetturaDocumentiVista | null; caricamento: boolean; erroreStato: boolean; rileggi: () => void; chiudi: () => void;
}) {
  const [nuova, setNuova] = useState(false);
  if (caricamento) return <Stato><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Controllo le letture precedenti…</Stato>;
  if (erroreStato) return <Stato>
    <span role="alert">Non riesco a leggere lo stato della lettura.</span>
    <Button type="button" size="sm" variant="outline" onClick={rileggi}>Riprova</Button>
  </Stato>;
  // Una lettura pronta senza risultato è di una versione precedente del lettore: si rifà.
  if (!lettura || nuova || (lettura.stato === "pronta" && !lettura.risultato)) return <SceltaDocumenti companyId={companyId} posId={posId} orderId={orderId} psc={psc} salva={salva}
    contrattoIniziale={lettura?.fonti.contratto?.id ?? null} onAvviata={() => setNuova(false)} chiudi={chiudi} />;
  if (lettura.stato === "in_corso" || lettura.stato === "errore") return <InCorso companyId={companyId} posId={posId} lettura={lettura} salva={salva}
    nuova={() => setNuova(true)} chiudi={chiudi} />;
  return <Risultati companyId={companyId} posId={posId} psc={psc} lettura={lettura} onInserisci={onInserisci} nuova={() => setNuova(true)} chiudi={chiudi} />;
}

function Stato({ children }: { children: ReactNode }) {
  return <div role="status" className="flex flex-wrap items-center gap-2 border-t px-4 py-6 text-sm text-muted-foreground sm:px-6">{children}</div>;
}

function SceltaDocumenti({ companyId, posId, orderId, psc, salva, contrattoIniziale, onAvviata, chiudi }: {
  companyId: string; posId: string; orderId: string; psc?: RiferimentoPsc; salva?: () => Promise<boolean>;
  contrattoIniziale: string | null; onAvviata: () => void; chiudi: () => void;
}) {
  const contratti = useContrattiCommessaPos(orderId, true);
  const { avvia } = useLetturaDocumentiPos(companyId, posId);
  const [usaPsc, setUsaPsc] = useState(!!psc);
  // Finché l'utente non sceglie, vale il contratto della lettura precedente o quello che sembra un contratto.
  const [sceltaUtente, setContratto] = useState<string | null>(null);
  const contratto = sceltaUtente ?? contrattoIniziale ?? contratti.data?.find(c => c.suggerito)?.id ?? "";
  const [errore, setErrore] = useState("");
  const pronto = (usaPsc && !!psc) || !!contratto;

  async function avviaLettura() {
    setErrore("");
    try {
      await avvia.mutateAsync({ contrattoId: contratto || null, usaPsc: usaPsc && !!psc, salva });
      onAvviata();
    } catch (e) {
      setErrore(e instanceof Error && e.message ? e.message : "La lettura non è partita. Riprova.");
    }
  }

  return <>
    <div className="min-h-0 space-y-4 overflow-y-auto border-y px-4 py-4 sm:px-6">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">PSC</p>
        {psc ? <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={usaPsc} onCheckedChange={v => setUsaPsc(v === true)} aria-label="Leggi il PSC" />
          <span>{psc.titolo || psc.file_name} · rev. {psc.revisione}</span>
        </label> : <p className="text-sm text-muted-foreground">Nessun PSC collegato al POS. Collegalo nella sezione PSC per leggerlo insieme al contratto.</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="lettura-contratto">Contratto</Label>
        <UniformSelect id="lettura-contratto" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={contratto}
          disabled={contratti.isLoading || contratti.isError} onChange={e => setContratto(e.target.value)}>
          <option value="">{contratti.isLoading ? "Carico i documenti della commessa…" : "Nessun contratto"}</option>
          {contratti.data?.map(c => <option key={c.id} value={c.id}>{c.file_name}{c.suggerito ? " · contratto" : ""}</option>)}
        </UniformSelect>
        {contratti.isError && <p role="alert" className="text-xs text-destructive">Documenti della commessa non disponibili. <button type="button" className="underline" onClick={() => void contratti.refetch()}>Riprova</button></p>}
        {!contratti.isLoading && !contratti.isError && !contratti.data?.length && <p className="text-xs text-muted-foreground">La commessa non ha PDF che puoi aprire. Carica il contratto nei documenti della commessa.</p>}
      </div>
      <p className="text-xs text-muted-foreground">La lettura continua anche se chiudi questa finestra. Costa come una proposta AI per ogni blocco di pagine (al massimo tre).</p>
      {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
    </div>
    <DialogFooter className="shrink-0 gap-2 px-4 py-3 sm:px-6">
      <Button type="button" variant="outline" onClick={chiudi}>Chiudi</Button>
      <Button type="button" disabled={!pronto || avvia.isPending} onClick={() => void avviaLettura()}>
        {avvia.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />}Avvia la lettura
      </Button>
    </DialogFooter>
  </>;
}

function InCorso({ companyId, posId, lettura, salva, nuova, chiudi }: {
  companyId: string; posId: string; lettura: LetturaDocumentiVista; salva?: () => Promise<boolean>; nuova: () => void; chiudi: () => void;
}) {
  const { avvia } = useLetturaDocumentiPos(companyId, posId);
  const [errore, setErrore] = useState("");
  const { fatti, blocchi } = lettura.avanzamento;
  const riprendi = async () => {
    setErrore("");
    try {
      await avvia.mutateAsync({ contrattoId: lettura.fonti.contratto?.id ?? null, usaPsc: !!lettura.fonti.psc, salva });
    } catch (e) {
      setErrore(e instanceof Error && e.message ? e.message : "La lettura non è ripartita. Riprova.");
    }
  };
  const ferma = lettura.stato === "errore" || lettura.ferma;
  return <>
    <div className="min-h-0 space-y-3 overflow-y-auto border-y px-4 py-4 text-sm sm:px-6">
      <Documenti lettura={lettura} />
      {ferma && <>
        <p role="alert" className="text-destructive">{lettura.errore || "La lettura si è fermata."}</p>
        {lettura.fonti.psc && <p className="text-xs text-muted-foreground">Se si ferma ancora, avvia prima «Leggi tutto il PSC» nella sezione PSC: il lettore userà le pagine già lette e archiviate invece di estrarle di nuovo.</p>}
      </>}
      {ferma ? null
        : <p role="status" className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {blocchi ? `Lettura in corso: ${fatti} di ${blocchi} blocchi di pagine.` : "Preparo le pagine da leggere…"} Puoi chiudere: la ritrovi qui.
        </p>}
      {!!lettura.avvisi.length && <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">{lettura.avvisi.map(a => <li key={a}>{a}</li>)}</ul>}
      {errore && <p role="alert" className="text-destructive">{errore}</p>}
    </div>
    <DialogFooter className="shrink-0 gap-2 px-4 py-3 sm:px-6">
      <Button type="button" variant="outline" onClick={nuova}>Scegli altri documenti</Button>
      {ferma && <Button type="button" disabled={avvia.isPending} onClick={() => void riprendi()}>Riprendi da dove si è fermata</Button>}
      {!ferma && <Button type="button" onClick={chiudi}>Chiudi</Button>}
    </DialogFooter>
  </>;
}

function Documenti({ lettura }: { lettura: LetturaDocumentiVista }) {
  const { psc, contratto } = lettura.fonti;
  return <p className="text-xs text-muted-foreground">
    Documenti letti: {[psc ? `PSC ${psc.titolo} rev. ${psc.revisione}` : "", contratto ? `contratto ${contratto.file_name}` : ""].filter(Boolean).join(" e ")}.
  </p>;
}

function Risultati({ companyId, posId, psc, lettura, onInserisci, nuova, chiudi }: {
  companyId: string; posId: string; psc?: RiferimentoPsc; lettura: LetturaDocumentiVista;
  onInserisci: Props["onInserisci"]; nuova: () => void; chiudi: () => void;
}) {
  const { decidi } = useLetturaDocumentiPos(companyId, posId);
  const risultato = lettura.risultato!;
  const [decisioni, setDecisioni] = useState<DecisioniLettore>(lettura.decisioni);
  const [scelte, setScelte] = useState<Set<string>>(() => new Set(indicazioniValide(risultato, lettura.decisioni).map(chiaveIndicazione)));
  const [confermato, conferma] = useState(false);
  /** Fase o ambito di ogni estratto, quando un campo di emergenza ne riceve più d'uno (come in «Cerca indicazioni nel PSC»). */
  const [fasi, setFasi] = useState<Record<string, string>>({});
  // Il PSC della lettura deve essere ancora quello del POS, altrimenti le emergenze non si possono inserire con le loro fonti.
  const pscAllineato = !!psc && !!lettura.fonti.psc && psc.id === lettura.fonti.psc.id && psc.sha256 === lettura.fonti.psc.sha256 &&
    psc.revisione === lettura.fonti.psc.revisione;
  const valide = useMemo(() => new Set(indicazioniValide(risultato, decisioni).map(chiaveIndicazione)), [risultato, decisioni]);
  const inConflitto = new Set(risultato.conflitti.map(c => c.campo));
  const inseribile = (i: IndicazioneLettore) => valide.has(chiaveIndicazione(i)) &&
    (eCampoOrganizzazione(i.campo) || (i.documento === "psc" && pscAllineato));
  const selezionate = risultato.indicazioni.filter(i => scelte.has(chiaveIndicazione(i)) && inseribile(i));
  const campi = (Object.keys(CAMPI_LETTORE) as CampoLettore[]).filter(c => risultato.indicazioni.some(i => i.campo === c));
  const emergenzaMultipla = (i: IndicazioneLettore) => !eCampoOrganizzazione(i.campo) &&
    selezionate.filter(s => s.campo === i.campo && s.documento === "psc").length > 1;
  const fasiMancanti = selezionate.some(i => emergenzaMultipla(i) && !fasi[chiaveIndicazione(i)]?.trim());

  const scegli = (campo: CampoLettore, scelta: SceltaConflitto) => {
    const prossime = { ...decisioni, [campo]: scelta };
    setDecisioni(prossime);
    setScelte(prev => {
      const s = new Set(prev);
      for (const i of risultato.indicazioni.filter(x => x.campo === campo)) {
        if (i.documento === scelta) s.add(chiaveIndicazione(i)); else s.delete(chiaveIndicazione(i));
      }
      return s;
    });
    conferma(false);
    decidi.mutate({ letturaId: lettura.id, decisioni: prossime }, { onError: e => toast.error(e instanceof Error ? e.message : "Scelta non salvata") });
  };
  const apri = (i: Pick<IndicazioneLettore, "documento" | "pagina">) => {
    const percorso = i.documento === "psc"
      ? psc && pscAllineato ? { bucket: psc.archivio === "sicurezza_documenti" ? "sicurezza-documenti" : "fascicoli-cantiere", path: psc.file_path } : null
      : lettura.fonti.contratto ? { bucket: "order-attachments", path: lettura.fonti.contratto.file_path } : null;
    if (!percorso) { toast.error("Originale non disponibile"); return; }
    void apriFileRiservato(percorso.bucket, percorso.path, i.pagina).catch(() => toast.error("Pagina originale non disponibile"));
  };
  function inserisci() {
    const righe = righeOrganizzazioneLettore(selezionate, lettura.fonti.psc?.revisione);
    const emergenze = pscAllineato && lettura.fonti.psc
      ? proposteEmergenzaDaLettura({ ...risultato, indicazioni: selezionate }, lettura.fonti.psc, decisioni).map(p => {
        const fase = fasi[[p.campo, "psc", p.pagina, p.estratto].join("|")]?.trim();
        return fase ? { ...p, fase: fase.slice(0, 100) } : p;
      }) : [];
    onInserisci(righe, emergenze);
    toast.success("Indicazioni inserite nella bozza: salva per conservarle");
    chiudi();
  }

  return <>
    <div className="min-h-0 space-y-4 overflow-y-auto border-y px-4 py-4 sm:px-6">
      <Documenti lettura={lettura} />
      {!!lettura.avvisi.length && <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">{lettura.avvisi.map(a => <li key={a}>{a}</li>)}</ul>}
      {lettura.fonti.psc && !pscAllineato && <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
        Il PSC del POS non è più quello letto: le indicazioni di emergenza non si possono inserire. Avvia una nuova lettura.
      </p>}

      {!!risultato.conflitti.length && <section aria-label="Decisioni da prendere" className="space-y-2">
        <h3 className="text-sm font-semibold">Decisioni da prendere</h3>
        {risultato.conflitti.map(c => <fieldset key={c.campo} className="space-y-2 rounded-lg border border-amber-300 p-3">
          <legend className="px-1 text-sm font-medium">{CAMPI_LETTORE[c.campo]}: PSC e contratto non coincidono</legend>
          {c.descrizione && <p className="text-xs text-muted-foreground">{c.descrizione}</p>}
          <RadioGroup value={decisioni[c.campo] ?? ""} onValueChange={v => scegli(c.campo, v as SceltaConflitto)} aria-label={`Quale indicazione vale per ${CAMPI_LETTORE[c.campo]}`}>
            {(["psc", "contratto"] as const).map(d => <Label key={d} htmlFor={`conflitto-${c.campo}-${d}`} className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm font-normal">
              <RadioGroupItem id={`conflitto-${c.campo}-${d}`} value={d} className="mt-0.5" />
              <span className="min-w-0 space-y-1">
                <span className="block font-medium">Vale il {d === "psc" ? "PSC" : "contratto"} · p. {c[d].pagina}</span>
                <span className="block break-words">«{c[d].citazione}»</span>
              </span>
            </Label>)}
            <Label htmlFor={`conflitto-${c.campo}-nessuno`} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm font-normal">
              <RadioGroupItem id={`conflitto-${c.campo}-nessuno`} value="nessuno" /> Nessuno dei due: lo scrivo io
            </Label>
          </RadioGroup>
        </fieldset>)}
      </section>}

      <section aria-label="Indicazioni trovate" className="space-y-2">
        <h3 className="text-sm font-semibold">Indicazioni trovate</h3>
        {!campi.length && <p className="text-sm text-muted-foreground">Nessuna indicazione verificata nei documenti letti.</p>}
        {campi.map(campo => <fieldset key={campo} className="space-y-1.5 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">{CAMPI_LETTORE[campo]}</legend>
          {risultato.indicazioni.filter(i => i.campo === campo).map(i => {
            const k = chiaveIndicazione(i), puo = inseribile(i);
            return <div key={k} className="space-y-1 rounded-md border p-2">
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={puo && scelte.has(k)} disabled={!puo}
                  aria-label={`Usa l’indicazione del ${DOCUMENTO_LETTORE_LABEL[i.documento]} a pagina ${i.pagina} per ${CAMPI_LETTORE[campo]}`}
                  onCheckedChange={v => { setScelte(prev => { const s = new Set(prev); if (v === true) s.add(k); else s.delete(k); return s; }); conferma(false); }} />
                <span className="min-w-0 break-words">«{i.citazione}»</span>
              </label>
              <div className="ml-6 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline">{DOCUMENTO_LETTORE_LABEL[i.documento]} · p. {i.pagina}{i.metodo === "ocr" ? " · OCR" : ""}</Badge>
                <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => apri(i)}
                  aria-label={`Apri la pagina ${i.pagina} del ${DOCUMENTO_LETTORE_LABEL[i.documento]}`}>
                  <ExternalLink className="mr-1 size-3" aria-hidden="true" />Apri la pagina
                </Button>
                {inConflitto.has(campo) && !valide.has(k) && <span className="text-muted-foreground">Scegli sopra quale documento vale.</span>}
                {!eCampoOrganizzazione(campo) && i.documento === "contratto" && <span className="text-muted-foreground">Dal contratto: riportala a mano nelle emergenze.</span>}
              </div>
              {puo && scelte.has(k) && emergenzaMultipla(i) && <label className="ml-6 block space-y-1 text-xs font-medium">
                <span>Fase o ambito · pagina {i.pagina}</span>
                <Input className="h-8" value={fasi[k] ?? ""} maxLength={100} placeholder="Es. Allestimento, area nord"
                  onChange={e => { const v = e.target.value; setFasi(f => ({ ...f, [k]: v })); conferma(false); }} />
              </label>}
            </div>;
          })}
        </fieldset>)}
      </section>

      {!!risultato.mancanti.length && <section aria-label="Da chiarire" className="space-y-1.5">
        <h3 className="text-sm font-semibold">Non indicato nei documenti</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm">{risultato.mancanti.map(c => <li key={c}>{DOMANDE[c]}</li>)}</ul>
      </section>}

      {fasiMancanti && <p role="status" className="text-sm text-muted-foreground">Quando usi più estratti per la stessa voce di emergenza, indica la fase o l’ambito di ciascuno.</p>}
      {!!selezionate.length && <label className="flex items-start gap-2 rounded-md bg-muted/30 p-3 text-sm">
        <Checkbox checked={confermato} onCheckedChange={v => conferma(v === true)} />
        Ho confrontato le citazioni selezionate con gli originali e ne ho verificato la pertinenza a questo cantiere.
      </label>}
    </div>
    <DialogFooter className="shrink-0 gap-2 px-4 py-3 sm:px-6">
      <Button type="button" variant="outline" onClick={nuova}>Nuova lettura</Button>
      <Button type="button" disabled={!selezionate.length || !confermato || fasiMancanti} onClick={inserisci}>
        Inserisci {selezionate.length || ""} nella bozza
      </Button>
    </DialogFooter>
  </>;
}
