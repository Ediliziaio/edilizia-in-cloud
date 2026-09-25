/**
 * PdfBlobLivePreviewPanel — pannello anteprima PDF LIVE persistente, condiviso da
 * tutti i vertical che generano il preventivo come BLOB PDF. Le pagine vengono
 * disegnate su canvas tramite pdf.js (Bagni, Ristrutturazione, Elettrico,
 * Termoidraulico, Tetti, Piscine, Pavimenti, Climatizzazione).
 *
 * A differenza del dialog (modale, on-demand), è SEMPRE visibile a lato dell'editor
 * e si rigenera in modo DEBOUNCED ad ogni modifica del template. Il renderer
 * canvas gestisce scroll di tutte le pagine + zoom in modo uniforme tra browser.
 *
 * Il vertical passa una `renderBlobUrl()` (che costruisce i mock + chiama il suo
 * renderXxxPreviewBlobUrl) e una `depsKey` che, cambiando, ritriggera la generazione.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, ExternalLink, Eye, AlertCircle, Download, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGenerazioneProtetta } from "./livePreview/useGenerazioneProtetta";
import { useIsMobile } from "@/hooks/use-mobile";
import { edileEditorDestinations, resolveEdileSectionPage, type SectionDestinationDocument } from "@/components/preventivi/pdf/sectionDestinations";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.25;
const A4_WIDTH_PT = 595;
const BLOB_REVOKE_DELAY_MS = 1200;

type PdfDocumentHandle = SectionDestinationDocument & {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageHandle>;
  destroy?: () => Promise<void> | void;
  cleanup?: () => Promise<void> | void;
};

type PdfPageHandle = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
    canvas: HTMLCanvasElement;
  }) => { promise: Promise<void>; cancel?: () => void };
};

type ViewPosition = { page: number; fraction: number; left: number; top: number };
const canvasTop = (container: HTMLElement, canvas: HTMLCanvasElement) =>
  canvas.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;

function capturePosition(container: HTMLDivElement): ViewPosition {
  const canvases = Array.from(container.querySelectorAll<HTMLCanvasElement>("canvas[data-page]"));
  const canvas = canvases.find(item => canvasTop(container, item) + item.getBoundingClientRect().height > container.scrollTop)
    ?? canvases.at(-1);
  return {
    page: Number(canvas?.dataset.page ?? 1), left: container.scrollLeft, top: container.scrollTop,
    fraction: canvas ? (container.scrollTop - canvasTop(container, canvas)) / Math.max(1, canvas.getBoundingClientRect().height) : 0,
  };
}

function restorePosition(container: HTMLDivElement, position: ViewPosition, pageCount: number) {
  const page = Math.min(pageCount, Math.max(1, position.page));
  const canvas = container.querySelector<HTMLCanvasElement>(`canvas[data-page="${page}"]`);
  container.scrollTop = canvas ? Math.max(0, canvasTop(container, canvas) + position.fraction * canvas.getBoundingClientRect().height) : position.top;
  container.scrollLeft = position.left;
}

/**
 * pdf.js cambia leggermente la superficie del proxy tra versioni/build.
 * Durante un cambio rapido di modulo può inoltre arrivare un handle già
 * chiuso. La pulizia deve quindi essere idempotente e non assumere che
 * `destroy()` esista o ritorni sempre una Promise.
 */
function disposePdfDocument(document: PdfDocumentHandle | null) {
  if (!document) return;
  try {
    const dispose = typeof document.destroy === "function"
      ? document.destroy.bind(document)
      : typeof document.cleanup === "function"
        ? document.cleanup.bind(document)
        : null;
    if (!dispose) return;
    const result = dispose();
    if (result && typeof (result as PromiseLike<unknown>).then === "function") {
      void Promise.resolve(result).catch((): void => {});
    }
  } catch {
    // Il PDF può essere già stato chiuso dalla precedente generazione.
  }
}

interface Props {
  /** Editor section/chapter identity; changing it never regenerates the PDF. */
  activeSection?: string | null;
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
  activeSection,
  renderBlobUrl,
  depsKey,
  enabled = true,
  debounceMs = 500,
  accentClass = "text-orange-600",
}: Props) {
  // Debounce, timeout, corsa tra generazioni e revoca dei blob: tutto nell'hook
  // condiviso, così ogni pannello (compreso il Fotovoltaico, che è HTML) eredita
  // le stesse protezioni invece di riscriverle — o dimenticarle.
  const scartaBlob = useCallback((u: string) => {
    // La generazione successiva può partire mentre pdf.js sta ancora facendo
    // fetch/render del blob corrente. Revocarlo nello stesso tick produce un
    // falso "Failed to fetch" quando si cambia modulo rapidamente.
    window.setTimeout(() => URL.revokeObjectURL(u), BLOB_REVOKE_DELAY_MS);
  }, []);
  const { risultato: url, caricamento: loading, errore: error, rigenera: forceRegen } =
    useGenerazioneProtetta<string>(renderBlobUrl, depsKey, {
      abilitato: enabled,
      debounceMs,
      onScarta: scartaBlob,
    });
  const isMobile = useIsMobile();
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [renderNonce, setRenderNonce] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [sectionStatus, setSectionStatus] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pdfDocRef = useRef<PdfDocumentHandle | null>(null);
  const renderTokenRef = useRef(0);
  const navigationTokenRef = useRef(0);
  const invalidateNavigation = useCallback(() => { ++navigationTokenRef.current; }, []);
  const pendingPositionRef = useRef<ViewPosition | null>(null);
  const lastVisiblePositionRef = useRef<ViewPosition | null>(null);
  const layoutRef = useRef<{ document: PdfDocumentHandle; position: ViewPosition } | null>(null);
  const lastNavigationRef = useRef<{ document: PdfDocumentHandle; section: string; page: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const width = container.clientWidth;
      if (width === 0) pendingPositionRef.current = lastVisiblePositionRef.current;
      setViewportWidth(width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Il visore PDF nativo dentro l'iframe non è consistente tra browser e,
  // nella pagina impostazioni, può restare bianco pur avendo ricevuto il blob.
  // Carichiamo il PDF con pdf.js e disegniamo le pagine su canvas, come già
  // avviene nel pannello Serramenti.
  useEffect(() => {
    if (!url) {
      disposePdfDocument(pdfDocRef.current);
      pdfDocRef.current = null;
      return;
    }

    const token = ++renderTokenRef.current;
    let cancelled = false;
    let ownedDocument: PdfDocumentHandle | null = null;

    (async () => {
      try {
        // Rimandiamo il reset al ciclo asincrono della nuova generazione: evita
        // di mantenere per un frame la pagina precedente senza chiamare setState
        // direttamente nel corpo dell'effect.
        await Promise.resolve();
        if (cancelled) return;
        setPdfError(null);
        const [pdfjsLib, workerModule] = await Promise.all([
          import("pdfjs-dist"),
          import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
        ]);
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default as string;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`PDF non disponibile (${response.status})`);
        const data = await response.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data }).promise;
        ownedDocument = doc as PdfDocumentHandle;

        if (cancelled || token !== renderTokenRef.current) {
          disposePdfDocument(doc as PdfDocumentHandle);
          return;
        }
        pdfDocRef.current = doc as PdfDocumentHandle;
        // Capture before React removes any pages from a shorter next document.
        if (containerRef.current) pendingPositionRef.current = containerRef.current.clientWidth > 0
          ? capturePosition(containerRef.current) : lastVisiblePositionRef.current;
        setPageCount(doc.numPages);
        setRenderNonce((value) => value + 1);
      } catch (err) {
        if (cancelled || token !== renderTokenRef.current) return;
        console.error("[live-preview] impossibile leggere il PDF:", err);
        setPdfError(err instanceof Error ? err.message : "Impossibile leggere il PDF generato");
      }
    })();

    return () => {
      cancelled = true;
      invalidateNavigation();
      disposePdfDocument(ownedDocument);
      if (pdfDocRef.current === ownedDocument) pdfDocRef.current = null;
    };
  }, [url, invalidateNavigation]);

  useEffect(() => {
    const pdfDocument = pdfDocRef.current;
    if (!pdfDocument || pageCount === 0) return;
    const container = containerRef.current;
    if (!container || container.clientWidth <= 24) return;
    let cancelled = false;
    let renderTask: ReturnType<PdfPageHandle["render"]> | null = null;
    const position = pendingPositionRef.current ?? capturePosition(container);
    pendingPositionRef.current = null;
    ++navigationTokenRef.current;
    layoutRef.current = null;

    (async () => {
      const containerWidth = container.clientWidth;
      if (containerWidth <= 24) return;
      const fitScale = Math.min(1.6, Math.max(0.4, (containerWidth - 24) / A4_WIDTH_PT));
      const scale = fitScale * zoom;
      const pages = await Promise.all(Array.from({ length: pageCount }, (_, i) => pdfDocument.getPage(i + 1)));
      if (cancelled || pdfDocRef.current !== pdfDocument) return;
      // Size EVERY page before scrolling: sequential canvas growth previously
      // displaced later pages while a selected destination was being reached.
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
        const canvas = container.querySelector<HTMLCanvasElement>(`canvas[data-page="${pageNumber}"]`);
        if (!canvas) continue;
        const viewport = pages[pageNumber - 1].getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.maxWidth = zoom <= 1 ? "100%" : "none";
      }
      restorePosition(container, position, pageCount);
      lastVisiblePositionRef.current = capturePosition(container);
      layoutRef.current = { document: pdfDocument, position };
      setLayoutRevision(value => value + 1);
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
        if (cancelled || pdfDocRef.current !== pdfDocument) return;
        const canvas = container.querySelector<HTMLCanvasElement>(`canvas[data-page="${pageNumber}"]`);
        if (!canvas) continue;
        const page = pages[pageNumber - 1];
        const viewport = page.getViewport({ scale });
        // Render into a private canvas: rapid zoom/regeneration must never run
        // two PDF.js paint tasks on the same visible canvas.
        const buffer = document.createElement("canvas");
        buffer.width = canvas.width;
        buffer.height = canvas.height;
        const bufferContext = buffer.getContext("2d");
        const context = canvas.getContext("2d");
        if (!context || !bufferContext) continue;
        renderTask = page.render({ canvasContext: bufferContext, viewport, canvas: buffer });
        await renderTask.promise;
        if (cancelled || pdfDocRef.current !== pdfDocument) return;
        context.drawImage(buffer, 0, 0);
      }
    })().catch((err) => {
      if (!cancelled) {
        console.error("[live-preview] errore render pagine:", err);
        setPdfError("Impossibile disegnare il PDF generato. Riprova.");
      }
    });

    return () => { cancelled = true; renderTask?.cancel?.(); invalidateNavigation(); };
  }, [renderNonce, pageCount, zoom, viewportWidth, invalidateNavigation]);

  useEffect(() => {
    const token = ++navigationTokenRef.current;
    const container = containerRef.current;
    const layout = layoutRef.current;
    if (!container || container.clientWidth <= 24 || !layout || layout.document !== pdfDocRef.current) return;
    if (!edileEditorDestinations(activeSection).length) {
      lastNavigationRef.current = null;
      return;
    }
    void resolveEdileSectionPage(layout.document, activeSection).then(page => {
      if (token !== navigationTokenRef.current || layout.document !== pdfDocRef.current) return;
      if (page === null) {
        setSectionStatus("Sezione non presente in questo PDF: vista mantenuta.");
        lastNavigationRef.current = null;
        return;
      }
      const previous = lastNavigationRef.current;
      if (!previous || previous.section !== activeSection) {
        const canvas = container.querySelector<HTMLCanvasElement>(`canvas[data-page="${page}"]`);
        // Scroll this panel only, never the editor/browser window. PDF.js gets
        // the page from the native destination; no text search or fixed index.
        if (canvas) container.scrollTop = Math.max(0, canvasTop(container, canvas) - 12);
      } else if (previous.document !== layout.document) {
        // Stay at the user's offset within the selected chapter after edits,
        // even when preceding content gained/lost pages. Zoom is independent.
        restorePosition(container, { ...layout.position, page: page + layout.position.page - previous.page }, layout.document.numPages);
      }
      lastNavigationRef.current = { document: layout.document, section: activeSection!, page };
      lastVisiblePositionRef.current = capturePosition(container);
      setSectionStatus(`Sezione selezionata · pagina ${page} di ${layout.document.numPages}`);
    });
    return invalidateNavigation;
  }, [activeSection, layoutRevision, viewportWidth, invalidateNavigation]);

  useEffect(() => () => {
    disposePdfDocument(pdfDocRef.current);
  }, []);

  const handleDownload = () => {
    if (!url) return;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "anteprima-template.pdf";
    anchor.click();
  };

  return (
    <div className="flex flex-col h-full rounded-lg border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30 shrink-0">
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
          <div className="flex items-center gap-0.5 mr-1 rounded-md border bg-white px-0.5">
            <Button size="icon" variant="ghost" onClick={() => setZoom((value) => Math.max(ZOOM_MIN, +(value - ZOOM_STEP).toFixed(2)))} disabled={zoom <= ZOOM_MIN} title="Riduci" className="h-6 w-6">
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <button type="button" onClick={() => setZoom(1)} title="Adatta alla larghezza" className="min-w-[32px] text-center text-[10px] tabular-nums text-slate-600 hover:text-orange-600">
              {Math.round(zoom * 100)}%
            </button>
            <Button size="icon" variant="ghost" onClick={() => setZoom((value) => Math.min(ZOOM_MAX, +(value + ZOOM_STEP).toFixed(2)))} disabled={zoom >= ZOOM_MAX} title="Ingrandisci" className="h-6 w-6">
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setZoom(1)} title="Adatta larghezza" className="h-6 w-6">
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button size="icon" variant="ghost" onClick={forceRegen} disabled={loading || !enabled} title="Aggiorna ora" className="h-7 w-7">
            <RefreshCw className={"h-3.5 w-3.5 " + (loading ? "animate-spin" : "")} />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => url && window.open(url, "_blank")} disabled={!url} title="Apri in nuova scheda" className="h-7 w-7">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          {!isMobile && (
            <Button size="icon" variant="ghost" onClick={handleDownload} disabled={!url} title="Scarica PDF" className="h-7 w-7">
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      {sectionStatus && edileEditorDestinations(activeSection).length > 0 && <p role="status" className="shrink-0 border-b px-3 py-1 text-[10px] text-muted-foreground">{sectionStatus}</p>}
      <div className="relative flex-1 min-h-0 overflow-auto bg-muted/40" ref={containerRef} data-pdf-scroll-container onScroll={() => {
        const container = containerRef.current;
        if (container && container.clientWidth > 24) lastVisiblePositionRef.current = capturePosition(container);
      }}>
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
        {pdfError && !loading && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="flex max-w-[280px] flex-col items-center gap-2 text-center">
              <AlertCircle className="h-6 w-6 text-rose-600" />
              <p className="text-[11px] text-muted-foreground">{pdfError}</p>
              <Button size="sm" variant="outline" onClick={forceRegen} className="mt-1 h-7 text-[11px]">Riprova</Button>
            </div>
          </div>
        )}
        {url && !pdfError && pageCount > 0 && (
          <div className="flex flex-col items-center gap-3 px-3 py-3">
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
              <div key={pageNumber} className="mx-auto rounded-sm bg-white shadow-md">
                <canvas data-page={pageNumber} className="block h-auto" aria-label={`Pagina ${pageNumber} di ${pageCount}`} />
              </div>
            ))}
            <p className="text-[10px] italic text-muted-foreground">
              {pageCount} {pageCount === 1 ? "pagina" : "pagine"} · anteprima a bassa risoluzione · scarica per l'alta qualità
            </p>
          </div>
        )}
        {url && !pdfError && pageCount === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
          </div>
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
