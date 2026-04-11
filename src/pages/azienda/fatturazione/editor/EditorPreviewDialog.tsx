import { useCallback, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Printer } from "lucide-react";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { PreviewFattura } from "@/components/fatturazione/PreviewFattura";
import { downloadNativePDF } from "@/lib/fatturazione/generatePDF";
import { toast } from "sonner";
import type { EditorState } from "./useEditorState";

interface Props {
  state: EditorState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditorPreviewDialog({ state, open, onOpenChange }: Props) {
  const { data: azienda } = useAnagraficaAzienda();
  const previewRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const handlePrint = useCallback(() => {
    const el = previewRef.current;
    if (!el) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((s) => s.outerHTML)
      .join("\n");
    printWindow.document.write(`<!DOCTYPE html><html><head>${styles}<style>
      @media print { body { margin: 0; } @page { size: A4; margin: 10mm; } }
      body { font-family: system-ui, sans-serif; }
    </style></head><body>${el.innerHTML}</body></html>`);
    printWindow.document.close();
    printWindow.onload = () => { printWindow.print(); };
  }, []);

  const handleDownloadPDF = useCallback(async () => {
    if (!state.id) return;
    setPdfLoading(true);
    try {
      await downloadNativePDF(state.id, state.numero || undefined);
      toast.success("PDF generato");
    } catch (err: any) {
      toast.error("Errore generazione PDF", { description: err.message });
    } finally {
      setPdfLoading(false);
    }
  }, [state.id, state.numero]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between shrink-0">
          <DialogTitle className="text-sm font-medium">
            Anteprima — {state.numero || "Documento"}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handlePrint}>
              <Printer className="h-3 w-3 mr-1.5" />
              Stampa
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleDownloadPDF}
              disabled={pdfLoading || !state.id}
            >
              {pdfLoading ? (
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-3 w-3 mr-1.5" />
              )}
              PDF
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto bg-muted/30 p-6 flex justify-center">
          <div ref={previewRef}>
            <PreviewFattura documento={state} azienda={azienda ?? null} scale={0.85} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
