/**
 * SerramentiTemplatePreviewDialog — Anteprima PDF live nel template editor.
 *
 * Genera un PDF demo on-the-fly usando il template corrente (con tutte le
 * personalizzazioni in editing, anche non ancora salvate) + dati cliente
 * fittizi. Il blob viene mostrato in un iframe dentro un Dialog modale.
 *
 * Caratteristiche:
 *  - Generazione debounced (300ms) per evitare di rifare il PDF ad ogni
 *    keystroke quando l'utente sta editando.
 *  - Dynamic import di @react-pdf/renderer (code-split, ~740 KB).
 *  - Stato esplicito: loading / ready / error con messaggi chiari.
 *  - cleanup automatico dei blob URL al cambio o alla chiusura per evitare
 *    memory leaks.
 *  - Refresh manuale: bottone "Aggiorna" se l'utente vuole forzare la
 *    rigenerazione.
 */
import { useEffect, useState, useRef } from "react";
import { Loader2, RefreshCw, Download, AlertCircle } from "lucide-react";
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
  | { status: "ready"; blobUrl: string }
  | { status: "error"; message: string };

export function SerramentiTemplatePreviewDialog({
  open, onOpenChange, template,
  companyName, companyLogoUrl, companyIndirizzo,
}: Props) {
  const [state, setState] = useState<PreviewState>({ status: "idle" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBlobUrlRef = useRef<string | null>(null);

  const generate = async () => {
    setState({ status: "loading" });
    try {
      const [{ pdf }, { SerramentoPDF }, React] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/serramenti/SerramentoPDF"),
        import("react"),
      ]);
      const enriched = await buildMockPdfData({
        template,
        companyName,
        companyLogoUrl,
        companyIndirizzo,
      });
      const element = React.createElement(SerramentoPDF, enriched);
      const blob = await pdf(element).toBlob();
      // Cleanup precedente blob URL per evitare memory leak.
      if (lastBlobUrlRef.current) {
        URL.revokeObjectURL(lastBlobUrlRef.current);
      }
      const blobUrl = URL.createObjectURL(blob);
      lastBlobUrlRef.current = blobUrl;
      setState({ status: "ready", blobUrl });
    } catch (err) {
      console.error("[template-preview] errore generazione PDF:", err);
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      setState({ status: "error", message: msg });
    }
  };

  // Generate al mount + ad ogni cambio template (debounced).
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void generate();
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, JSON.stringify(template)]);

  // Cleanup blob URL alla chiusura del dialog.
  useEffect(() => {
    if (!open && lastBlobUrlRef.current) {
      URL.revokeObjectURL(lastBlobUrlRef.current);
      lastBlobUrlRef.current = null;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 pb-3 border-b">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-base">Anteprima PDF preventivo</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Generato con dati cliente fittizi e tutte le personalizzazioni
                correnti del template (anche quelle non ancora salvate). Si aggiorna
                automaticamente quando modifichi i campi.
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

        <div className="flex-1 bg-muted/30 overflow-hidden relative">
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
            <>
              {/* Usiamo <object> invece di <iframe> per la preview PDF.
                  Motivo: Brave Shields, alcuni ad blocker e Chrome con
                  estensioni privacy aggressive bloccano gli iframe con blob:
                  URL → l'utente vede "Questi contenuti sono bloccati".
                  <object> non viene filtrato dalle stesse regole anti-tracking. */}
              <object
                data={state.blobUrl}
                type="application/pdf"
                title="Anteprima PDF preventivo"
                className="w-full h-full border-0"
              >
                {/* Fallback se il browser non sa renderizzare PDF inline
                    (es. Firefox con plugin PDF disattivato, Brave con shield
                    massimo). Mostriamo CTA per aprire in nuova tab. */}
                <div className="absolute inset-0 flex items-center justify-center p-6">
                  <div className="flex flex-col items-center gap-3 max-w-md text-center">
                    <AlertCircle className="h-8 w-8 text-orange-600" />
                    <p className="text-sm font-semibold">
                      Il browser ha bloccato l'anteprima inline
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Alcuni browser (Brave, Chrome con shield/ad-blocker)
                      bloccano il rendering PDF nei dialog. Puoi aprirlo in
                      una nuova scheda o scaricarlo.
                    </p>
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        onClick={() => window.open(state.blobUrl, "_blank")}
                        className="bg-orange-600 hover:bg-orange-700"
                      >
                        Apri in nuova scheda
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDownload}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        Scarica
                      </Button>
                    </div>
                  </div>
                </div>
              </object>
            </>
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
