/**
 * TettiTemplatePreviewDialog — anteprima LIVE del PDF cliente in un
 * dialog. Rigenera il PDF (debounced ~450ms) ad ogni modifica del template e lo
 * mostra in un iframe. Usa dati di esempio (mock) + il template in editing, quindi
 * funziona anche col modulo Tetti non ancora pubblicato sul DB.
 *
 * Nessun setState SINCRONO nel body dell'effetto: la generazione (e i relativi
 * setState) avvengono dentro un timer + IIFE async, compatibile con la regola
 * react-hooks `set-state-in-effect`. Gli URL blob vengono revocati al cambio e al
 * unmount per non perdere memoria.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { renderTetPreviewBlobUrl } from "@/hooks/useTettiPDF";
import type { TetTemplatePdf } from "@/types/tetti";
import { buildTettiTemplatePreview, type TettiTemplateModuleId } from "@/lib/moduli-vendita/tettiTemplateModules";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: TetTemplatePdf | null;
  companyId: string | null;
  moduleId?: TettiTemplateModuleId;
  /** Apertura del PDF in una scheda separata (riusa l'handler dell'editor). */
  onOpenInTab?: () => void;
}

export function TettiTemplatePreviewDialog({
  open, onOpenChange, template, companyId, onOpenInTab, moduleId,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !template || !companyId) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const blobUrl = await renderTetPreviewBlobUrl(buildTettiTemplatePreview(companyId, template, moduleId));
          if (cancelled) { URL.revokeObjectURL(blobUrl); return; }
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          urlRef.current = blobUrl;
          setUrl(blobUrl);
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : "Errore nella generazione del PDF");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 450);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [open, template, companyId, moduleId]);

  // Revoca l'ultimo blob al unmount.
  useEffect(() => () => {
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] max-w-5xl flex-col gap-0 p-0">
        <DialogHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b px-4 py-3">
          <div className="min-w-0">
            <DialogTitle className="text-base">Anteprima PDF — live</DialogTitle>
            <p className="text-[11px] text-muted-foreground">
              Dati di esempio · si aggiorna mentre modifichi il template.
            </p>
          </div>
          {onOpenInTab && (
            <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={onOpenInTab}>
              <ExternalLink className="h-3.5 w-3.5" />
              Apri in scheda
            </Button>
          )}
        </DialogHeader>
        <div className="relative min-h-0 flex-1 bg-muted/30">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Genero l'anteprima…
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-destructive">
              {error}
            </div>
          )}
          {url && (
            <iframe title="Anteprima PDF Tetti" src={url} className="h-full w-full border-0" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
