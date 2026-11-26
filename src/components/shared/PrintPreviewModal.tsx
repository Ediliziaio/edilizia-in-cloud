/**
 * PrintPreviewModal — mostra un documento HTML in un iframe e lo stampa.
 *
 * Perché non window.open():
 *   Safari su iOS blocca window.open() quando chiamato fuori da un handler utente
 *   sincrono (es. dentro una Promise/async). L'iframe non è soggetto a questa
 *   limitazione, quindi funziona sia su desktop che su mobile.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { salvaDocumento } from "@/lib/mobile/salvaDocumento";

interface Props {
  /** HTML completo della pagina da stampare (incluso <html>, <head> e <body>). */
  htmlContent: string;
  /** Nome file suggerito per il download (senza estensione). */
  fileName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  /** Se c'è, «Scarica» dà il PDF costruito da qui (non l'HTML). */
  onDownloadPdf?: () => Promise<Blob>;
  /**
   * Il documento si tiene come PDF, dalla stampa del browser: niente «Scarica», che salverebbe
   * un file HTML con le foto a indirizzo temporaneo.
   */
  soloPdf?: boolean;
}

/** Aspetta le immagini del documento, ma non per sempre: una foto che non arriva non blocca la stampa. */
export async function immaginiCaricate(doc: Pick<Document, "images">, massimoMs = 8000): Promise<void> {
  const inAttesa = Array.from(doc.images).filter((img) => !img.complete);
  if (!inAttesa.length) return;
  await Promise.race([
    Promise.allSettled(inAttesa.map((img) => new Promise<void>((fatto) => {
      img.addEventListener("load", () => fatto(), { once: true });
      img.addEventListener("error", () => fatto(), { once: true });
    }))),
    new Promise<void>((fatto) => setTimeout(fatto, massimoMs)),
  ]);
}

export function PrintPreviewModal({
  htmlContent,
  fileName = "documento",
  open,
  onOpenChange,
  title = "Anteprima documento",
  onDownloadPdf,
  soloPdf = false,
}: Props) {
  const t = useT();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // L'iframe nasce dentro il portale del Dialog DOPO il primo effetto: col solo
  // ref l'effetto trovava null, usciva e non ripartiva più (anteprima vuota e
  // rotella infinita quando la modale si monta già aperta). Con l'elemento nello
  // stato, l'effetto riparte quando l'iframe esiste.
  const [iframeEl, setIframeEl] = useState<HTMLIFrameElement | null>(null);
  const agganciaIframe = useCallback((el: HTMLIFrameElement | null) => {
    iframeRef.current = el;
    setIframeEl(el);
  }, []);
  const [ready, setReady] = useState(false);
  const [attesaImmagini, setAttesaImmagini] = useState(false);

  // Inject HTML into iframe when content changes or dialog opens
  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }
    const iframe = iframeEl;
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
  }, [open, htmlContent, iframeEl]);

  const handlePrint = async () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    setAttesaImmagini(true);
    // Una foto non ancora arrivata uscirebbe come un riquadro vuoto.
    await immaginiCaricate(win.document);
    setAttesaImmagini(false);
    win.focus();
    win.print();
  };

  const handleDownload = async () => {
    if (onDownloadPdf) {
      try {
        const pdf = await onDownloadPdf();
        await salvaDocumento(pdf, `${fileName}.pdf`.replace(/[\\/:*?"<>|]/g, "-"));
      } catch (e) {
        toast.error(t("PDF non generato: {motivo}", { motivo: e instanceof Error ? e.message : t("errore") }));
      }
      return;
    }
    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    try { await salvaDocumento(blob, `${fileName}.html`); }
    catch { toast.error(t("Impossibile salvare il documento. Riprova.")); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0">
        {/* La X la mette già DialogContent in alto a destra: qui ce n'era una seconda,
            sovrapposta a quella. Resta la sua, e il padding le lascia il posto. */}
        <DialogHeader className="flex flex-row items-center justify-between border-b px-4 py-3 pr-12 shrink-0">
          <DialogTitle className="text-base">{t(title)}</DialogTitle>
          <div className="flex items-center gap-2">
            {!soloPdf && <Button
              size="sm"
              variant="outline"
              onClick={handleDownload}
              disabled={!ready}
              aria-label={t("Scarica documento")}
            >
              <Download className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {t("Scarica")}
            </Button>}
            <Button
              size="sm"
              onClick={() => void handlePrint()}
              disabled={!ready || attesaImmagini}
              aria-label={soloPdf ? t("Stampa o salva PDF") : t("Stampa documento")}
            >
              <Printer className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {attesaImmagini ? t("Carico le foto…") : soloPdf ? t("Stampa o salva PDF") : t("Stampa")}
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 relative bg-muted/20">
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-label={t("Caricamento documento...")} />
            </div>
          )}
          <iframe
            ref={agganciaIframe}
            title={t(title)}
            className="w-full h-full border-0"
            sandbox="allow-same-origin allow-modals allow-scripts"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
