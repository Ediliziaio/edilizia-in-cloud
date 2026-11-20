import { useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, FileSearch, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProgressiveFluxLoader } from "@/components/ui/progressive-flux-loader";
import { Input } from "@/components/ui/input";
import { useLetturaOcrPsc, usePaginaOcrPsc } from "@/hooks/useLetturaOcrPsc";
import { apriFileRiservato } from "@/lib/storagePrivato";
import type { RiferimentoPsc } from "../../../../supabase/functions/_shared/posPsc";

export interface ContestoLetturaPsc {
  companyId: string;
  posId: string;
  fonte: RiferimentoPsc;
  salva?: () => Promise<boolean>;
}

function RisultatiOcrPsc({ companyId, posId, fonte, totale, attiva, apri }: ContestoLetturaPsc & {
  totale: number; attiva: boolean; apri: (pagina: number) => void;
}) {
  const [pagina, setPagina] = useState(1);
  const p = usePaginaOcrPsc(companyId, posId, fonte, pagina, attiva);
  const risultato = p.data;
  const stato = p.isLoading ? "Caricamento pagina…" : p.isError ? "Pagina non disponibile. Riprova." :
    risultato?.metodo === "blank" ? "Pagina bianca." :
    risultato?.metodo === "unreadable" ? "La pagina richiede un controllo sull’originale." :
    risultato?.metodo === "riprova" || !risultato ? "Pagina ancora in lettura." : null;
  return <div className="space-y-2 rounded-lg border bg-background p-3">
    <div className="flex flex-wrap items-center gap-1.5">
      <Button type="button" variant="outline" size="icon" className="size-8" aria-label="Pagina precedente" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}><ChevronLeft className="size-4" /></Button>
      <label className="flex items-center gap-2 text-xs">Pagina
        <Input key={pagina} defaultValue={pagina} aria-label="Vai alla pagina del testo" type="number" min={1} max={totale} className="h-8 w-20"
          onBlur={e => { const n = Number(e.currentTarget.value); if (Number.isSafeInteger(n) && n >= 1 && n <= totale) setPagina(n); else e.currentTarget.value = String(pagina); }}
          onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      </label>
      <span className="text-xs text-muted-foreground">di {totale}</span>
      <Button type="button" variant="outline" size="icon" className="size-8" aria-label="Pagina successiva" disabled={pagina >= totale} onClick={() => setPagina(p => p + 1)}><ChevronRight className="size-4" /></Button>
      <Button type="button" variant="link" size="sm" onClick={() => apri(pagina)}>Vedi pagina originale</Button>
    </div>
    {stato ? <p role="status" className="text-xs text-muted-foreground">{stato}</p> : <>
      <p className="text-xs text-muted-foreground">{risultato?.metodo === "ocr" ? "Trascrizione OCR da confrontare con l’originale" : "Testo presente nel PDF"}</p>
      <div className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2.5 text-sm">{risultato?.testo}</div>
    </>}
  </div>;
}

export function LetturaOcrPsc({ companyId, posId, fonte, salva, ro = false, onPronta }: ContestoLetturaPsc & {
  ro?: boolean; onPronta?: () => void;
}) {
  const [mostra, setMostra] = useState(false);
  const { stato, avvia } = useLetturaOcrPsc(companyId, posId, fonte);
  const l = stato.data;
  if (ro && !l) return null;
  const attiva = avvia.isPending || l?.stato === "in_coda" || l?.stato === "in_lettura";
  const errore = avvia.error?.message || l?.errore || (stato.isError ? "Stato della lettura temporaneamente non disponibile." : null);
  const riprova = l?.stato === "parziale" || l?.stato === "errore";
  const etichetta = avvia.isPending ? "Avvio della lettura" : l?.stato === "pronta" ? "Lettura pronta" : l?.stato === "parziale" ? "Lettura parziale"
    : l?.stato === "errore" ? "Lettura interrotta" : l?.totale ? "Analisi delle pagine" : l?.stato === "in_lettura" ? "Apertura del PSC" : "In coda";
  const percent = l?.totale ? 100 * l.esaminate / l.totale : undefined;
  const apri = (pagina?: number) => {
    void apriFileRiservato(fonte.archivio === "sicurezza_documenti" ? "sicurezza-documenti" : "fascicoli-cantiere", fonte.file_path, pagina)
      .catch(() => toast.error("Impossibile aprire la pagina del PSC"));
  };
  return (
    <section aria-label="Lettura del PSC" className="space-y-3 rounded-xl border bg-gradient-to-br from-primary/5 via-card to-eic-orange/10 p-3.5 sm:p-4">
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><FileSearch className="size-4" aria-hidden /></span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Lettura integrale del PSC</h3>
          <p className="truncate text-xs text-muted-foreground">{fonte.titolo} · Rev. {fonte.revisione}</p>
        </div>
      </div>
      {(attiva || l) && <ProgressiveFluxLoader label={etichetta} value={percent} active={attiva} ariaLabel="Avanzamento lettura PSC" />}
      {l?.totale && <p className="text-xs leading-relaxed text-muted-foreground">
        {l.esaminate} di {l.totale} pagine esaminate · {l.letto} lette
        {l.bianche > 0 && ` · ${l.bianche} bianche`}
        {l.illeggibili.length > 0 && ` · ${l.illeggibili.length} illeggibili`}
      </p>}
      {attiva && l && <p className="text-xs text-muted-foreground">Puoi chiudere o cambiare pagina. La lettura continua e la ritrovi qui.</p>}
      {!l && !attiva && !ro && <p className="text-xs text-muted-foreground">Analizza il documento in background. Le pagine scansionate possono usare crediti AI.</p>}
      {errore && <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive"><AlertCircle className="size-3.5 shrink-0" />{errore}</p>}
      {!!l?.illeggibili.length && <details className="text-xs">
        <summary className="cursor-pointer font-medium">Pagine da controllare</summary>
        <div className="mt-2 flex max-h-32 flex-wrap gap-1 overflow-auto">
          {l.illeggibili.map(p => <Button key={p} type="button" variant="outline" size="sm" className="h-7" onClick={() => apri(p)}>Pagina {p}</Button>)}
        </div>
      </details>}
      <div className="flex flex-wrap gap-2">
        {!ro && (!l || riprova) && <Button type="button" size="sm" disabled={attiva || stato.isLoading}
          onClick={() => avvia.mutate({ riprova, salva })}>
          {riprova && <RotateCcw className="mr-1.5 size-3.5" aria-hidden />}
          {riprova ? "Riprova pagine mancanti" : "Leggi tutto il PSC"}
        </Button>}
        {l && <Button type="button" size="sm" variant="ghost" onClick={() => apri()}>Apri PSC</Button>}
        {!!l?.esaminate && <Button type="button" size="sm" variant="outline" aria-expanded={mostra}
          onClick={() => setMostra(v => !v)}>{mostra ? "Chiudi testo" : "Vedi testo letto"}</Button>}
        {onPronta && !!l?.letto && !attiva && <Button type="button" size="sm" variant="outline" onClick={onPronta}>Usa per le proposte</Button>}
      </div>
      {mostra && !!l?.totale && <RisultatiOcrPsc companyId={companyId} posId={posId} fonte={fonte} totale={l.totale} attiva={attiva} apri={apri} />}
    </section>
  );
}
