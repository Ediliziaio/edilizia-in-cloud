/**
 * SerramentiTemplatePreviewDialog — Anteprima PDF live nel template editor.
 *
 * Genera un PDF demo con dati cliente fittizi + template corrente, poi lo
 * RENDERIZZA pagina-per-pagina come <canvas> tramite pdfjs-dist.
 *
 * Perché canvas e non <iframe>/<object>:
 *   - Brave Shields, ad blocker e Chrome con shield aggressivo BLOCCANO gli
 *     iframe/object con blob: URL. L'utente vedeva "Questi contenuti sono
 *     bloccati. Contatta il proprietario del sito".
 *   - Canvas rendering è 100% client-side, nessuna fetch, nessun blocco.
 *     pdfjs.getDocument(arrayBuffer) lavora direttamente sui byte del PDF.
 *
 * Caratteristiche:
 *  - Generazione debounced (300ms) sui cambi di template
 *  - Dynamic import di @react-pdf/renderer (~740 KB) E di pdfjs-dist
 *  - Stati espliciti: idle / loading / ready / error
 *  - Bottoni "Aggiorna" (force regen) + "Scarica" + "Apri in nuova scheda"
 *  - Cleanup automatico dei blob URL al cambio o alla chiusura
 */
import { useEffect, useState, useRef } from "react";
import { Loader2, RefreshCw, Download, AlertCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { SrTemplatePdfRow } from "@/types/serramenti";
import { buildMockPdfData } from "@/lib/serramenti/mockPdfData";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Template corrente in edit (anche con modifiche non salvate). */
  template: Partial<SrTemplatePdfRow> | null;
  /** Nome azienda visualizzato come default in cover. */
  companyName?: string | null;
  companyLogoUrl?: string | null;
  companyIndirizzo?: string | null;
}

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; blobUrl: string; pageCount: number }
  | { status: "error"; message: string };

export function SerramentiTemplatePreviewDialog({
  open, onOpenChange, template,
  companyName, companyLogoUrl, companyIndirizzo,
}: Props) {
  const [state, setState] = useState<PreviewState>({ status: "idle" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBlobUrlRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const generate = async () => {
    setState({ status: "loading" });
    try {
      // Dynamic import per code-splitting (vendor-pdf chunk ~740 KB +
      // pdfjs ~300 KB caricati solo al primo click "Anteprima PDF").
      const [{ pdf }, { SerramentoPDF }, React, pdfjsLib] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/serramenti/SerramentoPDF"),
        import("react"),
        import("pdfjs-dist"),
      ]);

      // pdfjs richiede un worker URL. Usiamo quello bundled con la libreria.
      // Senza questo si vede errore "GlobalWorkerOptions.workerSrc undefined".
      const workerSrc = (await import(
        // @ts-expect-error - vite handles ?url import
        "pdfjs-dist/build/pdf.worker.min.mjs?url"
      )).default as string;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

      // 1. Genera PDF blob via @react-pdf/renderer
      const enriched = await buildMockPdfData({
        template,
        companyName,
        companyLogoUrl,
        companyIndirizzo,
      });
      const element = React.createElement(SerramentoPDF, enriched);
      const blob = await pdf(element).toBlob();

      // 2. Cleanup precedente blob URL + crea nuovo
      if (lastBlobUrlRef.current) {
        URL.revokeObjectURL(lastBlobUrlRef.current);
      }
      const blobUrl = URL.createObjectURL(blob);
      lastBlobUrlRef.current = blobUrl;

      // 3. Carica PDF in pdfjs per estrarre il page count.
      //    Le pagine vere vengono renderizzate sotto via useEffect dopo che
      //    `state` diventa "ready" e i ref dei canvas sono nel DOM.
      const arrayBuffer = await blob.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pageCount = pdfDoc.numPages;

      setState({ status: "ready", blobUrl, pageCount });

      // 4. Renderizza ogni pagina su un canvas
      // useEffect sotto si occuperà del rendering effettivo perché serve
      // attendere che i <canvas> ref siano disponibili nel DOM.
      // Conserviamo il pdfDoc per usarlo dopo.
      pdfDocRef.current = pdfDoc;
    } catch (err) {
      console.error("[template-preview] errore generazione PDF:", err);
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      setState({ status: "error", message: msg });
    }
  };

  // Ref al documento pdfjs caricato (per render pages dopo il setState ready)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef = useRef<any>(null);

  // Render delle pagine quando lo state diventa "ready"
  useEffect(() => {
    if (state.status !== "ready" || !pdfDocRef.current) return;
    const pdfDoc = pdfDocRef.current;
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    (async () => {
      // Determina la scala in base alla larghezza disponibile.
      // PDF A4 = 595pt × 842pt. Vogliamo width ≈ container width.
      const containerWidth = container.clientWidth || 800;
      const A4_WIDTH_PT = 595;
      const scale = Math.min(2.0, (containerWidth - 32) / A4_WIDTH_PT);

      for (let i = 1; i <= state.pageCount; i++) {
        if (cancelled) return;
        const canvas = container.querySelector<HTMLCanvasElement>(`canvas[data-page="${i}"]`);
        if (!canvas) continue;
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      }
    })().catch((e) => {
      console.error("[template-preview] errore render pagine:", e);
    });

    return () => {
      cancelled = true;
    };
  }, [state]);

  // Generate UNA VOLTA all'apertura del dialog.
  //
  // PERF FIX: rimosso il live-update su `JSON.stringify(template)` che faceva
  // serializzare l'intero template ad ogni keystroke nel form padre →
  // re-render + rigenerazione PDF (740 KB di runtime) ad ogni carattere
  // digitato. Latenza inputs orribile.
  //
  // Comportamento nuovo: alla apertura genera UNA volta; per aggiornare
  // l'anteprima dopo modifiche, l'utente clicca esplicitamente "Aggiorna".
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void generate();
    }, 100);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cleanup blob URL alla chiusura del dialog
  useEffect(() => {
    if (!open && lastBlobUrlRef.current) {
      URL.revokeObjectURL(lastBlobUrlRef.current);
      lastBlobUrlRef.current = null;
      pdfDocRef.current = null;
      setState({ status: "idle" });
    }
  }, [open]);

  const handleDownload = () => {
    if (state.status !== "ready") return;
    const a = document.createElement("a");
    a.href = state.blobUrl;
    a.download = "anteprima-template.pdf";
    a.click();
    toast.success("Anteprima scaricata");
  };

  const handleOpenInTab = () => {
    if (state.status !== "ready") return;
    window.open(state.blobUrl, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 pb-3 border-b">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-base">Anteprima PDF preventivo</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Generato con dati cliente fittizi e tutte le personalizzazioni
                correnti del template (anche quelle non ancora salvate). Clicca
                "Aggiorna" per rigenerare con le ultime modifiche.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void generate()}
                disabled={state.status === "loading"}
                className="h-8 gap-1.5"
              >
                {state.status === "loading" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span className="text-xs">Aggiorna</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleOpenInTab}
                disabled={state.status !== "ready"}
                className="h-8 gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="text-xs hidden sm:inline">Apri in tab</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownload}
                disabled={state.status !== "ready"}
                className="h-8 gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="text-xs">Scarica</span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 bg-muted/40 overflow-auto relative" ref={containerRef}>
          {state.status === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 z-10">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-orange-600" />
                <p className="text-xs text-muted-foreground">Genero anteprima PDF…</p>
              </div>
            </div>
          )}
          {state.status === "error" && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="flex flex-col items-center gap-2 max-w-md text-center">
                <AlertCircle className="h-8 w-8 text-rose-600" />
                <p className="text-sm font-semibold">Errore generazione anteprima</p>
                <p className="text-xs text-muted-foreground">{state.message}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void generate()}
                  className="mt-2"
                >
                  Riprova
                </Button>
              </div>
            </div>
          )}
          {state.status === "ready" && (
            <div className="flex flex-col items-center gap-4 py-4 px-4">
              {/* Renderizziamo un canvas per ogni pagina. useEffect sopra
                  popola width/height + contenuto canvas via pdfjs.render().
                  Niente iframe/object → nessun blocker browser. */}
              {Array.from({ length: state.pageCount }, (_, i) => i + 1).map((pageNum) => (
                <div
                  key={pageNum}
                  className="bg-white shadow-md rounded-sm"
                  style={{ maxWidth: "100%" }}
                >
                  <canvas
                    data-page={pageNum}
                    className="block max-w-full h-auto"
                    aria-label={`Anteprima pagina ${pageNum} di ${state.pageCount}`}
                  />
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground italic">
                {state.pageCount} {state.pageCount === 1 ? "pagina" : "pagine"} ·
                Anteprima a bassa risoluzione · scarica per vedere alta qualità
              </p>
            </div>
          )}
          {state.status === "idle" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-xs text-muted-foreground">Apri di nuovo per generare l'anteprima.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
