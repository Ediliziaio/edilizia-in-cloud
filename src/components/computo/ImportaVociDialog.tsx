import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, FileUp, Loader2, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { formatEuro } from "@/lib/computo/computoStrutturato";
import { calcolaVoce, type VoceEditor } from "@/lib/computo/editorNativo";
import type { EsitoImportComputo } from "@/lib/computo/importaComputo";
import {
  ACCEPT_IMPORTA_VOCI, ETICHETTA_FASE, FASI, correggi, instrada, totaleVoci, type VoceImportata,
} from "@/lib/computo/importaVoci";
import { leggiVociDaFile, type Avanzamento, type EsitoFile } from "@/lib/computo/leggiVoci";
import type { StatoServer } from "@/lib/computo/estrazioneServer";

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
  const attuale = lavoro.stato === "fatto" ? FASI.length - 1 : FASI.indexOf(lavoro.avanzamento.fase);
  return <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs" aria-label="Fasi della lettura">
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
  const p = percentuale(lavoro);
  return <li className="space-y-2 rounded-lg border bg-card p-3">
    <div className="flex items-center gap-3">
      <FoglioInLettura lavoro={lavoro} percento={lavoro.stato === "errore" ? 30 : p} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{lavoro.file.name}</p>
        <p className="text-xs text-muted-foreground">
          {lavoro.formato}
          {lavoro.letto?.via === "server" && " · letto con l'AI"}
          {lavoro.stato === "lettura" && lavoro.avanzamento.dettaglio && ` · ${lavoro.avanzamento.dettaglio}`}
          {lavoro.stato === "attesa" && " · in coda"}
        </p>
      </div>
      {lavoro.stato === "fatto" && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Letto" />}
      {lavoro.stato === "errore" && <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-label="Non letto" />}
    </div>
    {lavoro.stato === "errore"
      ? <p role="alert" className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">{lavoro.errore}</p>
      : <>
        <Fasi lavoro={lavoro} />
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={`Lettura di ${lavoro.file.name}`}>
          <div className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${p}%` }} />
        </div>
      </>}
  </li>;
}

/** Un campo della tabella: si scrive liberamente, la voce si aggiorna a ogni tasto. */
function Campo({ etichetta, valore, onCambia, classe = "", numero = false, disabilitato }: {
  etichetta: string; valore: string; onCambia: (v: string) => void; classe?: string; numero?: boolean; disabilitato?: boolean;
}) {
  return <input aria-label={etichetta} value={valore} disabled={disabilitato} inputMode={numero ? "decimal" : undefined}
    onChange={e => onCambia(e.target.value)}
    className={`h-8 w-full rounded-md border border-input bg-background px-2 text-xs disabled:bg-muted disabled:text-muted-foreground ${numero ? "text-right tabular-nums" : ""} ${classe}`} />;
}

export function ImportaVociDialog({ open, onOpenChange, onAggiungi, vociPresenti, consentiAi, massimoVoci = 5000, titolo, descrizione, etichettaConferma, notaDestinazione, altreFonti }: ImportaVociDialogProps) {
  const { effectiveCompany, user } = useAuth();
  const [lavori, setLavori] = useState<Lavoro[]>([]);
  const [voci, setVoci] = useState<VoceImportata[]>([]);
  const [passo, setPasso] = useState<"scegli" | "lettura" | "anteprima">("scegli");
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
    setLavori([]); setVoci([]); setPasso("scegli"); setSoloIncerte(false); setTutte(false); setEscluse(new Set()); setFonte(null);
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
  const totale = useMemo(() => totaleVoci(selezionate), [selezionate]);
  /** I capitoli nell'ordine del file, con le voci mostrate di ciascuno. */
  const gruppi = useMemo(() => {
    const m = new Map<string, VoceImportata[]>();
    for (const v of mostrate) {
      const c = v.capitolo.trim() || "Senza capitolo";
      m.set(c, [...(m.get(c) ?? []), v]);
    }
    return [...m.entries()];
  }, [mostrate]);
  const capitoliTutti = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const v of voci) { const c = v.capitolo.trim() || "Senza capitolo"; m.set(c, [...(m.get(c) ?? []), v.id]); }
    return m;
  }, [voci]);
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
    setLavori([]); setVoci(lette); setEscluse(new Set()); setFonte(f); setPasso("anteprima");
  };

  const inLettura = lavori.some(l => l.stato === "lettura" || l.stato === "attesa");

  return <Dialog open={open} onOpenChange={o => { if (!o) chiudi(); }}>
    <DialogContent className={passo === "anteprima" ? "flex max-h-[92dvh] max-w-6xl flex-col" : "max-w-xl"}>
      <style>{`
        .importa-voci-scan{position:absolute;left:0;right:0;height:30%;background:linear-gradient(180deg,transparent,hsl(var(--primary)/.35),transparent);animation:importa-voci-scan 1.4s ease-in-out infinite}
        @keyframes importa-voci-scan{0%{top:-30%}100%{top:100%}}
        .importa-voci-foglio-vivo{animation:importa-voci-respiro 1.8s ease-in-out infinite}
        @keyframes importa-voci-respiro{0%,100%{transform:translateY(0);box-shadow:0 1px 2px hsl(var(--primary)/.1)}50%{transform:translateY(-2px);box-shadow:0 6px 14px hsl(var(--primary)/.18)}}
        .importa-voci-fatto{animation:importa-voci-pop .35s ease-out both}
        @keyframes importa-voci-pop{0%{opacity:0;transform:scale(.6)}100%{opacity:1;transform:scale(1)}}
        @media (prefers-reduced-motion: reduce){.importa-voci-scan{animation:none;top:0;height:100%;background:hsl(var(--primary)/.12)}.importa-voci-foglio-vivo,.importa-voci-fatto{animation:none}}
      `}</style>
      <DialogHeader>
        <DialogTitle>{titolo ?? "Importa voci"}</DialogTitle>
        <DialogDescription>
          {passo === "scegli" && (descrizione ?? "Un computo o un preventivo che hai già: le voci si leggono da sole e le rivedi prima di aggiungerle.")}
          {passo === "lettura" && (inLettura ? "Sto leggendo i file. Puoi chiudere quando vuoi: niente cambia finché non confermi." : "Lettura finita.")}
          {passo === "anteprima" && `${voci.length} ${voci.length === 1 ? "voce trovata" : "voci trovate"}${incerte ? `, ${incerte} da controllare` : ""}. Scegli quali importare, correggi quello che non va: niente cambia finché non confermi.`}
        </DialogDescription>
      </DialogHeader>

      <input ref={input} type="file" multiple hidden accept={ACCEPT_IMPORTA_VOCI} aria-label="File da cui importare le voci"
        data-rilascio={passo === "scegli" ? "senza-filtro" : "no"}
        onChange={e => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; void leggi(fs); }} />

      {passo === "scegli" && <div data-zona-rilascio
        className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-10 text-center">
        <Upload className="h-8 w-8 text-primary" aria-hidden />
        <div>
          <p className="text-sm font-medium">Trascina qui i file</p>
          <p className="text-xs text-muted-foreground">anche più di uno insieme</p>
        </div>
        <Button type="button" onClick={() => input.current?.click()}><FileUp className="mr-1 h-4 w-4" />Scegli file</Button>
        <ul className="flex flex-wrap justify-center gap-1.5" aria-label="Formati letti">
          {FORMATI.map(f => <li key={f} className="rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">{f}</li>)}
        </ul>
        <p className="max-w-sm text-[11px] text-muted-foreground">
          PriMus, Excel, CSV e Word con una tabella si leggono così come sono scritti.
          {consentiAi ? " Scansioni, foto e altri PDF li legge l'AI: controlla le voci segnalate." : " Scansioni e foto richiedono l'AI, che qui non è attiva."}
        </p>
      </div>}
      {passo === "scegli" && (typeof altreFonti === "function" ? altreFonti(caricaDaFonte) : altreFonti)}

      {passo === "lettura" && <div className="space-y-3">
        <ul className="space-y-2">{lavori.map(l => <SchedaFile key={l.chiave} lavoro={l} />)}</ul>
        {!inLettura && !voci.length && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <span>{errori.length ? "Nessuna voce letta." : "Nei file non ho trovato voci."} Il documento non è stato modificato.</span>
          <Button size="sm" variant="outline" onClick={() => { setLavori([]); setPasso("scegli"); }}>Prova un altro file</Button>
        </div>}
      </div>}

      {passo === "anteprima" && <>
        <div className="space-y-2 text-xs">
          {lavoriLetti.map(l => {
            const e = l.letto!.esito;
            const torna = e.totaleDocumento !== null && Math.abs(e.totaleDocumento - e.totaleRicalcolato) < 0.005;
            return <p key={l.chiave} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-medium">{l.file.name}</span>
              <span className="text-muted-foreground">{l.letto!.voci.length} voci · {l.formato}{l.letto!.via === "server" ? " · letto con l'AI" : ""}</span>
              {torna && <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />totale uguale al documento</span>}
              {e.totaleDocumento !== null && !torna && <span className="text-amber-800">il documento dice {formatEuro(e.totaleDocumento)} €, ricalcolato {formatEuro(e.totaleRicalcolato)} €</span>}
              {e.descrizioniTroncate > 0 && <span className="text-amber-800">{e.descrizioniTroncate} descrizioni accorciate da PriMus nel PDF: il testo intero è nel file XPWE</span>}
            </p>;
          })}
          {fonte && <p className="flex flex-wrap items-center gap-x-2">
            <span className="font-medium">{fonte.nome}</span>
            <span className="text-muted-foreground">{voci.length} voci · {fonte.tipo} del gestionale</span>
            <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setVoci([]); setFonte(null); setPasso("scegli"); }}>Scegli un altro documento</Button>
          </p>}
          {errori.map(l => <p key={l.chiave} role="alert" className="text-amber-800"><strong>{l.file.name}</strong> non letto: {l.errore}</p>)}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
            <input type="checkbox" className="h-3.5 w-3.5 accent-[hsl(var(--primary))]" aria-label="Seleziona tutte le voci"
              checked={!!voci.length && selezionate.length === voci.length}
              ref={el => { if (el) el.indeterminate = selezionate.length > 0 && selezionate.length < voci.length; }}
              onChange={e => seleziona(voci.map(v => v.id), e.target.checked)} />
            <span className="tabular-nums" data-testid="contatore-selezione"><strong>{selezionate.length}</strong> selezionate su {voci.length}</span>
          </label>
          {!!incerte && <Button size="sm" variant={soloIncerte ? "default" : "outline"} aria-pressed={soloIncerte} onClick={() => setSoloIncerte(s => !s)}>
            <AlertTriangle className="mr-1 h-3.5 w-3.5" />Da controllare ({incerte})
          </Button>}
          <span className="ml-auto text-xs text-muted-foreground">
            {vociPresenti ? `Le ${vociPresenti} voci che ci sono già restano come sono: queste si aggiungono in fondo.` : (notaDestinazione ?? "Le voci si aggiungono al documento.")}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="sticky top-0 z-10 bg-muted/90 text-left text-muted-foreground backdrop-blur">
              <tr>
                <th className="w-8 px-2 py-1.5"><span className="sr-only">Importa</span></th>
                <th className="w-24 px-2 py-1.5 font-medium">Codice</th>
                <th className="px-2 py-1.5 font-medium">Descrizione</th>
                <th className="w-16 px-2 py-1.5 font-medium">U.M.</th>
                <th className="w-24 px-2 py-1.5 text-right font-medium">Quantità</th>
                <th className="w-24 px-2 py-1.5 text-right font-medium">Prezzo</th>
                <th className="w-24 px-2 py-1.5 text-right font-medium">Importo</th>
                <th className="w-9 px-1 py-1.5"><span className="sr-only">Togli</span></th>
              </tr>
            </thead>
            {gruppi.map(([capitolo, gruppo]) => {
              const ids = capitoliTutti.get(capitolo) ?? gruppo.map(v => v.id);
              const scelte = ids.filter(id => !escluse.has(id)).length;
              const totaleCapitolo = totaleVoci(voci.filter(v => ids.includes(v.id) && !escluse.has(v.id)));
              return <tbody key={capitolo} data-capitolo={capitolo}>
              <tr className="border-t bg-muted/50">
                <td className="px-2 py-1.5">
                  <input type="checkbox" className="h-3.5 w-3.5 accent-[hsl(var(--primary))]" aria-label={`Seleziona il capitolo ${capitolo}`}
                    checked={scelte === ids.length} ref={el => { if (el) el.indeterminate = scelte > 0 && scelte < ids.length; }}
                    onChange={e => seleziona(ids, e.target.checked)} />
                </td>
                <td colSpan={5} className="px-2 py-1.5 text-xs font-semibold">{capitolo}
                  <span className="ml-2 font-normal text-muted-foreground tabular-nums">{scelte} su {ids.length}</span></td>
                <td className="px-2 py-1.5 text-right text-xs font-semibold tabular-nums">{formatEuro(totaleCapitolo)} €</td>
                <td />
              </tr>
              {gruppo.map(v => {
                const { importo } = calcolaVoce(v);
                const conMisure = v.misure.length > 0;
                const scelta = !escluse.has(v.id);
                return <tr key={v.id} className={`border-t align-top ${v.avvisi.length ? "bg-amber-50/70" : ""} ${scelta ? "" : "opacity-50"}`} data-incerta={v.avvisi.length ? "" : undefined} data-selezionata={scelta ? "" : undefined}>
                  <td className="px-2 py-2.5">
                    <input type="checkbox" className="h-3.5 w-3.5 accent-[hsl(var(--primary))]" aria-label={`Importa ${v.descrizione.split("\n")[0].slice(0, 60) || "la voce"}`}
                      checked={scelta} onChange={e => seleziona([v.id], e.target.checked)} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Campo etichetta="Codice" valore={v.tariffa} onCambia={t => modifica(v.id, { tariffa: t })} />
                    {piuFile && <span className="mt-1 block truncate text-[10px] text-muted-foreground" title={v.origine}>{v.origine}</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <textarea aria-label="Descrizione" rows={2} value={v.descrizione} onChange={e => modifica(v.id, { descrizione: e.target.value })}
                      className="w-full resize-y rounded-md border border-input bg-background px-2 py-1 text-xs" />
                    {!!v.avvisi.length && <p className="mt-0.5 flex items-start gap-1 text-[11px] text-amber-800">
                      <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />{v.avvisi.join(" · ")}
                    </p>}
                    <input aria-label="Capitolo" value={v.capitolo} placeholder="Capitolo" onChange={e => modifica(v.id, { capitolo: e.target.value })}
                      className="mt-1 h-6 w-full rounded border border-transparent bg-transparent px-1 text-[11px] text-muted-foreground hover:border-input focus:border-input focus:bg-background" />
                  </td>
                  <td className="px-2 py-1.5"><Campo etichetta="Unità di misura" valore={v.unita} onCambia={t => modifica(v.id, { unita: t })} /></td>
                  <td className="px-2 py-1.5">
                    <Campo etichetta="Quantità" numero disabilitato={conMisure}
                      valore={conMisure ? (calcolaVoce(v).quantita ?? "").toLocaleString("it-IT") : v.quantita} onCambia={t => modifica(v.id, { quantita: t })} />
                    {conMisure && <span className="mt-0.5 block text-right text-[10px] text-muted-foreground">da {v.misure.length} {v.misure.length === 1 ? "misura" : "misure"}</span>}
                  </td>
                  <td className="px-2 py-1.5"><Campo etichetta="Prezzo" numero valore={v.prezzo} onCambia={t => modifica(v.id, { prezzo: t })} /></td>
                  <td className="px-2 py-1.5 pt-3 text-right tabular-nums">{importo === null ? "—" : `${formatEuro(importo)} €`}</td>
                  <td className="px-1 py-1.5">
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
            <Button size="sm" variant="ghost" onClick={() => setTutte(true)}>Mostra tutte le {visibili.length} voci</Button>
          </div>}
          {!visibili.length && <p className="p-4 text-center text-sm text-muted-foreground">{soloIncerte ? "Nessuna voce da controllare." : "Hai tolto tutte le voci."}</p>}
        </div>
        {troppe && <p role="alert" className="text-xs text-amber-800">Con queste voci il documento ne avrebbe {vociPresenti + selezionate.length}: il massimo è {massimoVoci}. Togline qualcuna.</p>}
      </>}

      <DialogFooter className="flex-wrap items-center gap-2 sm:justify-between">
        {passo === "anteprima"
          ? <span className="text-sm tabular-nums">{selezionate.length} di {voci.length} voci · totale selezionate: <strong>{formatEuro(totale)} €</strong></span>
          : <span />}
        <div className="flex gap-2">
          <Button variant="outline" onClick={chiudi}><X className="mr-1 h-4 w-4" />{passo === "anteprima" ? "Annulla" : "Chiudi"}</Button>
          {passo === "anteprima" && <Button onClick={conferma} disabled={!selezionate.length || troppe}>
            <Check className="mr-1 h-4 w-4" />{etichettaConferma ? etichettaConferma(selezionate.length) : `Aggiungi ${selezionate.length} ${selezionate.length === 1 ? "voce" : "voci"}`}
          </Button>}
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

export default ImportaVociDialog;
