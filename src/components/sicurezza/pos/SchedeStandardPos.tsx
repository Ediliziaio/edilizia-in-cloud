import { useRef, useState } from "react";
import { BookOpen, Loader2, Plus, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { chiamaServerPos } from "@/hooks/usePos";
import { useFasiFascicolo } from "@/hooks/useFascicoloCantiere";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CAMPI_TESTO_LAVORAZIONE, modelloSuggeritoPos, testiMancantiDaProposta } from "@/lib/sicurezza/testiLavorazionePos";
import { FONTI_SCHEDE_POS, SCHEDE_STANDARD_POS, nuovaDaSchedaStandard, testoRicercaSchedePos } from "../../../../supabase/functions/_shared/posSchedeStandard";
import type { FontePscSchedaPos, FontiSchedaPos } from "../../../../supabase/functions/_shared/posFontiScheda";
import { daCompletare, type Lavorazione } from "../../../../supabase/functions/_shared/posModello";

export function CatalogoSchedeStandardPos({ companyId, orderId, onAggiungi }: {
  companyId?: string; orderId?: string; onAggiungi: (l: Lavorazione) => void;
}) {
  const [aperto, apri] = useState(false);
  const [query, cerca] = useState("");
  const [fase, scegliFase] = useState("");

  const termini = testoRicercaSchedePos(query).split(" ").filter(Boolean);
  const trovate = SCHEDE_STANDARD_POS.filter(s => {
    const testo = testoRicercaSchedePos([s.titolo, s.area, ...s.chiavi].join(" "));
    return termini.every(t => testo.includes(t));
  });
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => apri(true)}>
        <BookOpen className="mr-1 h-4 w-4" aria-hidden="true" /> Schede standard
      </Button>
      <Dialog open={aperto} onOpenChange={v => {
        apri(v);
        if (!v) scegliFase("");
      }}>
        <DialogContent className="flex max-h-[85vh] min-h-0 max-w-3xl flex-col gap-3">
          <DialogHeader>
            <DialogTitle>Schede standard POS</DialogTitle>
            <DialogDescription>Scegli una lavorazione per ritrovare una sequenza di lavoro e i punti da verificare. Potrai modificare la scheda nel POS.</DialogDescription>
          </DialogHeader>
          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={e => cerca(e.target.value)} className="pl-9" aria-label="Cerca una scheda standard" placeholder="Cerca serramenti, cartongesso, ponteggi…" />
          </div>
          {aperto && companyId && orderId && <AssociaFaseScheda companyId={companyId} orderId={orderId} fase={fase} scegliFase={scegliFase} />}
          <ul className="grid min-h-0 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {trovate.map(s => (
              <li key={s.id} className="flex flex-col gap-2 rounded-lg border p-3">
                <span className="text-xs font-medium text-muted-foreground">{s.area}</span>
                <h3 className="text-sm font-semibold">{s.titolo}</h3>
                <p className="text-xs text-muted-foreground">{s.descrizione}</p>
                <Button size="sm" variant="secondary" className="mt-auto self-start" aria-label={`Aggiungi scheda ${s.titolo}`} onClick={() => {
                  const lavorazione = nuovaDaSchedaStandard(s, crypto.randomUUID());
                  if (fase) lavorazione.fase_id = fase;
                  onAggiungi(lavorazione);
                  scegliFase("");
                  cerca("");
                  apri(false);
                }}><Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Aggiungi scheda</Button>
              </li>
            ))}
            {!trovate.length && <li className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground sm:col-span-2">Nessuna scheda trovata.</li>}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AssociaFaseScheda({ companyId, orderId, fase, scegliFase }: {
  companyId: string; orderId: string; fase: string; scegliFase: (id: string) => void;
}) {
  const fasi = useFasiFascicolo(companyId, orderId).data ?? [];
  return !!fasi.length && <label className="block shrink-0 space-y-1 text-sm">
    <span>Associa a una fase della commessa</span>
    <select className="block min-h-9 w-full rounded-md border bg-background px-2" value={fasi.some(f => f.id === fase) ? fase : ""}
      onChange={e => scegliFase(e.target.value)}>
      <option value="">Senza fase</option>
      {fasi.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
    </select>
  </label>;
}

export function TestiStandardLavorazionePos({ lavorazione, onInserisci }: {
  lavorazione: Lavorazione;
  onInserisci: (proposta: Lavorazione) => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [scelta, setScelta] = useState("");
  if (CAMPI_TESTO_LAVORAZIONE.every(c => lavorazione[c.id].trim())) return null;
  const modello = SCHEDE_STANDARD_POS.find(s => s.id === scelta);
  const proposta = aperto && modello ? nuovaDaSchedaStandard(modello, lavorazione.id) : null;
  const testi = proposta ? testiMancantiDaProposta(lavorazione, proposta) : [];
  return (
    <Dialog open={aperto} onOpenChange={valore => {
      if (valore) {
        setScelta(modelloSuggeritoPos(lavorazione.titolo, lavorazione.fonti_scheda?.standard?.id)?.id ?? "");
      }
      setAperto(valore);
    }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm"><BookOpen className="size-4" aria-hidden="true" /> Testi pronti</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Testi pronti per la lavorazione</DialogTitle>
          <DialogDescription>{lavorazione.titolo.trim() || "Lavorazione senza titolo"}. Scegli un modello per precompilare i campi di testo vuoti.</DialogDescription>
        </DialogHeader>
        <label className="block space-y-1 text-sm font-medium">
          <span>Modello di testo</span>
          <select className="block min-h-9 w-full rounded-md border bg-background px-2 font-normal"
            value={modello?.id ?? ""} onChange={e => setScelta(e.target.value)}>
            <option value="">Scegli una scheda standard</option>
            {SCHEDE_STANDARD_POS.map(s => <option key={s.id} value={s.id}>{s.titolo}</option>)}
          </select>
        </label>
        {testi.map(({ id, titolo, testo }) => <div key={id} className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
          <p className="font-medium">{titolo}</p>
          <p className="whitespace-pre-wrap break-words text-muted-foreground">{testo}</p>
        </div>)}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => setAperto(false)}>Annulla</Button>
          <Button type="button" disabled={!proposta || !testi.length} onClick={() => {
            if (!proposta || !testi.length) return;
            onInserisci(proposta);
            setAperto(false);
          }}>Inserisci testi mancanti</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RiferimentiSchedaPos({ fonti, superato = false, usaPrescrizione, rimuoviPsc, confermaOcr, apriOriginale }: {
  fonti: FontiSchedaPos; superato?: boolean;
  usaPrescrizione?: (estratto: FontePscSchedaPos["estratti"][number]) => void;
  rimuoviPsc?: () => void;
  confermaOcr?: (indice: number, confermato: boolean) => void;
  apriOriginale?: (pagina?: number) => void;
}) {
  const standard = SCHEDE_STANDARD_POS.find(s => s.id === fonti.standard?.id);
  const fontiStandard = standard ? [FONTI_SCHEDE_POS.modello, FONTI_SCHEDE_POS[standard.fonte]] : [];
  const formatta = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 4 });
  if (!standard && !fonti.computo && !fonti.psc) return null;
  return (
    <details className="rounded-md border bg-background p-2.5 text-xs" open={superato || undefined}>
      <summary className="cursor-pointer font-semibold">Fonti della scheda</summary>
      {standard && <div className="mt-2 space-y-1">
        <p>Standard · {standard.titolo} · v{fonti.standard?.versione}</p>
        <ul className="space-y-1">{fontiStandard.map(f => (
          <li key={f.url}><a className="text-primary underline underline-offset-2" href={f.url} target="_blank" rel="noreferrer">{f.titolo}</a></li>
        ))}</ul>
      </div>}
      {fonti.computo && <div className="mt-2 space-y-1">
        <p className="font-medium">Computo · {fonti.computo.titolo}</p>
        <ul className="space-y-1">
          {fonti.computo.voci.map(v => <li key={v.id} className="break-words">
            {v.codice && <strong className="mr-1">{v.codice}</strong>}{v.titolo}
            {v.quantita != null && <> · {formatta.format(v.quantita)} {v.unita}</>}
            {v.capitolo && <span className="text-muted-foreground"> · {v.capitolo}</span>}
          </li>)}
        </ul>
      </div>}
      {fonti.psc && <div className="mt-2 space-y-1">
        <p className="font-medium">PSC · revisione {fonti.psc.revisione}</p>
        {superato && <p className="text-amber-800">Gli estratti si riferiscono a un PSC diverso. Riesamina questa scheda con il documento corrente.</p>}
        {apriOriginale && !superato && <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => apriOriginale()}>Apri PSC originale</Button>}
        <ul className="space-y-1.5">
          {fonti.psc.estratti.map((v, i) => <li key={`${v.pagina}-${i}`} className="border-l-2 border-muted pl-2">
            <p>{apriOriginale && !superato ? <Button type="button" variant="link" className="h-auto p-0 text-xs font-semibold"
              onClick={() => apriOriginale(v.pagina)}>Pagina {v.pagina}</Button> : <strong>Pagina {v.pagina}</strong>} · {v.testo}</p>
            {v.metodo === "ocr" && <div className="my-1.5 space-y-1">
              <p className={v.confermato ? "text-muted-foreground" : "text-amber-800"}>
                {v.confermato ? "OCR · confrontato con l’originale" : "OCR · da confrontare con l’originale"}
              </p>
              {confermaOcr && !superato && <label className="flex items-center gap-2">
                <Checkbox checked={v.confermato === true} onCheckedChange={valore => confermaOcr(i, valore === true)} />
                Ho confrontato il testo con questa pagina dell’originale
              </label>}
            </div>}
            {usaPrescrizione && !superato && (v.metodo !== "ocr" || v.confermato) && <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => usaPrescrizione(v)}>Porta in Procedure PSC</Button>}
          </li>)}
        </ul>
        {superato && rimuoviPsc && <Button type="button" size="sm" variant="outline" className="h-auto py-1 text-xs" onClick={rimuoviPsc}>Rimuovi gli estratti superati</Button>}
      </div>}
    </details>
  );
}

type RisposteScheda = NonNullable<FontiSchedaPos["quesiti"]>;

export function QuesitiSchedaPos({ quesiti, readonly, rispondi, proposta, prefissoCampo }: {
  quesiti: RisposteScheda; readonly: boolean; rispondi: (n: number, risposta: string) => void;
  prefissoCampo?: string;
  proposta?: { companyId: string; posId: string; aggiungiAllaModalita: (testo: string) => void };
}) {
  return (
    <fieldset className="space-y-2 rounded-md border p-2.5">
      <legend className="px-1 text-xs font-semibold">Dettagli da confermare sul cantiere</legend>
      {quesiti.map((q, n) => <label key={n} className="block space-y-1 text-xs">
        <span>{q.domanda}</span>
        <Textarea id={prefissoCampo ? `${prefissoCampo}-${n}` : undefined} rows={2} maxLength={1500} placeholder="Indica il dato verificato o perché il punto non si applica" value={q.risposta}
          readOnly={readonly} onChange={e => rispondi(n, e.target.value)} />
      </label>)}
      {!readonly && proposta && <TestoDalleRisposte {...proposta} risposte={quesiti.filter(q => !daCompletare(q.risposta))} />}
    </fieldset>
  );
}

function TestoDalleRisposte({ companyId, posId, risposte, aggiungiAllaModalita }: {
  companyId: string; posId: string; risposte: RisposteScheda; aggiungiAllaModalita: (testo: string) => void;
}) {
  const [aperto, apri] = useState(false);
  const [testo, scrivi] = useState("");
  const [attesa, setAttesa] = useState(false);
  const [errore, setErrore] = useState("");
  const [fonteUsata, setFonteUsata] = useState("");
  const richiestaInCorso = useRef(false);
  const fonte = JSON.stringify(risposte);

  async function genera() {
    if (richiestaInCorso.current || !risposte.length) return;
    richiestaInCorso.current = true;
    setAttesa(true);
    setErrore("");
    try {
      const r = await chiamaServerPos<{ testo: string }>({ azione: "testo_lavorazione_ai", company_id: companyId, pos_id: posId, risposte });
      scrivi(r.testo);
      setFonteUsata(fonte);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Proposta non disponibile. Riprova.");
    } finally {
      richiestaInCorso.current = false;
      setAttesa(false);
    }
  }

  return <>
    <Button type="button" size="sm" variant="outline" disabled={!risposte.length} onClick={() => {
      scrivi(""); setErrore(""); apri(true);
    }}><Sparkles className="size-4" aria-hidden="true" /> Prepara testo dalle risposte</Button>
    <Dialog open={aperto} onOpenChange={v => { if (!attesa) apri(v); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Testo per la fase di lavoro</DialogTitle>
          <DialogDescription>L’AI riformula le risposte che hai compilato. Rileggi il testo prima di aggiungerlo alla modalità di lavoro.</DialogDescription>
        </DialogHeader>
        <dl className="max-h-36 space-y-2 overflow-auto text-xs">
          {risposte.map((q, i) => <div key={i}><dt className="font-medium">{q.domanda}</dt><dd className="break-words">{q.risposta}</dd></div>)}
        </dl>
        <Button type="button" size="sm" variant="outline" disabled={attesa || !risposte.length} onClick={() => void genera()}>
          {attesa && <Loader2 className="mr-1 size-4 animate-spin" aria-hidden="true" />}
          {attesa ? "Preparo il testo…" : testo ? "Rigenera proposta" : "Genera proposta"}
        </Button>
        {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
        {!!testo && <Textarea aria-label="Testo proposto per la fase di lavoro" rows={6} maxLength={3000}
          value={testo} onChange={e => scrivi(e.target.value)} readOnly={attesa} />}
        {!!testo && fonteUsata !== fonte && <p role="status" className="text-xs text-muted-foreground">Le risposte sono cambiate. Rigenera la proposta.</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => apri(false)} disabled={attesa}>Annulla</Button>
          <Button type="button" disabled={attesa || !testo.trim() || fonteUsata !== fonte} onClick={() => {
            aggiungiAllaModalita(testo.trim()); apri(false);
          }}>Aggiungi alla modalità di lavoro</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
