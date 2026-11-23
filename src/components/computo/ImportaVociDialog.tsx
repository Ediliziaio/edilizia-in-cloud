import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, FileUp, Files, Loader2, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { formatEuro } from "@/lib/computo/computoStrutturato";
import { calcolaVoce, type VoceEditor } from "@/lib/computo/editorNativo";
import type { EsitoImportComputo } from "@/lib/computo/importaComputo";
import {
  ACCEPT_IMPORTA_VOCI, ETICHETTA_FASE, FASI, correggi, eNonLavoro, instrada, totaleVoci, type VoceImportata,
} from "@/lib/computo/importaVoci";
import { leggiVociDaFile, type Avanzamento, type EsitoFile } from "@/lib/computo/leggiVoci";
import type { StatoServer } from "@/lib/computo/estrazioneServer";
import { DocumentiDelGestionale } from "./DocumentiDelGestionale";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

/**
 * Il popup di «Importa voci», uguale nel computo e nei preventivatori.
 *
 * 1. Si trascinano (o si scelgono) uno o più file: PriMus, PDF, Excel, CSV,
 *    Word, foto.
 * 2. Ogni file passa dalle sue fasi, vere: aperto, righe lette, voci
 *    riconosciute.
 * 3. Le voci lette si rivedono: si correggono, si tolgono, quelle incerte sono
 *    in evidenza. Solo «Aggiungi N voci» le porta nel documento; le righe che
 *    ci sono già non si toccano.
 */

interface Lavoro {
  chiave: string;
  file: File;
  formato: string;
  stato: "attesa" | "lettura" | "fatto" | "errore";
  avanzamento: Avanzamento;
  errore?: string;
  letto?: EsitoFile;
}

export interface ImportaVociDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Le voci rivedute; `esito` c'è solo se è stato letto un file, per riempire l'intestazione vuota. */
  onAggiungi: (voci: VoceImportata[], esito: EsitoImportComputo | null, letti: FileLetto[], fonte?: FonteVoci) => void;
  /** Le voci già nel documento: restano intatte, lo si dice. */
  vociPresenti: number;
  /** Scansioni, foto e PDF qualsiasi si leggono sul server con l'AI: dove non è attiva si rifiutano con un motivo. */
  consentiAi: boolean;
  /** Tetto delle voci del documento (l'editor del computo ne regge 5000). */
  massimoVoci?: number;
  /** La stessa finestra per altri usi (14/11/2026: «Importa le fasi» della commessa). */
  titolo?: string;
  descrizione?: string;
  /** Il testo del pulsante di conferma, col numero delle voci: «Importa 12 voci nelle fasi». */
  etichettaConferma?: (n: number) => string;
  /** Al posto di «Le voci si aggiungono al documento.»: dove finiscono le voci in quest'uso. */
  notaDestinazione?: string;
  /** Nella bozza del computo, apre la scelta di un altro computo della stessa azienda. */
  daComputi?: { companyId: string; draftId: string; userId: string };
  /**
   * Sotto il riquadro dei file, al primo passo: altre fonti (computo o preventivo del gestionale).
   * Come funzione riceve `carica`: le voci di quella fonte passano dalla stessa schermata di scelta.
   */
  altreFonti?: React.ReactNode | ((carica: (voci: VoceImportata[], fonte: FonteVoci) => void) => React.ReactNode);
}

/** I file letti, per chi deve conservarli (14/11/2026: il computo della commessa da «Genera dal computo»). */
export interface FileLetto { file: File; formato: string; via: "browser" | "server" }

/** Una fonte che non è un file (14/11/2026: un computo o un preventivo del gestionale). */
export interface FonteVoci { nome: string; tipo: string }

const FORMATI = ["PriMus (XPWE)", "PDF", "Excel", "CSV", "Word", "Foto"];
const RIGHE_VISIBILI = 300;

function percentuale(l: Lavoro): number {
  if (l.stato === "fatto") return 100;
  const i = FASI.indexOf(l.avanzamento.fase);
  return Math.round(((i + (l.avanzamento.parte ?? 0.35)) / (FASI.length - 1)) * 100 * 0.97);
}

function Fasi({ lavoro }: { lavoro: Lavoro }) {
  const t = useT();
  const attuale = lavoro.stato === "fatto" ? FASI.length - 1 : FASI.indexOf(lavoro.avanzamento.fase);
  return <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs" aria-label={t("Fasi della lettura")}>
    {FASI.map((f, i) => {
      const fatta = i < attuale || lavoro.stato === "fatto";
      const ora = i === attuale && lavoro.stato === "lettura";
      const testo = f === "pronte" && lavoro.letto ? `Pronte ${lavoro.letto.voci.length} voci` : ETICHETTA_FASE[f];
      return <li key={f} className="flex items-center gap-1.5" aria-current={ora ? "step" : undefined}>
        {i > 0 && <span aria-hidden className={`h-px w-3 ${fatta || ora ? "bg-primary" : "bg-border"}`} />}
        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors ${fatta ? "bg-primary/10 text-primary" : ora ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
          {fatta ? <Check className="h-3 w-3" aria-hidden /> : ora ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden /> : null}
          {testo}
        </span>
      </li>;
    })}
  </ol>;
}

const RIGHE_FOGLIO = [92, 70, 84, 58, 88, 66, 78];

/**
 * Il foglio che si legge (14/11/2026, richiesta del titolare: «una bella animazione che
 * legge il file»): le righe si accendono una dopo l'altra con l'avanzamento vero, una
 * banda scorre mentre legge, alla fine compare la spunta. Uguale per tutti i formati.
 */
function FoglioInLettura({ lavoro, percento }: { lavoro: Lavoro; percento: number }) {
  const accese = Math.round((percento / 100) * RIGHE_FOGLIO.length);
  const sigla = lavoro.formato.startsWith("PriMus") ? "XPWE" : lavoro.formato.split(" ")[0].slice(0, 5).toUpperCase();
  return <div aria-hidden data-stato={lavoro.stato}
    className={`importa-voci-foglio relative h-16 w-12 shrink-0 overflow-hidden rounded-md border bg-background shadow-sm ${lavoro.stato === "lettura" ? "importa-voci-foglio-vivo" : ""}`}>
    <span className="absolute right-0 top-0 h-3 w-3 rounded-bl-md border-b border-l bg-muted" />
    <div className="space-y-[3px] px-1.5 pt-3">
      {RIGHE_FOGLIO.map((w, i) => <span key={i} style={{ width: `${w}%`, transitionDelay: `${i * 40}ms` }}
        className={`block h-[3px] rounded-full transition-colors duration-300 motion-reduce:transition-none ${i < accese ? (lavoro.stato === "errore" ? "bg-amber-400" : "bg-primary") : "bg-muted"}`} />)}
    </div>
    <span className="absolute bottom-0.5 left-1 rounded bg-primary/10 px-1 text-[8px] font-semibold leading-tight text-primary">{sigla}</span>
    {lavoro.stato === "lettura" && <span className="importa-voci-scan" />}
    {lavoro.stato === "fatto" && <span className="importa-voci-fatto absolute inset-0 flex items-center justify-center bg-emerald-500/10">
      <CheckCircle2 className="h-6 w-6 rounded-full bg-background text-emerald-600" />
    </span>}
  </div>;
}

function SchedaFile({ lavoro }: { lavoro: Lavoro }) {
  const t = useT();
  const p = percentuale(lavoro);
  return <li className="space-y-2 rounded-lg border bg-card p-3">
    <div className="flex items-center gap-3">
      <FoglioInLettura lavoro={lavoro} percento={lavoro.stato === "errore" ? 30 : p} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{lavoro.file.name}</p>
        <p className="text-xs text-muted-foreground">
          {lavoro.formato}
          {lavoro.letto?.via === "server" && ` ${t("· letto con l'AI")}`}
          {lavoro.stato === "lettura" && lavoro.avanzamento.dettaglio && ` · ${lavoro.avanzamento.dettaglio}`}
          {lavoro.stato === "attesa" && ` ${t("· in coda")}`}
        </p>
      </div>
      {lavoro.stato === "fatto" && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label={t("Letto")} />}
      {lavoro.stato === "errore" && <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-label={t("Non letto")} />}
    </div>
    {lavoro.stato === "errore"
      ? <p role="alert" className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">{lavoro.errore}</p>
      : <>
        <Fasi lavoro={lavoro} />
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={t("Lettura di {name}", { name: String(lavoro.file.name ?? "") })}>
          <div className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${p}%` }} />
        </div>
      </>}
  </li>;
}

/** Un campo della tabella: si scrive liberamente, la voce si aggiorna a ogni tasto. */
function Campo({ etichetta, valore, onCambia, etichettaMobile = etichetta, numero = false, disabilitato }: {
  etichetta: string; valore: string; onCambia: (v: string) => void; etichettaMobile?: string; numero?: boolean; disabilitato?: boolean;
}) {
  return <>
    <span className="mb-1 block text-[11px] text-muted-foreground sm:hidden" aria-hidden>{etichettaMobile}</span>
    <input aria-label={etichetta} value={valore} disabled={disabilitato} inputMode={numero ? "decimal" : undefined}
      onChange={e => onCambia(e.target.value)}
      className={`h-8 w-full rounded-md border border-input bg-background px-1.5 text-xs disabled:bg-muted disabled:text-muted-foreground sm:px-2 ${numero ? "text-right tabular-nums" : ""}`} />
  </>;
}

export function ImportaVociDialog({ open, onOpenChange, onAggiungi, vociPresenti, consentiAi, massimoVoci = 5000, titolo, descrizione, etichettaConferma, notaDestinazione, altreFonti, daComputi }: ImportaVociDialogProps) {
  const tTesto = useT();
  const { effectiveCompany, user } = useAuth();
  const [lavori, setLavori] = useState<Lavoro[]>([]);
  const [voci, setVoci] = useState<VoceImportata[]>([]);
  const [passo, setPasso] = useState<"scegli" | "lettura" | "anteprima">("scegli");
  const [sorgente, setSorgente] = useState<"file" | "computo">("file");
  const [soloIncerte, setSoloIncerte] = useState(false);
  const [tutte, setTutte] = useState(false);
  /** Le voci tolte dalla selezione: restano in elenco, non si importano. */
  const [escluse, setEscluse] = useState<Set<string>>(new Set());
  const [fonte, setFonte] = useState<FonteVoci | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const corsa = useRef<AbortController | null>(null);

  const azzera = () => {
    corsa.current?.abort();
    corsa.current = null;
    setLavori([]); setVoci([]); setPasso("scegli"); setSorgente("file"); setSoloIncerte(false); setTutte(false); setEscluse(new Set()); setFonte(null);
  };
  const chiudi = () => { azzera(); onOpenChange(false); };
  useEffect(() => () => corsa.current?.abort(), []);

  const aggiorna = (chiave: string, patch: Partial<Lavoro>) =>
    setLavori(ls => ls.map(l => l.chiave === chiave ? { ...l, ...patch } : l));

  const leggi = async (files: File[]) => {
    if (!files.length) return;
    const nuovi: Lavoro[] = files.map((file, i) => ({
      chiave: `${Date.now()}-${i}-${file.name}`, file, formato: instrada(file).formato, stato: "attesa", avanzamento: { fase: "apro" },
    }));
    setLavori(nuovi); setPasso("lettura");
    const controllo = new AbortController();
    corsa.current = controllo;
    const companyId = effectiveCompany?.id;
    const userId = user?.id;
    const server = consentiAi && companyId && userId
      ? async (file: File, onStato: (s: StatoServer) => void) => {
        const { estraiSulServer } = await import("@/lib/computo/estrazioneServer");
        return estraiSulServer(file, { companyId, userId, onStato, segnale: controllo.signal });
      }
      : undefined;

    const lette: VoceImportata[] = [];
    for (const l of nuovi) {
      if (controllo.signal.aborted) return;
      aggiorna(l.chiave, { stato: "lettura" });
      try {
        const letto = await leggiVociDaFile(l.file, {
          server,
          onAvanzamento: a => { if (!controllo.signal.aborted) aggiorna(l.chiave, { avanzamento: a }); },
        });
        if (controllo.signal.aborted) return;
        lette.push(...letto.voci);
        aggiorna(l.chiave, { stato: "fatto", letto, avanzamento: { fase: "pronte" } });
      } catch (e) {
        if (controllo.signal.aborted) return;
        aggiorna(l.chiave, { stato: "errore", errore: e instanceof Error ? e.message : "Il file non si è potuto leggere." });
      }
    }
    if (controllo.signal.aborted) return;
    setVoci(lette);
    setEscluse(new Set(lette.filter(eNonLavoro).map(v => v.id)));
    if (lette.length) {
      // Un attimo per vedere «Pronte N voci» prima dell'elenco.
      await new Promise(r => setTimeout(r, 600));
      if (!controllo.signal.aborted) setPasso("anteprima");
    }
  };

  const incerte = useMemo(() => voci.filter(v => v.avvisi.length).length, [voci]);
  const visibili = useMemo(() => (soloIncerte ? voci.filter(v => v.avvisi.length) : voci), [voci, soloIncerte]);
  const mostrate = tutte ? visibili : visibili.slice(0, RIGHE_VISIBILI);
  const selezionate = useMemo(() => voci.filter(v => !escluse.has(v.id)), [voci, escluse]);
  const nonLavori = useMemo(() => voci.filter(eNonLavoro).length, [voci]);
  const copiaDaComputo = !!daComputi && fonte?.tipo === "computo";
  const totale = totaleVoci(copiaDaComputo ? selezionate.filter(v => !v.opzionale) : selezionate);
  /** I capitoli nell'ordine del file, con le voci mostrate di ciascuno. */
  const gruppi = useMemo(() => {
    const m = new Map<string, VoceImportata[]>();
    for (const v of mostrate) {
      const c = v.capitolo.trim() || "Senza capitolo";
      const vociCapitolo = m.get(c);
      if (vociCapitolo) vociCapitolo.push(v);
      else m.set(c, [v]);
    }
    return [...m.entries()];
  }, [mostrate]);
  const capitoliTutti = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const v of voci) {
      const c = v.capitolo.trim() || "Senza capitolo";
      const ids = m.get(c);
      if (ids) ids.push(v.id);
      else m.set(c, [v.id]);
    }
    return m;
  }, [voci]);
  const selezionatePerId = useMemo(() => new Map(selezionate.map(v => [v.id, v])), [selezionate]);
  const seleziona = (ids: string[], si: boolean) => setEscluse(e => {
    const n = new Set(e);
    for (const id of ids) { if (si) n.delete(id); else n.add(id); }
    return n;
  });
  const lavoriLetti = lavori.filter(l => l.letto);
  const errori = lavori.filter(l => l.stato === "errore");
  const troppe = vociPresenti + selezionate.length > massimoVoci;
  const piuFile = lavoriLetti.length > 1;

  const modifica = (id: string, patch: Partial<VoceEditor>) => setVoci(vs => vs.map(v => v.id === id ? correggi(v, patch) : v));
  const togli = (id: string) => { setVoci(vs => vs.filter(v => v.id !== id)); seleziona([id], true); };

  const conferma = () => {
    if (!selezionate.length || troppe) return;
    const unico = lavoriLetti.length === 1 ? lavoriLetti[0].letto!.esito : null;
    onAggiungi(selezionate, unico, lavoriLetti.map(l => ({ file: l.file, formato: l.formato, via: l.letto!.via })), fonte ?? undefined);
    chiudi();
  };

  const caricaDaFonte = (lette: VoceImportata[], f: FonteVoci) => {
    setLavori([]); setVoci(lette); setEscluse(new Set((daComputi && f.tipo === "computo" ? lette : lette.filter(eNonLavoro)).map(v => v.id)));
    setSoloIncerte(false); setTutte(false); setFonte(f); setPasso("anteprima");
  };

  const inLettura = lavori.some(l => l.stato === "lettura" || l.stato === "attesa");
  const daArchivio = !!daComputi && sorgente === "computo";

  return <Dialog open={open} onOpenChange={o => { if (!o) chiudi(); }}>
    <DialogContent className={passo === "anteprima" ? "flex max-h-[92dvh] max-w-6xl flex-col" : "max-h-[92dvh] max-w-xl overflow-y-auto"}>
      <style>{`
        .importa-voci-scan{position:absolute;left:0;right:0;height:30%;background:linear-gradient(180deg,transparent,hsl(var(--primary)/.35),transparent);animation:importa-voci-scan 1.4s ease-in-out infinite}
        @keyframes importa-voci-scan{0%{top:-30%}100%{top:100%}}
        @media(max-width:639px){
          .importa-voci-tabella,.importa-voci-tabella tbody{display:block}
          .importa-voci-capitolo{display:flex;align-items:center}
          .importa-voci-riga{
            display:grid;gap:4px 6px;padding:8px;
            grid-template-columns:min-content minmax(0,1.2fr) minmax(0,.9fr) minmax(0,1fr) minmax(0,1.1fr) min-content;
            grid-template-areas:'selezione descrizione descrizione descrizione descrizione rimuovi' '. codice unita quantita prezzo .' '. importo importo importo importo .';
          }
          .importa-voci-riga td{min-width:0;padding:0}
          .importa-voci-riga [data-campo=selezione]{grid-area:selezione;padding-top:5px}
          .importa-voci-riga [data-campo=codice]{grid-area:codice}
          .importa-voci-riga [data-campo=descrizione]{grid-area:descrizione}
          .importa-voci-riga [data-campo=unita]{grid-area:unita}
          .importa-voci-riga [data-campo=quantita]{grid-area:quantita}
          .importa-voci-riga [data-campo=prezzo]{grid-area:prezzo}
          .importa-voci-riga [data-campo=importo]{grid-area:importo}
          .importa-voci-riga [data-campo=rimuovi]{grid-area:rimuovi}
        }
        .importa-voci-foglio-vivo{animation:importa-voci-respiro 1.8s ease-in-out infinite}
        @keyframes importa-voci-respiro{0%,100%{transform:translateY(0);box-shadow:0 1px 2px hsl(var(--primary)/.1)}50%{transform:translateY(-2px);box-shadow:0 6px 14px hsl(var(--primary)/.18)}}
        .importa-voci-fatto{animation:importa-voci-pop .35s ease-out both}
        @keyframes importa-voci-pop{0%{opacity:0;transform:scale(.6)}100%{opacity:1;transform:scale(1)}}
        @media (prefers-reduced-motion: reduce){.importa-voci-scan{animation:none;top:0;height:100%;background:hsl(var(--primary)/.12)}.importa-voci-foglio-vivo,.importa-voci-fatto{animation:none}}
      `}</style>
      <DialogHeader>
        <DialogTitle>{titolo ?? tTesto("Importa voci")}</DialogTitle>
        <DialogDescription>
          {passo === "scegli" && (daArchivio ? tTesto("Scegli un computo e poi seleziona i capitoli o le singole lavorazioni da copiare.") : descrizione ?? tTesto("Apri un file e rivedi le lavorazioni prima di aggiungerle."))}
          {passo === "lettura" && (inLettura ? tTesto("Sto leggendo i file. Puoi chiudere quando vuoi: niente cambia finché non confermi.") : tTesto("Lettura finita."))}
          {passo === "anteprima" && (copiaDaComputo ? tTesto("Seleziona le lavorazioni da copiare. Controlla quantità, misure e prezzi per il nuovo lavoro.") : `${voci.length} ${voci.length === 1 ? "voce trovata" : "voci trovate"}${incerte ? `, ${incerte} da controllare` : ""}. Scegli quali importare, correggi quello che non va: niente cambia finché non confermi.`)}
        </DialogDescription>
      </DialogHeader>

      <input ref={input} type="file" multiple hidden accept={ACCEPT_IMPORTA_VOCI} aria-label={tTesto("File da cui importare le voci")}
        data-rilascio={passo === "scegli" && !daArchivio ? "senza-filtro" : "no"}
        onChange={e => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; void leggi(fs); }} />

      {passo === "scegli" && daComputi && <div role="group" aria-label={tTesto("Origine delle lavorazioni")} className="flex flex-wrap gap-1 rounded-lg border bg-slate-50 p-1">
        <Button type="button" size="sm" variant={!daArchivio ? "secondary" : "ghost"} aria-pressed={!daArchivio} onClick={() => setSorgente("file")}><FileUp className="mr-1.5 h-4 w-4" />{tTesto("Da file")}</Button>
        <Button type="button" size="sm" variant={daArchivio ? "secondary" : "ghost"} aria-pressed={daArchivio} onClick={() => setSorgente("computo")}><Files className="mr-1.5 h-4 w-4" />{tTesto("Da un computo salvato")}</Button>
      </div>}

      {passo === "scegli" && !daArchivio && <div data-zona-rilascio
        className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-10 text-center">
        <Upload className="h-8 w-8 text-primary" aria-hidden />
        <div>
          <p className="text-sm font-medium">{tTesto("Trascina qui i file")}</p>
          <p className="text-xs text-muted-foreground">{tTesto("anche più di uno insieme")}</p>
        </div>
        <Button type="button" onClick={() => input.current?.click()}><FileUp className="mr-1 h-4 w-4" />{tTesto("Scegli file")}</Button>
        <ul className="flex flex-wrap justify-center gap-1.5" aria-label={tTesto("Formati letti")}>
          {FORMATI.map(f => <li key={f} className="rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">{tTesto(f)}</li>)}
        </ul>
        <p className="max-w-sm text-[11px] text-muted-foreground">
          {tTesto("PriMus, Excel, CSV e Word con una tabella si leggono così come sono scritti.")}
          {consentiAi ? ` ${tTesto("Scansioni, foto e altri PDF li legge l'AI: controlla le voci segnalate.")}` : ` ${tTesto("Scansioni e foto richiedono l'AI, che qui non è attiva.")}`}
        </p>
      </div>}
      {passo === "scegli" && daArchivio && daComputi && <DocumentiDelGestionale companyId={daComputi.companyId} soloComputi={daComputi} mostraImporti onScelto={caricaDaFonte} />}
      {passo === "scegli" && !daArchivio && (typeof altreFonti === "function" ? altreFonti(caricaDaFonte) : altreFonti)}

      {passo === "lettura" && <div className="space-y-3">
        <ul className="space-y-2">{lavori.map(l => <SchedaFile key={l.chiave} lavoro={l} />)}</ul>
        {!inLettura && !voci.length && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <span>{errori.length ? tTesto("Nessuna voce letta.") : tTesto("Nei file non ho trovato voci.")} {tTesto("Il documento non è stato modificato.")}</span>
          <Button size="sm" variant="outline" onClick={() => { setLavori([]); setPasso("scegli"); }}>{tTesto("Prova un altro file")}</Button>
        </div>}
      </div>}

      {passo === "anteprima" && <>
        <div className="space-y-2 text-xs">
          {lavoriLetti.map(l => {
            const e = l.letto!.esito;
            const torna = e.totaleDocumento !== null && Math.abs(e.totaleDocumento - e.totaleRicalcolato) < 0.005;
            return <p key={l.chiave} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-medium">{l.file.name}</span>
              <span className="text-muted-foreground">{l.letto!.voci.length} {tTesto("voci ·")} {l.formato}{l.letto!.via === "server" ? ` ${tTesto("· letto con l'AI")}` : ""}</span>
              {torna && <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />{tTesto("totale uguale al documento")}</span>}
              {e.totaleDocumento !== null && !torna && <span className="text-amber-800">{tTesto("il documento dice {totaleDocumento} €, ricalcolato {totaleRicalcolato} €", { totaleDocumento: formatEuro(e.totaleDocumento), totaleRicalcolato: formatEuro(e.totaleRicalcolato) })}</span>}
              {e.descrizioniTroncate > 0 && <span className="text-amber-800">{tTesto("{descrizioniTroncate} descrizioni accorciate da PriMus nel PDF: il testo intero è nel file XPWE", { descrizioniTroncate: String(e.descrizioniTroncate ?? "") })}</span>}
            </p>;
          })}
          {fonte && <p className="flex flex-wrap items-center gap-x-2">
            <span className="font-medium">{fonte.nome}</span>
            <span className="text-muted-foreground">{tTesto("{n} voci · {tipo} del gestionale", { n: voci.length, tipo: String(fonte.tipo ?? "") })}</span>
            <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setVoci([]); setFonte(null); setPasso("scegli"); }}>{tTesto("Scegli un altro documento")}</Button>
          </p>}
          {errori.map(l => <p key={l.chiave} role="alert" className="text-amber-800"><strong>{l.file.name}</strong> {tTesto("non letto:")} {l.errore}</p>)}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
            <input type="checkbox" className="h-3.5 w-3.5 accent-[hsl(var(--primary))]" aria-label={tTesto("Seleziona tutte le voci")}
              checked={!!voci.length && selezionate.length === voci.length}
              ref={el => { if (el) el.indeterminate = selezionate.length > 0 && selezionate.length < voci.length; }}
              onChange={e => seleziona(voci.map(v => v.id), e.target.checked)} />
            <span className="tabular-nums" data-testid="contatore-selezione"><strong>{selezionate.length}</strong> {tTesto("selezionate su")} {voci.length}</span>
          </label>
          {!copiaDaComputo && nonLavori > 0 && <span className="text-xs text-muted-foreground">{tTesto("Spente {nonLavori} voci di oneri tecnici, IVA e visto: non sono lavori. Riaccendile se servono.", { nonLavori: String(nonLavori ?? "") })}</span>}
          {!!incerte && <Button size="sm" variant={soloIncerte ? "default" : "outline"} aria-pressed={soloIncerte} onClick={() => setSoloIncerte(s => !s)}>
            <AlertTriangle className="mr-1 h-3.5 w-3.5" />{tTesto("Da controllare (")}{incerte})
          </Button>}
          <span className="ml-auto text-xs text-muted-foreground">
            {vociPresenti ? tTesto("Le voci selezionate si aggiungono in fondo al documento.") : (notaDestinazione ?? tTesto("Le voci si aggiungono al documento."))}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border">
          <table role="table" aria-label={tTesto("Lavorazioni da importare")} className="importa-voci-tabella w-full text-xs sm:min-w-[760px]">
            <thead role="rowgroup" className="sticky top-0 z-10 bg-muted/90 text-left text-muted-foreground backdrop-blur max-sm:sr-only">
              <tr role="row">
                <th className="w-8 px-2 py-1.5"><span className="sr-only">{tTesto("Importa")}</span></th>
                <th className="w-24 px-2 py-1.5 font-medium">{tTesto("Codice")}</th>
                <th className="px-2 py-1.5 font-medium">{tTesto("Descrizione")}</th>
                <th className="w-16 px-2 py-1.5 font-medium">U.M.</th>
                <th className="w-24 px-2 py-1.5 text-right font-medium">{tTesto("Quantità")}</th>
                <th className="w-24 px-2 py-1.5 text-right font-medium">{tTesto("Prezzo")}</th>
                <th className="w-24 px-2 py-1.5 text-right font-medium">{tTesto("Importo")}</th>
                <th className="w-9 px-1 py-1.5"><span className="sr-only">{tTesto("Togli")}</span></th>
              </tr>
            </thead>
            {gruppi.map(([capitolo, gruppo]) => {
              const ids = capitoliTutti.get(capitolo) ?? gruppo.map(v => v.id);
              const scelte = ids.map(id => selezionatePerId.get(id)).filter((v): v is VoceImportata => v !== undefined);
              const totaleCapitolo = totaleVoci(copiaDaComputo ? scelte.filter(v => !v.opzionale) : scelte);
              return <tbody role="rowgroup" key={capitolo} data-capitolo={capitolo}>
              <tr role="row" className="importa-voci-capitolo border-t bg-muted/50">
                <td role="cell" className="px-2 py-1.5">
                  <input type="checkbox" className="h-3.5 w-3.5 accent-[hsl(var(--primary))] max-sm:h-5 max-sm:w-5" aria-label={tTesto("Seleziona il capitolo {capitolo}", { capitolo: String(capitolo ?? "") })}
                    checked={scelte.length === ids.length} ref={el => { if (el) el.indeterminate = scelte.length > 0 && scelte.length < ids.length; }}
                    onChange={e => seleziona(ids, e.target.checked)} />
                </td>
                <td role="cell" colSpan={5} className="px-2 py-1.5 text-xs font-semibold max-sm:min-w-0 max-sm:flex-1 max-sm:break-words max-sm:pl-0">{capitolo}
                  <span className="ml-2 font-normal text-muted-foreground tabular-nums">{tTesto("{n} su {n2}", { n: scelte.length, n2: ids.length })}</span></td>
                <td role="cell" className="px-2 py-1.5 text-right text-xs font-semibold tabular-nums max-sm:shrink-0">{formatEuro(totaleCapitolo)} €</td>
                <td role="cell" className="max-sm:hidden" />
              </tr>
              {gruppo.map(v => {
                const { importo } = calcolaVoce(v);
                const conMisure = v.misure.length > 0;
                const scelta = !escluse.has(v.id);
                return <tr role="row" key={v.id} className={`importa-voci-riga border-t align-top ${v.avvisi.length ? "bg-amber-50/70" : ""} ${scelta ? "" : "opacity-50"}`} data-incerta={v.avvisi.length ? "" : undefined} data-selezionata={scelta ? "" : undefined}>
                  <td role="cell" data-campo="selezione" className="px-2 py-2.5">
                    <input type="checkbox" className="h-3.5 w-3.5 accent-[hsl(var(--primary))] max-sm:h-5 max-sm:w-5" aria-label={`Importa ${v.descrizione.split("\n")[0].slice(0, 60) || "la voce"}`}
                      checked={scelta} onChange={e => seleziona([v.id], e.target.checked)} />
                  </td>
                  <td role="cell" data-campo="codice" className="px-2 py-1.5">
                    <Campo etichetta={tTesto("Codice")} valore={v.tariffa} onCambia={t => modifica(v.id, { tariffa: t })} />
                    {piuFile && <span className="mt-1 block truncate text-[10px] text-muted-foreground" title={v.origine}>{v.origine}</span>}
                  </td>
                  <td role="cell" data-campo="descrizione" className="px-2 py-1.5">
                    <textarea aria-label={tTesto("Descrizione")} rows={2} value={v.descrizione} onChange={e => modifica(v.id, { descrizione: e.target.value })}
                      className="w-full resize-y rounded-md border border-input bg-background px-2 py-1 text-xs max-sm:min-h-[3.5rem]" />
                    {!!v.avvisi.length && <p className="mt-0.5 flex items-start gap-1 text-[11px] text-amber-800">
                      <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />{v.avvisi.join(" · ")}
                    </p>}
                    {copiaDaComputo && v.opzionale && <span className="text-[11px] font-medium text-blue-700">{tTesto("Opzionale · fuori dal totale")}</span>}
                    <input aria-label={tTesto("Capitolo")} value={v.capitolo} placeholder={tTesto("Capitolo")} onChange={e => modifica(v.id, { capitolo: e.target.value })}
                      className="mt-1 h-6 w-full rounded border border-transparent bg-transparent px-1 text-[11px] text-muted-foreground hover:border-input focus:border-input focus:bg-background" />
                  </td>
                  <td role="cell" data-campo="unita" className="px-2 py-1.5"><Campo etichetta={tTesto("Unità di misura")} etichettaMobile="U.M." valore={v.unita} onCambia={t => modifica(v.id, { unita: t })} /></td>
                  <td role="cell" data-campo="quantita" className="px-2 py-1.5">
                    <Campo etichetta={tTesto("Quantità")} numero disabilitato={conMisure}
                      valore={conMisure ? (calcolaVoce(v).quantita ?? "").toLocaleString(intlCampo()) : v.quantita} onCambia={t => modifica(v.id, { quantita: t })} />
                    {conMisure && <span className="mt-0.5 block text-right text-[10px] text-muted-foreground">{tTesto("da")} {v.misure.length} {v.misure.length === 1 ? tTesto("misura") : tTesto("misure")}</span>}
                  </td>
                  <td role="cell" data-campo="prezzo" className="px-2 py-1.5"><Campo etichetta={tTesto("Prezzo")} numero valore={v.prezzo} onCambia={t => modifica(v.id, { prezzo: t })} /></td>
                  <td role="cell" data-campo="importo" className="px-2 py-1.5 pt-3 text-right tabular-nums"><span className="mr-1 text-muted-foreground sm:hidden" aria-hidden>{tTesto("Importo")}</span>{importo === null ? "—" : `${formatEuro(importo)} €`}</td>
                  <td role="cell" data-campo="rimuovi" className="px-1 py-1.5">
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Togli ${v.descrizione.split("\n")[0].slice(0, 60) || "la voce"}`} onClick={() => togli(v.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>;
              })}
              </tbody>;
            })}
          </table>
          {visibili.length > mostrate.length && <div className="border-t p-2 text-center">
            <Button size="sm" variant="ghost" onClick={() => setTutte(true)}>{tTesto("Mostra tutte le {n} voci", { n: visibili.length })}</Button>
          </div>}
          {!visibili.length && <p className="p-4 text-center text-sm text-muted-foreground">{soloIncerte ? tTesto("Nessuna voce da controllare.") : tTesto("Hai tolto tutte le voci.")}</p>}
        </div>
        {troppe && <p role="alert" className="text-xs text-amber-800">{tTesto("Con queste voci il documento ne avrebbe {vociPresenti}: il massimo è {massimoVoci}. Togline qualcuna.", { vociPresenti: vociPresenti + selezionate.length, massimoVoci: String(massimoVoci ?? "") })}</p>}
      </>}

      <DialogFooter className="flex-wrap items-center gap-2 max-sm:flex-col max-sm:items-stretch sm:justify-between">
        {passo === "anteprima"
          ? <span className="text-sm tabular-nums max-sm:w-full">{selezionate.length} {tTesto("di")} {voci.length} {tTesto("voci ·")} {copiaDaComputo ? tTesto("importo lavori") : tTesto("totale selezionate")} <strong>{formatEuro(totale)} €</strong></span>
          : <span />}
        <div className="flex gap-2 max-sm:w-full max-sm:justify-end">
          <Button variant="outline" onClick={chiudi}><X className="mr-1 h-4 w-4" />{passo === "anteprima" ? tTesto("Annulla") : tTesto("Chiudi")}</Button>
          {passo === "anteprima" && <Button onClick={conferma} disabled={!selezionate.length || troppe}>
            <Check className="mr-1 h-4 w-4" />{etichettaConferma ? etichettaConferma(selezionate.length) : `Aggiungi ${selezionate.length} ${selezionate.length === 1 ? "voce" : "voci"}`}
          </Button>}
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

export default ImportaVociDialog;
