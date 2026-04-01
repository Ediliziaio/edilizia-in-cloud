/**
 * PrintPreviewModal — mostra un documento HTML in un iframe e lo stampa.
 *
 * Perché non window.open():
 *   Safari su iOS blocca window.open() quando chiamato fuori da un handler utente
 *   sincrono (es. dentro una Promise/async). L'iframe non è soggetto a questa
 *   limitazione, quindi funziona sia su desktop che su mobile.
 */
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download, X } from "lucide-react";

interface Props {
  /** HTML completo della pagina da stampare (incluso <html>, <head> e <body>). */
  htmlContent: string;
  /** Nome file suggerito per il download (senza estensione). */
  fileName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
}

export function PrintPreviewModal({
  htmlContent,
  fileName = "documento",
  open,
  onOpenChange,
  title = "Anteprima documento",
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  // Inject HTML into iframe when content changes or dialog opens
  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }
    const iframe = iframeRef.current;
    if (!iframe) return;

    setReady(false);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(htmlContent);
    doc.close();

    const handleLoad = () => setReady(true);
    iframe.addEventListener("load", handleLoad);
    // Fallback: mark ready after 1.5 s even if load doesn't fire
    const timeout = setTimeout(() => setReady(true), 1500);

    return () => {
      iframe.removeEventListener("load", handleLoad);
      clearTimeout(timeout);
    };
  }, [open, htmlContent]);

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  };

  const handleDownload = () => {
    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="flex flex-row items-center justify-between px-4 py-3 border-b shrink-0">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownload}
              disabled={!ready}
              aria-label="Scarica documento"
            >
              <Download className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Scarica
            </Button>
            <Button
              size="sm"
              onClick={handlePrint}
              disabled={!ready}
              aria-label="Stampa documento"
            >
              <Printer className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Stampa
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => onOpenChange(false)}
              aria-label="Chiudi anteprima"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 relative bg-muted/20">
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-label="Caricamento documento..." />
            </div>
          )}
          <iframe
            ref={iframeRef}
            title={title}
            className="w-full h-full border-0"
            sandbox="allow-same-origin allow-modals"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
