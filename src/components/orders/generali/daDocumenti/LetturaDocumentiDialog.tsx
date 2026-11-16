// Commessa generale dai documenti — il popup di lettura (lotto 2 di
// docs/piano-commessa-generale-da-documenti.md). Fa vedere la lettura pagina per pagina: la striscia
// delle pagine, le fasi, i dati che arrivano con la loro pagina, il costo che sale e, alla fine,
// i controlli di coerenza del lotto 0. In questo lotto è alimentato da una lettura FINTA con dati
// inventati, e lo dice; la lettura vera (lotto 1) produrrà la stessa fotografia.
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, CircleHelp, FileText, Loader2, ShieldOff, Sparkles, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { catalogoPer, campoDelCatalogo, nomeDocumento, SCELTE_DECISE, type TipoDaDocumenti } from "@/lib/orders/generali/daDocumenti/catalogo";
import { controlli, statoCampi, type Controllo, type Valore } from "@/lib/orders/generali/daDocumenti/controlli";
import { useLetturaGenerale } from "@/hooks/useLetturaGenerale";
import { fotoDaDb } from "@/lib/orders/generali/daDocumenti/foto";
import { CostruisciGenerale } from "@/components/orders/generali/daDocumenti/CostruisciGenerale";
import { contaPagine, copioneFinto, fotoAl, type FaseLettura, type FileLettura, type FotoLettura, type PaginaLettura, type StatoPagina } from "@/lib/orders/generali/daDocumenti/letturaFinta";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** La lettura vera; senza, e con `prova`, si vede la lettura di prova con dati inventati. */
  letturaId?: string | null;
  prova?: boolean;
  onCreata?: () => void;
}

/** Il tempo della lettura finta: scorre a fotogrammi, si può accelerare o saltare alla fine. */
function useOrologio(durata: number, attivo: boolean) {
  const [ms, setMs] = useState(0);
  const velocita = useRef(1);
  useEffect(() => {
    if (!attivo) return;
    let id = 0;
    let prima = performance.now();
    const passo = (ora: number) => {
      const delta = (ora - prima) * velocita.current;
      prima = ora;
      setMs((m) => Math.min(durata, m + delta));
      id = requestAnimationFrame(passo);
    };
    id = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(id);
  }, [durata, attivo]);
  return { ms, fine: () => setMs(durata), veloce: () => { velocita.current = velocita.current === 1 ? 4 : 1; return velocita.current; } };
}

export function LetturaDocumentiDialog({ open, onOpenChange, letturaId, prova, onCreata }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        className={cn(
          "max-lg:[&>button:last-child]:right-1 max-lg:[&>button:last-child]:top-1 max-lg:[&>button:last-child]:flex max-lg:[&>button:last-child]:h-11 max-lg:[&>button:last-child]:w-11 max-lg:[&>button:last-child]:items-center max-lg:[&>button:last-child]:justify-center",
          "inset-0 left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-slate-50 p-0 outline-none",
          "lg:left-[50%] lg:top-[50%] lg:h-[calc(100dvh-48px)] lg:w-[calc(100vw-48px)] lg:max-w-[1400px] lg:translate-x-[-50%] lg:translate-y-[-50%] lg:rounded-2xl lg:border",
        )}
      >
        {/* Ogni apertura riparte da capo. */}
        {open && (letturaId && !prova
          ? <LetturaVera id={letturaId} onChiudi={() => onOpenChange(false)} onCreata={onCreata} />
          : <LetturaProva onChiudi={() => onOpenChange(false)} />)}
      </DialogContent>
    </Dialog>
  );
}

const TITOLO_TIPO: Record<TipoDaDocumenti, string> = {
  appalto_pubblico: "Appalto pubblico", appalto_privato: "Appalto privato", sviluppo: "Sviluppo immobiliare", compravendita: "Compra, ristruttura, vendi",
};

function Testata({ tipo, prova, titolo = "Lettura dei documenti" }: { tipo: TipoDaDocumenti; prova?: boolean; titolo?: string }) {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-white px-4 py-3 pr-14 sm:px-6">
      <Sparkles className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <DialogTitle className="text-base font-semibold sm:text-lg">{titolo}</DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">{TITOLO_TIPO[tipo]} · ogni pagina, dalla prima all'ultima</DialogDescription>
      </div>
      {prova && <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">Prova: documenti e cifre inventati, nessun costo</span>}
    </header>
  );
}

/** Pagine a sinistra, dati trovati a destra: uguale per la prova e per la lettura vera. */
function Corpo({ foto, tipo, sopra }: { foto: FotoLettura; tipo: TipoDaDocumenti; sopra?: React.ReactNode }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_24rem] lg:overflow-hidden">
      <section aria-label="Pagine" className="space-y-4 p-4 sm:p-6 lg:overflow-y-auto">
        {sopra}
        {foto.finita && <Riepilogo foto={foto} tipo={tipo} />}
        {foto.file.map((f) => <StrisciaFile key={f.id} file={f} />)}
        <Legenda />
      </section>
      <aside aria-label="Dati trovati" className="border-t bg-white p-4 sm:p-6 lg:overflow-y-auto lg:border-l lg:border-t-0">
        <DatiTrovati foto={foto} tipo={tipo} />
      </aside>
    </div>
  );
}

const PIEDE = "flex flex-wrap items-center justify-end gap-2 border-t bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6";

function LetturaProva({ onChiudi }: { onChiudi: () => void }) {
  const copione = useMemo(() => copioneFinto(), []);
  const [partita, setPartita] = useState(false);
  const orologio = useOrologio(copione.durata, partita);
  const [veloce, setVeloce] = useState(false);
  const foto = fotoAl(copione, partita ? orologio.ms : 0);

  return (
    <>
      <Testata tipo={copione.tipo} prova />
      {!partita ? (
        <Partenza foto={foto} onLeggi={() => setPartita(true)} onAnnulla={onChiudi} />
      ) : (
        <>
          <Avanzamento foto={foto} tipo={copione.tipo} />
          <Corpo foto={foto} tipo={copione.tipo} />
          <footer className={PIEDE}>
            {!foto.finita ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setVeloce(orologio.veloce() > 1)}>{veloce ? "Velocità normale" : "Più veloce ×4"}</Button>
                <Button variant="ghost" size="sm" onClick={orologio.fine}>Salta alla fine</Button>
                <Button variant="outline" onClick={() => { toast.info("Nella prova non arriva nessun avviso", { description: "Con la lettura vera la ritrovi in «Letture in corso»." }); onChiudi(); }}>
                  Chiudi, la riprendo dopo
                </Button>
              </>
            ) : (
              <>
                <span className="mr-auto text-xs text-muted-foreground">Nella prova la commessa non si costruisce: carica i tuoi documenti.</span>
                <Button onClick={onChiudi}>Chiudi</Button>
              </>
            )}
          </footer>
        </>
      )}
    </>
  );
}

function LetturaVera({ id, onChiudi, onCreata }: { id: string; onChiudi: () => void; onCreata?: () => void }) {
  const { data, isLoading, error, avvia } = useLetturaGenerale(id);
  const [costruisci, setCostruisci] = useState(false);
  const l = data?.lettura;
  if (isLoading) return <div className="flex flex-1 items-center justify-center"><DialogTitle className="sr-only">Lettura dei documenti</DialogTitle><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carico" /></div>;
  if (error || !l) return <div className="p-6 text-sm text-destructive"><DialogTitle className="sr-only">Lettura dei documenti</DialogTitle>Lettura non trovata. <Button variant="link" onClick={onChiudi}>Chiudi</Button></div>;
  const foto = fotoDaDb(l, data.pagine);
  if (costruisci && foto.finita) {
    return <CostruisciGenerale lettura={l} pagine={data.pagine} onIndietro={() => setCostruisci(false)} onChiudi={onChiudi} onCreata={onCreata} />;
  }
  const leggi = () => avvia.mutate(undefined, { onError: (e) => toast.error((e as Error).message) });
  const ferma = l.stato === "in_pausa" || l.stato === "errore";
  return (
    <>
      <Testata tipo={l.tipo} />
      {l.stato === "preparata" ? (
        <Partenza foto={foto} onLeggi={leggi} onAnnulla={onChiudi} inCorso={avvia.isPending} stimaVera tipo={l.tipo} />
      ) : (
        <>
          <Avanzamento foto={foto} tipo={l.tipo} />
          <Corpo foto={foto} tipo={l.tipo} sopra={ferma ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
              <span className="min-w-0 flex-1">{l.errore ?? "La lettura si è fermata."} Le pagine già lette restano.</span>
              <Button size="sm" onClick={leggi} disabled={avvia.isPending}>{avvia.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Riprendi</Button>
            </div>
          ) : null} />
          <footer className={PIEDE}>
            {!foto.finita ? (
              <Button variant="outline" onClick={() => { toast.info("La lettura continua", { description: "La ritrovi in «Nuova commessa generale» → «Letture in corso»." }); onChiudi(); }}>
                Chiudi, continua a leggere
              </Button>
            ) : (
              <>
                {l.stato === "usata" && <span className="mr-auto text-xs text-muted-foreground">Da questa lettura è già nata una commessa generale.</span>}
                <Button variant="ghost" onClick={onChiudi}>Chiudi</Button>
                <Button onClick={() => setCostruisci(true)}>Costruisci la commessa generale</Button>
              </>
            )}
          </footer>
        </>
      )}
    </>
  );
}

// ─── Prima di partire: pagine, OCR, stima ──────────────────────────────────────

function Partenza({ foto, onLeggi, onAnnulla, inCorso, stimaVera, tipo }: { foto: FotoLettura; onLeggi: () => void; onAnnulla: () => void; inCorso?: boolean; stimaVera?: boolean; tipo?: TipoDaDocumenti }) {
  const nomeDoc = (id: string) => (tipo ? catalogoPer(tipo).documenti.find((d) => d.id === id)?.nome : null) ?? id;
  const daOcr = foto.file.flatMap((f) => f.pagine).filter((p) => p.stato === "in_coda").length;
  const pagine = foto.file.filter((f) => !f.strutturato).reduce((s, f) => s + f.pagine.length, 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
        <p className="text-sm text-muted-foreground">Prima di leggere: cosa c'è da leggere e quanto costa.</p>
        <ul className="divide-y rounded-lg border bg-white">
          {foto.file.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium">{f.nome}</span>
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{nomeDoc(f.documento)}</span>
              <span className="shrink-0 text-right text-xs sm:w-24">{f.strutturato ? "senza AI" : `${f.pagine.length} pagine`}</span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-3 gap-2">
          <Numero etichetta="Pagine" valore={String(pagine)} />
          <Numero etichetta={stimaVera ? "Da leggere con l'OCR" : "Letti senza AI"} valore={stimaVera ? (daOcr === 1 ? "1 pagina" : `${daOcr} pagine`) : String(foto.file.filter((f) => f.strutturato).length) + " file"} />
          <Numero etichetta="Costo stimato" valore={euro(foto.stimaCosto)} />
        </div>
        {/* Soglia di costo: deciso il 16/11/2026, prima si vede sempre la stima. */}
        <p className="flex gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{SCELTE_DECISE.soglia_costo.regola} Il costo è addebitato all'azienda; le pagine già lette in passato non si pagano due volte.</span>
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onAnnulla}>Annulla</Button>
          <Button onClick={onLeggi} disabled={inCorso}>{inCorso ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" aria-hidden />}Leggi</Button>
        </div>
      </div>
    </div>
  );
}

function Numero({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div className="rounded-lg border bg-white px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{etichetta}</div>
      <div className="text-sm font-semibold tabular-nums sm:text-base">{valore}</div>
    </div>
  );
}

// ─── Fasi e barra ──────────────────────────────────────────────────────────────

const FASI: { id: FaseLettura; titolo: string }[] = [
  { id: "caricamento", titolo: "Caricamento" },
  { id: "pagine", titolo: "Lettura pagine" },
  { id: "estrazione", titolo: "Estrazione dati" },
  { id: "controlli", titolo: "Controlli" },
  { id: "finita", titolo: "Pronto" },
];

function Avanzamento({ foto, tipo }: { foto: FotoLettura; tipo: TipoDaDocumenti }) {
  const ridotto = useReducedMotion();
  const conto = soloPagine(foto);
  const quota = foto.finita ? 1 : conto.totale ? conto.chiuse / conto.totale : 0;
  const attuale = FASI.findIndex((f) => f.id === foto.fase);
  const gruppi = (foto as { gruppi?: { fatti: number; totali: number | null } }).gruppi;
  const dati = foto.arrivati.length;
  const ultimo = foto.arrivati[foto.arrivati.length - 1];
  return (
    <div className="border-b bg-white px-4 py-3 sm:px-6">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs">
        {FASI.map((f, i) => (
          <li key={f.id} className="flex items-center gap-1">
            <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold",
              i < attuale || foto.finita ? "border-emerald-500 bg-emerald-500 text-white" : i === attuale ? "border-primary text-primary" : "text-muted-foreground")}>
              {i < attuale || foto.finita ? <Check className="h-3 w-3" aria-hidden /> : i === attuale ? <Loader2 className={cn("h-3 w-3", !ridotto && "animate-spin")} aria-hidden /> : i + 1}
            </span>
            <span className={cn(i === attuale && !foto.finita ? "font-semibold" : "text-muted-foreground")}>
              {f.titolo}
              {f.id === "pagine" && <span className="tabular-nums"> {conto.chiuse}/{conto.totale}</span>}
              {f.id === "estrazione" && gruppi?.totali ? <span className="tabular-nums"> {gruppi.fatti}/{gruppi.totali}</span> : null}
            </span>
            {i < FASI.length - 1 && <span className="mx-1 h-px w-4 bg-border sm:w-8" aria-hidden />}
          </li>
        ))}
      </ol>
      <div className="mt-2 flex items-center gap-3">
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(quota * 100)} aria-label="Pagine lette">
          <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${quota * 100}%` }} transition={{ duration: ridotto ? 0 : 0.3 }} />
          {!ridotto && !foto.finita && (
            <motion.div className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-white/60 to-transparent"
              animate={{ left: ["-25%", "100%"] }} transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }} />
          )}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
        <span><b className="tabular-nums text-foreground">{dati}</b> dati trovati</span>
        <span>Costo <b className="tabular-nums text-foreground">{euro(foto.costo)}</b> · stima {euro(foto.stimaCosto)}</span>
        <span>{foto.finita ? `Finita in ${secondi(foto.trascorso)}` : foto.restante === null ? "Calcolo il tempo…" : `Mancano circa ${secondi(foto.restante)}`}</span>
      </div>
      {/* Sul telefono l'elenco dei dati sta sotto le pagine: qui si vede l'ultimo trovato. */}
      {ultimo && !foto.finita && (
        <div className="mt-1.5 h-5 overflow-hidden lg:hidden" aria-live="polite">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p key={`${ultimo.chiave}-${ultimo.t}`} className="truncate text-xs"
              initial={ridotto ? false : { y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={ridotto ? undefined : { y: -14, opacity: 0 }} transition={{ duration: 0.2 }}>
              <Sparkles className="mr-1 inline h-3 w-3 text-primary" aria-hidden />
              {campoDelCatalogo(tipo, ultimo.chiave)?.etichetta ?? ultimo.chiave}: <b>{formatta(ultimo.occorrenza.valore, campoDelCatalogo(tipo, ultimo.chiave)?.tipo)}</b>
              <span className="text-muted-foreground"> · pag. {ultimo.occorrenza.pagina}</span>
            </motion.p>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ─── Striscia delle pagine ─────────────────────────────────────────────────────

const STATO: Record<StatoPagina, { testo: string; classe: string }> = {
  in_coda: { testo: "in coda", classe: "border-slate-200 bg-white" },
  in_lettura: { testo: "in lettura", classe: "border-primary bg-primary/5 ring-2 ring-primary/30" },
  testo: { testo: "letta dal testo", classe: "border-emerald-400 bg-emerald-50" },
  ocr: { testo: "letta con l'OCR", classe: "border-emerald-500 bg-emerald-50" },
  parser: { testo: "letta senza AI", classe: "border-sky-400 bg-sky-50" },
  bianca: { testo: "bianca", classe: "border-dashed border-slate-300 bg-white opacity-50" },
  esclusa: { testo: "esclusa: dati personali", classe: "border-slate-300 bg-slate-100" },
  illeggibile: { testo: "illeggibile", classe: "border-red-400 bg-red-50" },
};

function StrisciaFile({ file }: { file: FileLettura }) {
  const chiuse = file.pagine.filter((p) => p.stato !== "in_coda" && p.stato !== "in_lettura").length;
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="mb-2 flex items-baseline gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium">{file.nome}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{nomeDocumento(file.documento)} · <span className="tabular-nums">{chiuse}/{file.pagine.length}</span></span>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {file.pagine.map((p) => <Miniatura key={p.numero} pagina={p} strutturato={!!file.strutturato} />)}
      </ul>
    </div>
  );
}

function Miniatura({ pagina, strutturato }: { pagina: PaginaLettura; strutturato: boolean }) {
  const ridotto = useReducedMotion();
  const s = STATO[pagina.stato];
  const titolo = `${strutturato ? "File" : `Pag. ${pagina.numero}`} — ${s.testo}${pagina.classe ? ` · ${pagina.classe}` : ""}${pagina.motivo ? `. ${pagina.motivo}` : ""}`;
  const fatta = pagina.stato === "testo" || pagina.stato === "ocr" || pagina.stato === "parser";
  return (
    <li title={titolo} aria-label={titolo}
      className={cn("relative h-12 w-9 overflow-hidden rounded-[3px] border transition-colors duration-300 sm:h-14 sm:w-10", s.classe)}>
      {/* Righe di testo finte: la pagina «si vede». */}
      <div className="absolute inset-x-1.5 top-2 space-y-1" aria-hidden>
        {[80, 100, 65, 90, 55].map((w, i) => <div key={i} className="h-[2px] rounded bg-slate-300/70" style={{ width: `${w}%` }} />)}
      </div>
      {pagina.stato === "in_lettura" && !ridotto && (
        <motion.div className="absolute inset-x-0 h-3 bg-gradient-to-b from-transparent via-primary/40 to-transparent" aria-hidden
          animate={{ top: ["-15%", "100%"] }} transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }} />
      )}
      <span className="absolute bottom-0.5 left-1 text-[9px] tabular-nums text-slate-500">{strutturato ? "xpwe" : pagina.numero}</span>
      <span className="absolute bottom-0.5 right-0.5" aria-hidden>
        <AnimatePresence>
          {fatta && (
            <motion.span key="ok" initial={ridotto ? false : { scale: 0 }} animate={{ scale: 1 }} className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check className="h-2.5 w-2.5" />
            </motion.span>
          )}
        </AnimatePresence>
        {pagina.stato === "esclusa" && <ShieldOff className="h-3.5 w-3.5 text-slate-500" />}
        {pagina.stato === "illeggibile" && <XIcon className="h-3.5 w-3.5 text-red-600" />}
      </span>
    </li>
  );
}

function Legenda() {
  const voci: StatoPagina[] = ["in_coda", "in_lettura", "ocr", "testo", "parser", "bianca", "esclusa", "illeggibile"];
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {voci.map((v) => (
        <li key={v} className="flex items-center gap-1"><span className={cn("inline-block h-3 w-2.5 rounded-[2px] border", STATO[v].classe)} aria-hidden />{STATO[v].testo}</li>
      ))}
    </ul>
  );
}

// ─── Dati trovati ──────────────────────────────────────────────────────────────

function DatiTrovati({ foto, tipo }: { foto: FotoLettura; tipo: TipoDaDocumenti }) {
  const ridotto = useReducedMotion();
  // I più recenti in alto: si vede il lavoro che produce.
  const elenco = [...foto.arrivati].reverse();
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Dati trovati <span className="font-normal text-muted-foreground">({foto.arrivati.length})</span></h3>
      {elenco.length === 0 && <p className="text-xs text-muted-foreground">Compaiono qui man mano che le pagine vengono lette.</p>}
      <ul className="space-y-1.5">
        <AnimatePresence initial={false}>
          {elenco.map((a) => {
            const def = campoDelCatalogo(tipo, a.chiave);
            const diversi = (foto.dati[a.chiave] ?? []).some((o) => String(o.valore) !== String(a.occorrenza.valore));
            return (
              <motion.li key={`${a.chiave}-${a.t}`} layout={!ridotto}
                initial={ridotto ? false : { opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.25 }}
                className={cn("rounded-md border px-2.5 py-1.5", diversi ? "border-amber-300 bg-amber-50" : "bg-white")}>
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{def?.etichetta ?? a.chiave}</span>
                  {diversi && <span className="shrink-0 text-[10px] font-semibold text-amber-700">valori diversi</span>}
                  {a.occorrenza.aMano && <span className="shrink-0 text-[10px] font-semibold text-amber-700">a mano</span>}
                </div>
                <div className="truncate text-sm font-medium tabular-nums">{formatta(a.occorrenza.valore, def?.tipo)}</div>
                <div className="truncate text-[11px] text-muted-foreground">pag. {a.occorrenza.pagina} · {a.occorrenza.file}</div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}

// ─── Riepilogo finale: pagine e controlli ──────────────────────────────────────

function Riepilogo({ foto, tipo }: { foto: FotoLettura; tipo: TipoDaDocumenti }) {
  const conto = soloPagine(foto);
  const fileSenzaAi = foto.file.filter((f) => f.strutturato).length;
  const ctrl = controlli(tipo, foto.dati);
  const campi = statoCampi(tipo, foto.dati);
  const conflitti = campi.filter((c) => c.stato === "conflitto");
  const mancanti = campi.filter((c) => c.stato === "non_trovato");
  const pezzi = [
    conto.testo && `${conto.testo} dal testo`, conto.ocr && `${conto.ocr} con l'OCR`,
    conto.bianca && `${conto.bianca} bianche`, conto.esclusa && `${conto.esclusa} escluse`, `${conto.illeggibile} illeggibili`,
  ].filter(Boolean).join(", ");
  return (
    <div className="space-y-3 rounded-lg border bg-white p-3 sm:p-4">
      <p className="text-sm"><b>{conto.totale === 1 ? "1 pagina letta tutta" : `${conto.totale} pagine lette tutte`}:</b> {pezzi}.{fileSenzaAi > 0 && ` In più ${fileSenzaAi === 1 ? "1 file letto" : `${fileSenzaAi} file letti`} senza AI.`}</p>
      {conto.illeggibile > 0 && <p className="text-xs text-red-700">Le pagine illeggibili si ricaricano una per una con una foto migliore (nella prova no).</p>}

      {conflitti.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-800">Da scegliere</h4>
          {conflitti.map((c) => {
            const def = campoDelCatalogo(tipo, c.chiave);
            return (
              <div key={c.chiave} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                <div className="font-medium">{def?.etichetta}</div>
                <ul className="mt-0.5 text-xs">
                  {c.valori.map((v) => <li key={String(v.valore)}>{formatta(v.valore, def?.tipo)} — {v.occorrenze.map((o) => `pag. ${o.pagina} di ${o.file}`).join(", ")}</li>)}
                </ul>
                {c.scelta && (
                  <p className="mt-1 flex gap-1.5 text-[11px] text-amber-900"><CircleHelp className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    <span>{SCELTE_DECISE[c.scelta].regola}</span></p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Controlli</h4>
        <ul className="grid gap-1 sm:grid-cols-2">{ctrl.map((x) => <RigaControllo key={x.id} c={x} />)}</ul>
      </div>

      {mancanti.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">{mancanti.length} dati non trovati nei documenti caricati</summary>
          <ul className="mt-1 columns-1 gap-4 sm:columns-2">
            {mancanti.map((m) => {
              const def = campoDelCatalogo(tipo, m.chiave);
              return <li key={m.chiave}>{def?.etichetta}{def?.doveCercare ? <span className="text-muted-foreground"> — di solito nel {def.doveCercare}</span> : null}</li>;
            })}
          </ul>
        </details>
      )}
    </div>
  );
}

function RigaControllo({ c }: { c: Controllo }) {
  const icona = c.esito === "ok" ? <Check className="h-3.5 w-3.5 text-emerald-600" />
    : c.esito === "errore" ? <XIcon className="h-3.5 w-3.5 text-red-600" />
      : c.esito === "avviso" ? <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
        : <CircleHelp className="h-3.5 w-3.5 text-slate-400" />;
  return (
    <li className="flex gap-1.5 text-xs" title={c.messaggio}>
      <span className="mt-0.5 shrink-0" aria-hidden>{icona}</span>
      <span><span className={cn(c.esito === "non_verificabile" && "text-muted-foreground")}>{c.titolo}</span>
        {c.esito !== "ok" && <span className="block text-muted-foreground">{c.messaggio}</span>}</span>
    </li>
  );
}

/** Le pagine vere: i file letti dal parser (XPWE, Excel) non sono pagine. */
const soloPagine = (foto: FotoLettura) => contaPagine({ file: foto.file.filter((f) => !f.strutturato) });

// ─── Formati ───────────────────────────────────────────────────────────────────

const euro = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const secondi = (ms: number) => (ms < 60000 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.round(ms / 60000)} min`);

function formatta(v: Valore, tipo?: string): string {
  if (typeof v === "number") {
    if (tipo === "importo") return v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
    if (tipo === "percentuale") return `${v.toLocaleString("it-IT")}%`;
    if (tipo === "permille") return `${v.toLocaleString("it-IT")}‰ al giorno`;
    if (tipo === "giorni") return `${v} giorni`;
    return v.toLocaleString("it-IT");
  }
  if (typeof v === "boolean") return v ? "sì" : "no";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`;
  return v;
}
