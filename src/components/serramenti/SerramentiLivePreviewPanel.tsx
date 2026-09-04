/**
 * SerramentiLivePreviewPanel — Anteprima PDF LIVE persistente, a lato dell'editor.
 *
 * A differenza di SerramentiTemplatePreviewDialog (modale, genera all'apertura),
 * questo è un pannello SEMPRE visibile che si auto-aggiorna in modo DEBOUNCED
 * (~800ms) dopo ogni modifica al template: così l'utente vede il PDF vero
 * (tutte le pagine, scrollabile) cambiare mentre lavora, senza lag di digitazione.
 *
 * Funzioni:
 *  - Auto-scroll: quando cambi pagina a sinistra (Chi siamo, Il percorso…),
 *    l'anteprima scrolla alla pagina PDF corrispondente e la evidenzia. Il match
 *    è per TESTO (via pdfjs getTextContent) → robusto all'ordine dinamico pagine.
 *  - Zoom + adatta larghezza.
 *  - Refresh fluido: mantiene le pagine vecchie durante la rigenerazione + barra
 *    di avanzamento; niente sfarfallio.
 *
 * Pipeline: @react-pdf/renderer → blob → pdfjs → render pagina-per-pagina su
 * <canvas> (niente iframe → nessun blocco browser).
 */
import { useEffect, useState, useRef, useMemo } from "react";
import { Loader2, RefreshCw, Download, AlertCircle, ExternalLink, Eye, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { SrTemplatePdfRow } from "@/types/serramenti";
import { buildMockPdfData } from "@/lib/serramenti/mockPdfData";

import { useIsMobile } from "@/hooks/use-mobile";
interface Props {
  /** Template corrente in edit (anche con modifiche non salvate). */
  template: Partial<SrTemplatePdfRow> | null;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  companyLogoDarkUrl?: string | null;
  companyIndirizzo?: string | null;
  /** Sezione attiva nell'editor → usata per l'auto-scroll alla pagina PDF. */
  activeSection?: string | null;
  /** Debounce in ms prima di rigenerare dopo una modifica (default 800). */
  debounceMs?: number;
}

type Status = "idle" | "loading" | "ready" | "error";

// Sezione editor → parole-chiave da cercare nel testo delle pagine PDF.
// La prima pagina che contiene una qualsiasi keyword (case-insensitive) è il target.
// "cover" è speciale (sempre pagina 1). Le sezioni "Dati & contenuti" non hanno
// una pagina propria → nessun auto-scroll.
const SECTION_PAGE_KEYWORDS: Record<string, string[]> = {
  "chi-siamo": ["chi siamo"],
  percorso: ["il tuo percorso"],
  consulente: ["la tua consulenza"],
  recensioni: ["testimonianze", "dicono di noi", "recensioni"],
  render: ["render ai", "anteprima visiva"],
  cta: ["il prossimo passo", "cosa fare adesso"],
};

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.25;

export function SerramentiLivePreviewPanel({
  template,
  companyName,
  companyLogoUrl,
  companyLogoDarkUrl,
  companyIndirizzo,
  activeSection,
  debounceMs = 800,
}: Props) {
  const isMobile = useIsMobile();
  const [status, setStatus] = useState<Status>("idle");
  const [pageCount, setPageCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [renderNonce, setRenderNonce] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [highlightedPage, setHighlightedPage] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef = useRef<any>(null);
  const lastBlobUrlRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const genIdRef = useRef(0);
  // Cache dei testi per pagina (per l'auto-scroll), valida per un dato renderNonce.
  const pageTextsRef = useRef<{ nonce: number; texts: string[] } | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const templateKey = useMemo(
    () => JSON.stringify(template) + "|" + (companyName ?? "") + "|" + (companyLogoUrl ?? "") + "|" + (companyLogoDarkUrl ?? "") + "|" + (companyIndirizzo ?? ""),
    [template, companyName, companyLogoUrl, companyLogoDarkUrl, companyIndirizzo],
  );

  const generate = async () => {
    const myGen = ++genIdRef.current;
    setStatus((s) => (s === "ready" ? s : "loading"));
    setIsRefreshing(true);
    try {
      const [{ pdf }, { SerramentoPDF }, React, pdfjsLib] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/serramenti/SerramentoPDF"),
        import("react"),
        import("pdfjs-dist"),
      ]);
      const workerSrc = (await import(
        // @ts-expect-error - vite handles ?url import
        "pdfjs-dist/build/pdf.worker.min.mjs?url"
      )).default as string;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

      const enriched = await buildMockPdfData({
        template, companyName, companyLogoUrl, companyLogoDarkUrl, companyIndirizzo,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const element = React.createElement(SerramentoPDF as any, enriched);
      const blob = await Promise.race([
        pdf(element).toBlob(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(
            "Generazione troppo lenta (timeout). Probabile causa: un'immagine del template (logo, foto o render) non si carica.",
          )), 45_000),
        ),
      ]);

      if (myGen !== genIdRef.current) return;

      const arrayBuffer = await blob.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      if (myGen !== genIdRef.current) return;

      if (lastBlobUrlRef.current) URL.revokeObjectURL(lastBlobUrlRef.current);
      lastBlobUrlRef.current = URL.createObjectURL(blob);
      pdfDocRef.current = pdfDoc;
      pageTextsRef.current = null; // invalida cache testi
      setPageCount(pdfDoc.numPages);
      setStatus("ready");
      setRenderNonce((n) => n + 1);
    } catch (err) {
      if (myGen !== genIdRef.current) return;
      console.error("[live-preview] errore generazione PDF:", err);
      setErrorMsg(err instanceof Error ? err.message : "Errore sconosciuto");
      setStatus((s) => (s === "ready" ? s : "error"));
    } finally {
      if (myGen === genIdRef.current) setIsRefreshing(false);
    }
  };

  // Rigenerazione DEBOUNCED ad ogni cambio del template.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void generate(), debounceMs);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey]);

  // Render delle pagine su canvas dopo ogni generazione riuscita o cambio zoom.
  useEffect(() => {
    if (status !== "ready" || !pdfDocRef.current) return;
    const pdfDoc = pdfDocRef.current;
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    (async () => {
      const containerWidth = container.clientWidth || 420;
      const A4_WIDTH_PT = 595;
      const fitScale = Math.min(1.6, Math.max(0.4, (containerWidth - 24) / A4_WIDTH_PT));
      const scale = fitScale * zoom;
      for (let i = 1; i <= pageCount; i++) {
        if (cancelled) return;
        const canvas = container.querySelector<HTMLCanvasElement>(`canvas[data-page="${i}"]`);
        if (!canvas) continue;
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        // Larghezza display esplicita: consente lo scroll orizzontale quando zoom > adatta.
        canvas.style.width = `${viewport.width}px`;
        canvas.style.maxWidth = zoom <= 1 ? "100%" : "none";
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      }
    })().catch((e) => console.error("[live-preview] errore render pagine:", e));

    return () => { cancelled = true; };
  }, [renderNonce, status, pageCount, zoom]);

  // Auto-scroll alla pagina della sezione attiva (match per testo).
  useEffect(() => {
    if (status !== "ready" || !activeSection) return;
    const container = containerRef.current;
    const pdfDoc = pdfDocRef.current;
    if (!container || !pdfDoc) return;

    let cancelled = false;
    const scrollToPage = (pageNum: number) => {
      const wrap = container.querySelector<HTMLElement>(`[data-page-wrap="${pageNum}"]`);
      if (!wrap) return;
      container.scrollTo({ top: Math.max(0, wrap.offsetTop - 8), behavior: "smooth" });
      // Evidenzia brevemente la pagina.
      setHighlightedPage(pageNum);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setHighlightedPage(null), 1600);
    };

    // Cover → sempre pagina 1.
    if (activeSection === "cover") {
      scrollToPage(1);
      return;
    }
    const keywords = SECTION_PAGE_KEYWORDS[activeSection];
    if (!keywords) return; // sezione senza pagina dedicata → niente scroll

    (async () => {
      // Estrai (e cache) i testi di tutte le pagine per questo renderNonce.
      if (!pageTextsRef.current || pageTextsRef.current.nonce !== renderNonce) {
        const texts: string[] = [];
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          if (cancelled) return;
          try {
            const page = await pdfDoc.getPage(i);
            const tc = await page.getTextContent();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            texts[i - 1] = (tc.items as any[]).map((it) => it.str ?? "").join(" ").toLowerCase();
          } catch {
            texts[i - 1] = "";
          }
        }
        if (cancelled) return;
        pageTextsRef.current = { nonce: renderNonce, texts };
      }
      const texts = pageTextsRef.current.texts;
      const targetIdx = texts.findIndex((t) => keywords.some((k) => t.includes(k)));
      if (targetIdx >= 0) scrollToPage(targetIdx + 1);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, renderNonce, status]);

  // Cleanup allo smontaggio.
  useEffect(() => {
    return () => {
      if (lastBlobUrlRef.current) URL.revokeObjectURL(lastBlobUrlRef.current);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  const handleDownload = () => {
    if (!lastBlobUrlRef.current) return;
    const a = document.createElement("a");
    a.href = lastBlobUrlRef.current;
    a.download = "anteprima-template.pdf";
    a.click();
    toast.success("Anteprima scaricata");
  };
  const handleOpenInTab = () => {
    if (lastBlobUrlRef.current) window.open(lastBlobUrlRef.current, "_blank");
  };

  return (
    <div className="flex flex-col h-full rounded-lg border bg-card overflow-hidden">
      {/* Header sticky del pannello */}
      <div className="border-b bg-muted/30 shrink-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Eye className="h-3.5 w-3.5 text-orange-500 shrink-0" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-orange-600 truncate">
              Anteprima live PDF
            </span>
            {isRefreshing && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> aggiorno…
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* Zoom */}
            <div className="flex items-center gap-0.5 mr-1 rounded-md border bg-white px-0.5">
              <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))} disabled={zoom <= ZOOM_MIN} title="Riduci" className="h-6 w-6">
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <button type="button" onClick={() => setZoom(1)} title="Adatta larghezza" className="text-[10px] tabular-nums text-slate-600 hover:text-orange-600 min-w-[30px] text-center">
                {Math.round(zoom * 100)}%
              </button>
              <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))} disabled={zoom >= ZOOM_MAX} title="Ingrandisci" className="h-6 w-6">
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setZoom(1)} title="Adatta larghezza" className="h-6 w-6">
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button size="icon" variant="ghost" onClick={() => void generate()} disabled={isRefreshing} title="Aggiorna ora" className="h-7 w-7">
              <RefreshCw className={"h-3.5 w-3.5 " + (isRefreshing ? "animate-spin" : "")} />
            </Button>
            <Button size="icon" variant="ghost" onClick={handleOpenInTab} disabled={status !== "ready"} title="Apri in nuova scheda" className="h-7 w-7">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            {/* Niente export su telefono. */}
            {!isMobile && (
              <Button size="icon" variant="ghost" onClick={handleDownload} disabled={status !== "ready"} title="Scarica PDF" className="h-7 w-7">
                <Download className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        {/* Barra di avanzamento durante il refresh */}
        <div className="h-0.5 w-full overflow-hidden bg-transparent">
          {isRefreshing && <div className="h-full w-full bg-orange-400/80 animate-pulse" />}
        </div>
      </div>

      {/* Area scrollabile con le pagine */}
      <div className="flex-1 overflow-auto bg-muted/40 relative" ref={containerRef}>
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 p-4 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
              <p className="text-[11px] text-muted-foreground">Genero l'anteprima…</p>
              <p className="text-[10px] text-muted-foreground/70 max-w-[220px]">
                Al primo utilizzo scarico il motore PDF (~1 MB): qualche secondo. Poi è rapido.
              </p>
            </div>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="flex flex-col items-center gap-2 max-w-[260px] text-center">
              <AlertCircle className="h-6 w-6 text-rose-600" />
              <p className="text-xs font-semibold">Errore anteprima</p>
              <p className="text-[10px] text-muted-foreground">{errorMsg}</p>
              <Button size="sm" variant="outline" onClick={() => void generate()} className="mt-1 h-7 text-[11px]">
                Riprova
              </Button>
            </div>
          </div>
        )}
        {status === "ready" && (
          <div className="flex flex-col items-center gap-3 py-3 px-3">
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
              <div
                key={pageNum}
                data-page-wrap={pageNum}
                className={
                  "bg-white shadow-md rounded-sm mx-auto transition-shadow " +
                  (highlightedPage === pageNum ? "ring-2 ring-orange-400 ring-offset-2 ring-offset-muted" : "")
                }
              >
                <canvas data-page={pageNum} className="block h-auto" aria-label={`Pagina ${pageNum} di ${pageCount}`} />
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground italic">
              {pageCount} {pageCount === 1 ? "pagina" : "pagine"} · anteprima a bassa risoluzione · scarica per l'alta qualità
            </p>
          </div>
        )}
        {status === "idle" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[11px] text-muted-foreground">In attesa…</p>
          </div>
        )}
      </div>
    </div>
  );
}
