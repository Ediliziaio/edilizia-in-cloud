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
 *    l'anteprima risolve il segnalibro semantico del capitolo nei metadati PDF.
 *    Titoli modificati, pagine nascoste e ordine dinamico non cambiano la chiave.
 *  - Zoom + adatta larghezza.
 *  - Refresh fluido: mantiene le pagine vecchie durante la rigenerazione + barra
 *    di avanzamento; niente sfarfallio.
 *
 * Pipeline: @react-pdf/renderer → blob → pdfjs → render pagina-per-pagina su
 * <canvas> (niente iframe → nessun blocco browser).
 */
import { useEffect, useState, useRef, useMemo, type ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { Loader2, RefreshCw, Download, AlertCircle, ExternalLink, Eye, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { SrTemplatePdfRow } from "@/types/serramenti";
import { buildMockPdfData } from "@/lib/serramenti/mockPdfData";
import type { SerramentiTemplateModuleId } from "@/lib/moduli-vendita/serramentiTemplateModules";

import { useIsMobile } from "@/hooks/use-mobile";
import { srEditorPreviewSection, srPreviewPage } from "./srSemanticPreview";
interface Props {
  moduleId?: SerramentiTemplateModuleId;
  /** Template corrente in edit (anche con modifiche non salvate). */
  template: Partial<SrTemplatePdfRow> | null;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  companyLogoDarkUrl?: string | null;
  companyBrandColor?: string | null;
  companyIndirizzo?: string | null;
  /** Sezione attiva nell'editor → usata per l'auto-scroll alla pagina PDF. */
  activeSection?: string | null;
}

type Status = "idle" | "loading" | "ready" | "error";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.25;

export function SerramentiLivePreviewPanel({
  moduleId,
  template,
  companyName,
  companyLogoUrl,
  companyLogoDarkUrl,
  companyBrandColor,
  companyIndirizzo,
  activeSection,
}: Props) {
  const isMobile = useIsMobile();
  const [status, setStatus] = useState<Status>("idle");
  const [pageCount, setPageCount] = useState(0);
  const [sectionNotice, setSectionNotice] = useState<{ section: string; text: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [renderNonce, setRenderNonce] = useState(0);
  const [canvasRevision, setCanvasRevision] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [highlightedPage, setHighlightedPage] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef = useRef<any>(null);
  const lastBlobUrlRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const genIdRef = useRef(0);
  const renderedDocRef = useRef<unknown>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const templateKey = useMemo(
    () => JSON.stringify(template) + "|" + (moduleId ?? "") + "|" + (companyName ?? "") + "|" + (companyLogoUrl ?? "") + "|" + (companyLogoDarkUrl ?? "") + "|" + (companyBrandColor ?? "") + "|" + (companyIndirizzo ?? ""),
    [template, moduleId, companyName, companyLogoUrl, companyLogoDarkUrl, companyBrandColor, companyIndirizzo],
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
        "pdfjs-dist/build/pdf.worker.min.mjs?url"
      )).default as string;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

      const enriched = await buildMockPdfData({
        template, moduleId, companyName, companyLogoUrl, companyLogoDarkUrl, companyBrandColor, companyIndirizzo,
      });
      // SerramentoPDF returns a Document; react-pdf's API only types the root props.
      const element = React.createElement(SerramentoPDF, enriched) as unknown as ReactElement<DocumentProps>;
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
    debounceRef.current = setTimeout(() => void generate(), 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey]);

  // The compact workspace hides the preview without unmounting it. Wait for
  // real width and rerender/resync when revealed, retaining the chosen zoom.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => setContainerWidth(container.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [status]);

  // Render delle pagine su canvas dopo ogni generazione riuscita o cambio zoom.
  useEffect(() => {
    if (status !== "ready" || !pdfDocRef.current) return;
    const pdfDoc = pdfDocRef.current;
    const container = containerRef.current;
    if (!container || containerWidth <= 0) return;
    renderedDocRef.current = null;

    let cancelled = false;
    (async () => {
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
      if (!cancelled) {
        renderedDocRef.current = pdfDoc;
        setCanvasRevision(n => n + 1);
      }
    })().catch((e) => console.error("[live-preview] errore render pagine:", e));

    return () => { cancelled = true; };
  }, [renderNonce, status, pageCount, zoom, containerWidth]);

  // Resolve metadata only after canvas sizes settle; no text or page-number guesses.
  useEffect(() => {
    if (status !== "ready" || !activeSection) return;
    const container = containerRef.current;
    const pdfDoc = pdfDocRef.current;
    if (!container || !pdfDoc || containerWidth <= 0 || renderedDocRef.current !== pdfDoc) return;
    const section = srEditorPreviewSection(activeSection);
    if (!section) return;

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

    (async () => {
      const page = await srPreviewPage(pdfDoc, section);
      if (cancelled || pdfDocRef.current !== pdfDoc) return;
      const present = page !== null && Number.isInteger(page) && page >= 1 && page <= pdfDoc.numPages;
      setSectionNotice({ section: activeSection, text: present ? `Sezione selezionata · pagina ${page} di ${pdfDoc.numPages}` : "Sezione non presente in questo PDF: vista mantenuta." });
      if (present) scrollToPage(page);
    })().catch(() => {
      if (!cancelled && pdfDocRef.current === pdfDoc) setSectionNotice({ section: activeSection, text: "Posizione della sezione non disponibile: vista mantenuta." });
    });

    return () => { cancelled = true; };
  }, [activeSection, canvasRevision, status, containerWidth]);

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
    a.download = moduleId ? `anteprima-${moduleId}.pdf` : "anteprima-template.pdf";
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

      {status === "ready" && sectionNotice?.section === activeSection && <p role="status" className="shrink-0 border-b px-3 py-1 text-[10px] text-muted-foreground">{sectionNotice.text}</p>}
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
