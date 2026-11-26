import { useDocumentoAffiancato } from "./contestoConfrontoDocumenti";
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
import { ComandiDocumento } from "./ConfrontoDocumentiLayout";
import { ZoomDocumento } from "./ZoomDocumento";
import { scalaDocumento, type AdattamentoDocumento } from "./zoomDocumentoLayout";
import { useIsMobile } from "@/hooks/use-mobile";
import { readPdfPreview, readPdfPreviewBlob, revokePdfPreviewUrl } from "@/lib/pdfPreviewSource";
import { Capacitor } from "@capacitor/core";
import { condividiFile } from "@/lib/mobile/condividiFile";
import { apriDocumentoDopoAttesa } from "@/lib/campo/apriDocumento";
import { toast } from "sonner";
import { edileEditorDestinations, resolveEdileSectionPage, type SectionDestinationDocument } from "@/components/preventivi/pdf/sectionDestinations";
import { resolvePdfDestination } from "@/lib/pdfDestination";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.25;
const A4_WIDTH_PT = 595;

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
  container.hasAttribute("data-pdf-page-inset") && canvas.offsetParent === container
    ? canvas.offsetTop
    : canvas.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;

function capturePosition(container: HTMLDivElement): ViewPosition {
  const canvases = Array.from(container.querySelectorAll<HTMLCanvasElement>("canvas[data-page]"));
  // Il margine sopra la pagina può includere una frazione del foglio precedente.
  const visibleTop = container.scrollTop + Number(container.dataset.pdfPageInset ?? 0);
  const canvas = canvases.find(item => canvasTop(container, item) + item.getBoundingClientRect().height > visibleTop)
    ?? canvases.at(-1);
  return {
    page: Number(canvas?.dataset.page ?? 1), left: container.scrollLeft, top: container.scrollTop,
    fraction: canvas ? (container.scrollTop - canvasTop(container, canvas)) / Math.max(1, canvas.getBoundingClientRect().height) : 0,
  };
}

function restorePosition(container: HTMLDivElement, position: ViewPosition, pageCount: number, wholePageInset?: number) {
  const page = Math.min(pageCount, Math.max(1, position.page));
  const canvas = container.querySelector<HTMLCanvasElement>(`canvas[data-page="${page}"]`);
  if (canvas && wholePageInset !== undefined) {
    container.scrollTop = Math.max(0, canvasTop(container, canvas) - wholePageInset);
  } else {
    container.scrollTop = position.top === 0 && page === 1 ? 0 : canvas ? Math.max(0, canvasTop(container, canvas) + position.fraction * canvas.getBoundingClientRect().height) : position.top;
  }
  container.scrollLeft = wholePageInset === undefined ? position.left : 0;
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
  /** Singola voce: pagina e posizione native, senza rigenerare per la sola selezione. */
  activeDestination?: string | null;
  destinationLabel?: string;
  destinationRequest?: number;
  /** Costruisce (async) il blob URL del PDF con mock + template correnti. */
  renderBlobUrl: () => Promise<string>;
  /** Chiave che rappresenta lo stato visivo: quando cambia, rigenera (debounced). */
  depsKey: string;
  /** Abilita la generazione solo quando true (es. companyId disponibile). */
  enabled?: boolean;
  debounceMs?: number;
  /** Classe colore accent per il titolo (default arancio). */
  accentClass?: string;
  downloadFileName?: string;
  downloadButtonLabel?: string;
  requireRenderedDownload?: boolean;
  showDownloadOnMobile?: boolean;
  allowOpenInNewTab?: boolean;
  headerLabel?: string;
  /** Dimensiona ogni pagina entro larghezza e altezza disponibili. Lo zoom parte da questa vista. */
  fitWholePage?: boolean;
}

export function PdfBlobLivePreviewPanel({
  activeSection,
  activeDestination,
  destinationLabel = "Voce selezionata",
  destinationRequest = 0,
  renderBlobUrl,
  depsKey,
  enabled = true,
  debounceMs = 500,
  accentClass = "text-orange-600",
  downloadFileName = "anteprima-template.pdf",
  downloadButtonLabel,
  requireRenderedDownload = false,
  showDownloadOnMobile = false,
  allowOpenInNewTab = true,
  headerLabel = "Anteprima live PDF",
  fitWholePage = false,
}: Props) {
  const t = useT();
  // Debounce, timeout, corsa tra generazioni e revoca dei blob: tutto nell'hook
  // condiviso, così ogni pannello (compreso il Fotovoltaico) eredita
  // le stesse protezioni invece di riscriverle — o dimenticarle.
  const scartaBlob = useCallback((u: string) => {
    revokePdfPreviewUrl(u);
  }, []);
  const { risultato: url, caricamento: loading, errore: error, rigenera: forceRegen, aggiornato } =
    useGenerazioneProtetta<string>(renderBlobUrl, depsKey, {
      abilitato: enabled,
      debounceMs,
      onScarta: scartaBlob,
    });
  const isMobile = useIsMobile();
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [paintedUrl, setPaintedUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [renderNonce, setRenderNonce] = useState(0);
  const affiancato = useDocumentoAffiancato();
  const adattabile = affiancato || fitWholePage;
  const [zoom, setZoom] = useState(1);
  const [adatta, setAdatta] = useState<AdattamentoDocumento>("pagina");
  const wholePage = fitWholePage && zoom === 1;
  const pageInset = affiancato ? 8 : 12;
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [sectionStatus, setSectionStatus] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pdfDocRef = useRef<PdfDocumentHandle | null>(null);
  const documentUrlRef = useRef<string | null>(null);
  const renderTokenRef = useRef(0);
  const navigationTokenRef = useRef(0);
  const invalidateNavigation = useCallback(() => { ++navigationTokenRef.current; }, []);
  const pendingPositionRef = useRef<ViewPosition | null>(null);
  const lastVisiblePositionRef = useRef<ViewPosition | null>(null);
  const layoutRef = useRef<{ document: PdfDocumentHandle; position: ViewPosition } | null>(null);
  const lastNavigationRef = useRef<{ document: PdfDocumentHandle; section: string; page: number; request: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const width = container.clientWidth;
      if (width === 0) pendingPositionRef.current = lastVisiblePositionRef.current;
      setViewportWidth(width);
      if (affiancato || fitWholePage) setViewportHeight(container.clientHeight);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [affiancato, fitWholePage]);

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
    // Capture the Blob BEFORE lazy imports or a newer generation revokes its URL.
    const source = readPdfPreview(url);

    (async () => {
      try {
        // Rimandiamo il reset al ciclo asincrono della nuova generazione: evita
        // di mantenere per un frame la pagina precedente senza chiamare setState
        // direttamente nel corpo dell'effect.
        await Promise.resolve();
        if (cancelled) return;
        setPdfError(null);
        const [pdfjsLib, workerModule, data] = await Promise.all([
          import("pdfjs-dist"),
          import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
          source,
        ]);
        if (cancelled) return;
        // In produzione `?url` dà l'indirizzo del worker. Il server di sviluppo, quando ha già ottimizzato
        // pdfjs, a volte restituisce il modulo stesso e pdf.js rifiuta il valore («Invalid workerSrc type»,
        // 07/11/2026): lì il file si prende direttamente da node_modules, che il server di sviluppo serve.
        const indirizzoWorker = typeof workerModule.default === "string"
          ? workerModule.default
          : import.meta.env.DEV ? "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs" : null;
        if (!indirizzoWorker) throw new Error("Il visore dei PDF non si è caricato: ricarica la pagina.");
        pdfjsLib.GlobalWorkerOptions.workerSrc = indirizzoWorker;
        const doc = await pdfjsLib.getDocument({ data }).promise;
        ownedDocument = doc as PdfDocumentHandle;

        if (cancelled || token !== renderTokenRef.current) {
          disposePdfDocument(doc as PdfDocumentHandle);
          return;
        }
        pdfDocRef.current = doc as PdfDocumentHandle;
        documentUrlRef.current = url;
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
    if (!container || container.clientWidth <= 24 || ((fitWholePage || affiancato) && viewportHeight <= pageInset * 2)) return;
    let cancelled = false;
    let renderTask: ReturnType<PdfPageHandle["render"]> | null = null;
    const position = pendingPositionRef.current ?? capturePosition(container);
    pendingPositionRef.current = null;
    ++navigationTokenRef.current;
    layoutRef.current = null;

    (async () => {
      const containerWidth = container.clientWidth;
      if (containerWidth <= 24) return;
      const availableWidth = containerWidth - pageInset * 2;
      const pages = await Promise.all(Array.from({ length: pageCount }, (_, i) => pdfDocument.getPage(i + 1)));
      if (cancelled || pdfDocRef.current !== pdfDocument) return;
      const viewports = pages.map(page => {
        if (affiancato && !fitWholePage) {
          const scale = scalaDocumento(page.getViewport({ scale: 1 }), { width: containerWidth, height: viewportHeight }, adatta);
          return page.getViewport({ scale: scale * zoom });
        }
        if (!fitWholePage) {
          const fitScale = Math.min(1.6, Math.max(0.4, availableWidth / A4_WIDTH_PT));
          return page.getViewport({ scale: fitScale * zoom });
        }
        const size = page.getViewport({ scale: 1 });
        const fitScale = Math.min(1.6, availableWidth / size.width, (viewportHeight - pageInset * 2) / size.height);
        return page.getViewport({ scale: fitScale * zoom });
      });
      // Size EVERY page before scrolling: sequential canvas growth previously
      // displaced later pages while a selected destination was being reached.
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
        const canvas = container.querySelector<HTMLCanvasElement>(`canvas[data-page="${pageNumber}"]`);
        if (!canvas) continue;
        const viewport = viewports[pageNumber - 1];
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = fitWholePage ? `${viewport.height}px` : "";
        canvas.style.maxWidth = zoom <= 1 ? "100%" : "none";
      }
      restorePosition(container, position, pageCount, wholePage ? pageInset : undefined);
      lastVisiblePositionRef.current = capturePosition(container);
      layoutRef.current = { document: pdfDocument, position };
      setLayoutRevision(value => value + 1);
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
        if (cancelled || pdfDocRef.current !== pdfDocument) return;
        const canvas = container.querySelector<HTMLCanvasElement>(`canvas[data-page="${pageNumber}"]`);
        if (!canvas) continue;
        const page = pages[pageNumber - 1];
        const viewport = viewports[pageNumber - 1];
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
      if (!cancelled && pdfDocRef.current === pdfDocument) setPaintedUrl(documentUrlRef.current);
    })().catch((err) => {
      if (!cancelled) {
        console.error("[live-preview] errore render pagine:", err);
        setPdfError("Impossibile disegnare il PDF generato. Riprova.");
      }
    });

    return () => { cancelled = true; renderTask?.cancel?.(); invalidateNavigation(); };
  }, [renderNonce, pageCount, zoom, viewportWidth, viewportHeight, adatta, affiancato, fitWholePage, wholePage, pageInset, invalidateNavigation]);

  useEffect(() => {
    const token = ++navigationTokenRef.current;
    const container = containerRef.current;
    const layout = layoutRef.current;
    if (!container || container.clientWidth <= 24 || !layout || layout.document !== pdfDocRef.current) return;
    if (!activeDestination && !edileEditorDestinations(activeSection).length) {
      lastNavigationRef.current = null;
      return;
    }
    const identity = activeDestination ?? activeSection!;
    const target: ReturnType<typeof resolvePdfDestination> = activeDestination ? resolvePdfDestination(layout.document, activeDestination)
      : resolveEdileSectionPage(layout.document, activeSection).then((page): Awaited<ReturnType<typeof resolvePdfDestination>> => page == null ? null : { page, top: null });
    void target.then(async destination => {
      let offset = 0;
      if (destination?.top != null && !wholePage) {
        const page = await layout.document.getPage(destination.page);
        const height = page.getViewport({ scale: 1 }).height;
        offset = height > 0 ? Math.min(1, Math.max(0, (height - destination.top) / height)) : 0;
      }
      if (token !== navigationTokenRef.current || layout.document !== pdfDocRef.current) return;
      if (destination === null) {
        setSectionStatus(activeDestination ? t("Voce non presente in questo PDF: vista mantenuta.") : t("Sezione non presente in questo PDF: vista mantenuta."));
        lastNavigationRef.current = null;
        return;
      }
      const { page } = destination;
      const previous = lastNavigationRef.current;
      if (!previous || previous.section !== identity || (activeDestination && (previous.document !== layout.document || previous.request !== destinationRequest))) {
        const canvas = container.querySelector<HTMLCanvasElement>(`canvas[data-page="${page}"]`);
        // Scroll this panel only, never the editor/browser window. PDF.js gets
        // the page from the native destination; no text search or fixed index.
        if (canvas) container.scrollTop = Math.max(0, canvasTop(container, canvas) + offset * canvas.getBoundingClientRect().height - (wholePage ? pageInset : 12));
      } else if (previous.document !== layout.document) {
        // Stay at the user's offset within the selected chapter after edits,
        // even when preceding content gained/lost pages. Zoom is independent.
        restorePosition(container, { ...layout.position, page: page + layout.position.page - previous.page }, layout.document.numPages, wholePage ? pageInset : undefined);
      }
      lastNavigationRef.current = { document: layout.document, section: identity, page, request: destinationRequest };
      lastVisiblePositionRef.current = capturePosition(container);
      setSectionStatus(t("{voce} · pagina {n} di {totale}", { voce: activeDestination ? t(destinationLabel) : t("Sezione selezionata"), n: page, totale: layout.document.numPages }));
    }).catch(() => { /* Una rigenerazione può chiudere il documento durante la risoluzione. */ });
    return invalidateNavigation;
  }, [activeSection, activeDestination, destinationLabel, destinationRequest, layoutRevision, viewportWidth, wholePage, pageInset, invalidateNavigation, t]);

  useEffect(() => () => {
    disposePdfDocument(pdfDocRef.current);
  }, []);

  const previewReady = aggiornato && paintedUrl === url && !error && !pdfError;
  const previewFailed = !!error || !!pdfError;
  const canDownload = !!url && aggiornato && (!requireRenderedDownload || previewReady);
  const [fileActionBusy, setFileActionBusy] = useState(false);
  const handleDownload = async () => {
    if (!url || !canDownload) return;
    if (fileActionBusy) return;
    if (Capacitor.isNativePlatform()) {
      setFileActionBusy(true);
      try { await condividiFile(await readPdfPreviewBlob(url), downloadFileName, downloadFileName); }
      catch { toast.error(t("Impossibile scaricare il PDF. Riprova.")); }
      finally { setFileActionBusy(false); }
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = downloadFileName;
    anchor.click();
  };

  return (
    <div className={affiancato ? "flex h-full min-h-0 flex-col overflow-hidden" : "flex flex-col h-full rounded-lg border bg-card overflow-hidden"}>
      <ComandiDocumento ordine={20}>
      <div className={affiancato ? "flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-1 rounded-md border bg-muted/40 px-2 py-1" : "flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30 shrink-0"}>
        <div className="flex min-w-0 items-center gap-1.5">
          <Eye className={"h-3.5 w-3.5 shrink-0 " + accentClass} />
          <span className={"text-[11px] font-semibold uppercase tracking-wide truncate " + accentClass}>
            {t(headerLabel)}
          </span>
          <span role="status" aria-live="polite" className={adattabile ? "sr-only" : "text-[10px] text-muted-foreground"} data-preview-state={previewFailed?'error':previewReady?'ready':loading || aggiornato?'rendering':'pending'}>{previewFailed ? t("Anteprima non disponibile")
            : fitWholePage ? previewReady ? t("Anteprima pronta") : t("Caricamento anteprima…")
            : previewReady ? t("Aggiornata automaticamente") : loading || aggiornato ? t("Aggiorno il PDF…") : t("Modifiche in attesa di anteprima")}</span>
          {loading && (
            <span className={`inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground ${affiancato ? "sr-only" : ""}`}>
              <Loader2 className="h-3 w-3 animate-spin" /> {t("aggiorno…")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {adattabile ? (
            <ZoomDocumento nome="PDF" zoom={zoom} onZoom={setZoom} adatta={adatta}
              onAdatta={valore => { setAdatta(valore); setZoom(1); }} />
          ) : (
          <div className="flex items-center gap-0.5 mr-1 rounded-md border bg-white px-0.5">
            <Button size="icon" variant="ghost" onClick={() => setZoom((value) => Math.max(ZOOM_MIN, +(value - ZOOM_STEP).toFixed(2)))} disabled={zoom <= ZOOM_MIN} title={t("Riduci")} className="h-6 w-6">
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <button type="button" onClick={() => setZoom(1)} title={fitWholePage ? t("Adatta pagina intera") : t("Adatta alla larghezza")}
              className={fitWholePage ? "h-6 min-w-[68px] rounded px-1.5 text-[11px] tabular-nums hover:bg-blue-50" : "min-w-[32px] text-center text-[10px] tabular-nums text-slate-600 hover:text-orange-600"}>
              {wholePage ? t("Pagina intera") : `${Math.round(zoom * 100)}%`}
            </button>
            <Button size="icon" variant="ghost" onClick={() => setZoom((value) => Math.min(ZOOM_MAX, +(value + ZOOM_STEP).toFixed(2)))} disabled={zoom >= ZOOM_MAX} title={t("Ingrandisci")} className="h-6 w-6">
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            {!fitWholePage && <Button size="icon" variant="ghost" onClick={() => setZoom(1)} title={t("Adatta larghezza")} className="h-6 w-6">
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>}
          </div>
          )}
          <Button size="icon" variant="ghost" onClick={forceRegen} disabled={loading || !enabled} title={t("Aggiorna ora")} className="h-7 w-7">
            <RefreshCw className={"h-3.5 w-3.5 " + (loading ? "animate-spin" : "")} />
          </Button>
          {allowOpenInNewTab && <Button size="icon" variant="ghost" onClick={() => {
            if (aggiornato && url) void apriDocumentoDopoAttesa(async () => url, downloadFileName)
              .then(aperto => { if (!aperto) toast.error(t("Impossibile aprire il PDF. Riprova.")); });
          }} disabled={!url || !aggiornato || fileActionBusy} title={t("Apri documento")} className="h-7 w-7 max-sm:h-11 max-sm:w-11">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>}
          {(!isMobile || showDownloadOnMobile) && (
            <Button size={downloadButtonLabel ? "sm" : "icon"} variant={downloadButtonLabel ? "outline" : "ghost"}
              onClick={() => void handleDownload()} disabled={!canDownload || fileActionBusy} title={downloadButtonLabel ?? t("Scarica PDF")}
              className={downloadButtonLabel ? "h-7 gap-1.5 px-2 text-xs max-sm:h-11" : "h-7 w-7 max-sm:h-11 max-sm:w-11"}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />{downloadButtonLabel}
            </Button>
          )}
        </div>
      </div>
      {sectionStatus && (activeDestination || edileEditorDestinations(activeSection).length > 0) && <p role="status" className="shrink-0 border-b px-3 py-1 text-[10px] text-muted-foreground">{sectionStatus}</p>}
      </ComandiDocumento>
      <div data-confronto-superficie={affiancato ? true : undefined} data-pdf-page-inset={fitWholePage ? pageInset : undefined}
        className={affiancato ? "relative min-h-0 flex-1 overflow-auto rounded border bg-slate-100 p-2" : "relative flex-1 min-h-0 overflow-auto bg-muted/40"}
        style={fitWholePage ? { overflowAnchor: "none", ...(wholePage ? { scrollSnapType: "y mandatory", scrollPaddingBlockStart: pageInset } : {}) } : undefined}
        ref={containerRef} data-pdf-scroll-container onScroll={() => {
        const container = containerRef.current;
        if (container && container.clientWidth > 24) lastVisiblePositionRef.current = capturePosition(container);
      }}>
        {loading && !url && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 p-4 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
              <p className="text-[11px] text-muted-foreground">{t("Genero l'anteprima…")}</p>
            </div>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="flex flex-col items-center gap-2 max-w-[260px] text-center">
              <AlertCircle className="h-6 w-6 text-rose-600" />
              <p className="text-[11px] text-muted-foreground">{error}</p>
              <Button size="sm" variant="outline" onClick={forceRegen} className="mt-1 h-7 text-[11px]">{t("Riprova")}</Button>
            </div>
          </div>
        )}
        {pdfError && !loading && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="flex max-w-[280px] flex-col items-center gap-2 text-center">
              <AlertCircle className="h-6 w-6 text-rose-600" />
              <p className="text-[11px] text-muted-foreground">{t(pdfError)}</p>
              <Button size="sm" variant="outline" onClick={forceRegen} className="mt-1 h-7 text-[11px]">{t("Riprova")}</Button>
            </div>
          </div>
        )}
        {url && !pdfError && pageCount > 0 && (
          <div className={`flex flex-col items-center gap-3${affiancato ? "" : " p-3"}${(affiancato || fitWholePage) ? " w-max min-w-full" : ""}`}>
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
              <div key={pageNumber} className="mx-auto rounded-sm bg-white shadow-md" style={wholePage ? { scrollSnapAlign: "start" } : undefined}>
                <canvas data-page={pageNumber} className="block h-auto" aria-label={t("Pagina {n} di {totale}", { n: String(pageNumber ?? ""), totale: String(pageCount ?? "") })} />
              </div>
            ))}
            <p className="text-[10px] italic text-muted-foreground">
              {t(pageCount === 1 ? "{n} pagina" : "{n} pagine", { n: pageCount })} {t("· anteprima a bassa risoluzione · scarica per l'alta qualità")}
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
            <p className="text-[11px] text-muted-foreground">{t("In attesa…")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
