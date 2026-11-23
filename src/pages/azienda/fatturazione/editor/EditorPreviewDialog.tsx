import { useCallback, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Printer } from "lucide-react";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { useAuth } from "@/contexts/AuthContext";
import { PreviewFattura } from "@/components/fatturazione/PreviewFattura";
import { FoglioFatturaAdattabile } from "@/components/fatturazione/FoglioFatturaAdattabile";
import { AnteprimaXmlFattura } from "@/components/fatturazione/AnteprimaXmlFattura";
import { TIPI_SDI } from "@/lib/fatturazione/sdiCassetto";
import { downloadNativePDF } from "@/lib/fatturazione/generatePDF";
import { toast } from "sonner";
import type { EditorState } from "./useEditorState";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  state: EditorState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditorPreviewDialog({ state, open, onOpenChange }: Props) {
  const t = useT();
  const { data: azienda } = useAnagraficaAzienda();
  const { effectiveCompany } = useAuth();
  const previewRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  // Le due anteprime: il PDF che legge il cliente e il file XML che parte allo SDI.
  const [vista, setVista] = useState<"pdf" | "xml">("pdf");
  const xmlDisponibile = TIPI_SDI.includes(state.tipo) && !["preventivo", "proforma", "ddt"].includes(state.tipo);
  const mostraXml = vista === "xml" && xmlDisponibile;

  const handlePrint = useCallback(() => {
    const el = previewRef.current;
    if (!el) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((s) => s.outerHTML)
      .join("\n");
    printWindow.document.write(`<!DOCTYPE html><html><head>${styles}<style>
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @media print {
        body { margin: 0; }
        /* Margine di pagina zero: Chrome non aggiunge data, titolo, indirizzo e «1/1»
           (vedi CSS_PAGINA_STAMPA in _shared/documentoFiscaleVista.ts). Il respiro
           lo dà il padding del foglio, ripetuto su ogni pagina. */
        @page { size: A4; margin: 0; }
        .preview-fattura-scale { transform: none !important; }
        .preview-fattura-sheet { width: auto !important; min-height: auto !important; margin: 0 !important; border: none !important; box-shadow: none !important; border-radius: 0 !important; }
      }
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
      toast.info(t("Stampa richiesta"), { description: t("Per salvare il file scegli «Salva come PDF» nel dialogo del browser. Il file non viene scaricato automaticamente."), duration: 12000 });
    } catch (err) {
      toast.error(t("Errore generazione PDF"), { description: err instanceof Error ? err.message : undefined });
    } finally {
      setPdfLoading(false);
    }
  }, [state.id, state.numero]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`flex h-[90dvh] flex-col gap-0 overflow-hidden p-0 ${mostraXml ? "max-w-5xl" : "max-w-4xl"}`}>
        <DialogHeader className="shrink-0 space-y-2 border-b px-4 py-3 pr-12 text-left">
          <DialogTitle className="text-sm font-medium">
            {t("Anteprima — {numero}", { numero: state.numero || t("Documento") })}
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-2">
            {xmlDisponibile && (
              <div className="mr-1 flex rounded-md border p-0.5">
                {([["pdf", "PDF"], ["xml", "XML allo SDI"]] as const).map(([v, etichetta]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVista(v)}
                    aria-pressed={vista === v}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${vista === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {t(etichetta)}
                  </button>
                ))}
              </div>
            )}
            {!mostraXml && <>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-3 w-3 mr-1.5" />
                {t("Stampa")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label={t("Apri PDF per la stampa")}
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
            </>}
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-2 sm:p-4">
          {mostraXml ? (
            <AnteprimaXmlFattura documento={state} azienda={azienda ?? null} mostraStampa />
          ) : (
            <FoglioFatturaAdattabile>
              <div ref={previewRef}>
                <PreviewFattura documento={state} azienda={azienda ?? null} logoAziendale={effectiveCompany?.logo_url} scale={1} />
              </div>
            </FoglioFatturaAdattabile>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
