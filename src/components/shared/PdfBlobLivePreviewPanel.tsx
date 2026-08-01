/**
 * PdfBlobLivePreviewPanel — pannello anteprima PDF LIVE persistente, condiviso da
 * tutti i vertical che generano il preventivo come BLOB PDF mostrato in un
 * <iframe src={blobUrl}> (Bagni, Ristrutturazione, Elettrico, Termoidraulico,
 * Tetti, Piscine, Pavimenti, Climatizzazione).
 *
 * A differenza del dialog (modale, on-demand), è SEMPRE visibile a lato dell'editor
 * e si rigenera in modo DEBOUNCED ad ogni modifica del template. Il visore PDF
 * nativo del browser dentro l'iframe gestisce scroll di tutte le pagine + zoom.
 *
 * Il vertical passa una `renderBlobUrl()` (che costruisce i mock + chiama il suo
 * renderXxxPreviewBlobUrl) e una `depsKey` che, cambiando, ritriggera la generazione.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, ExternalLink, Eye, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Oltre questo tempo la generazione è considerata persa.
 *
 * @react-pdf scarica le immagini remote del template (logo, copertina, foto)
 * SENZA timeout interno: se una non risponde, `toBlob()` non si risolve MAI e
 * il pannello resta a girare per sempre. Il dialog Serramenti aveva già questa
 * protezione; il pannello live — usato da TUTTI i vertical — no, ed è per
 * questo che l'anteprima girava a vuoto su ogni template.
 */
const PDF_TIMEOUT_MS = 45_000;

class PreviewTimeoutError extends Error {
  constructor() {
    super(
      "L'anteprima non si è generata in tempo. Di solito è un'immagine del template " +
        "(logo, copertina o foto) che non si carica: prova a ricaricarla o sostituirla.",
    );
    this.name = "PreviewTimeoutError";
  }
}

interface Props {
  /** Costruisce (async) il blob URL del PDF con mock + template correnti. */
  renderBlobUrl: () => Promise<string>;
  /** Chiave che rappresenta lo stato visivo: quando cambia, rigenera (debounced). */
  depsKey: string;
  /** Abilita la generazione solo quando true (es. companyId disponibile). */
  enabled?: boolean;
  debounceMs?: number;
  /** Classe colore accent per il titolo (default arancio). */
  accentClass?: string;
}

export function PdfBlobLivePreviewPanel({
  renderBlobUrl,
  depsKey,
  enabled = true,
  debounceMs = 500,
  accentClass = "text-orange-600",
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const genIdRef = useRef(0);
  // Tieni l'ultima renderBlobUrl in un ref: cambia identità ad ogni render del
  // parent, ma vogliamo che l'effetto dipenda SOLO da depsKey (no loop).
  const renderRef = useRef(renderBlobUrl);
  renderRef.current = renderBlobUrl;

  /**
   * Genera l'anteprima. Una sola implementazione per il debounce e per il
   * bottone "Aggiorna ora" (prima erano due copie identiche: una correzione
   * su una sola delle due sarebbe passata inosservata).
   */
  const genera = useCallback(() => {
    const myGen = ++genIdRef.current;
    setLoading(true);
    setError(null);
    void (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const blobUrl = await Promise.race([
          renderRef.current(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new PreviewTimeoutError()), PDF_TIMEOUT_MS);
          }),
        ]);
        if (myGen !== genIdRef.current) { URL.revokeObjectURL(blobUrl); return; }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = blobUrl;
        setUrl(blobUrl);
      } catch (e) {
        // L'errore vero in console: il messaggio a schermo resta leggibile,
        // ma chi deve diagnosticare trova lo stack completo.
        console.error("[anteprima-pdf] generazione fallita:", e);
        if (myGen === genIdRef.current) {
          setError(e instanceof Error ? e.message : "Errore nella generazione del PDF");
        }
      } finally {
        if (timer) clearTimeout(timer);
        if (myGen === genIdRef.current) setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(genera, debounceMs);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey, enabled]);

  useEffect(() => () => {
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
  }, []);

  const forceRegen = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    genera();
  };

  return (
    <div className="flex flex-col h-full rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Eye className={"h-3.5 w-3.5 shrink-0 " + accentClass} />
          <span className={"text-[11px] font-semibold uppercase tracking-wide truncate " + accentClass}>
            Anteprima live PDF
          </span>
          {loading && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> aggiorno…
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon" variant="ghost" onClick={forceRegen} disabled={loading || !enabled} title="Aggiorna ora" className="h-7 w-7">
            <RefreshCw className={"h-3.5 w-3.5 " + (loading ? "animate-spin" : "")} />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => url && window.open(url, "_blank")} disabled={!url} title="Apri in nuova scheda" className="h-7 w-7">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="relative flex-1 min-h-0 bg-muted/40">
        {loading && !url && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 p-4 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
              <p className="text-[11px] text-muted-foreground">Genero l'anteprima…</p>
            </div>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="flex flex-col items-center gap-2 max-w-[260px] text-center">
              <AlertCircle className="h-6 w-6 text-rose-600" />
              <p className="text-[11px] text-muted-foreground">{error}</p>
              <Button size="sm" variant="outline" onClick={forceRegen} className="mt-1 h-7 text-[11px]">Riprova</Button>
            </div>
          </div>
        )}
        {url && (
          <iframe title="Anteprima PDF" src={url} className="h-full w-full border-0 bg-white" />
        )}
        {!url && !loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[11px] text-muted-foreground">In attesa…</p>
          </div>
        )}
      </div>
    </div>
  );
}
