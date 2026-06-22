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
import type { TetTemplatePdf, TetProgetto, TetComputoVoce } from "@/types/tetti";

function buildMockComputo(companyId: string): TetComputoVoce[] {
  const row = (
    i: number, cap: string, descrizione: string,
    um: TetComputoVoce["unita_misura"], q: number, p: number, cm: number, cl: number,
  ): TetComputoVoce => ({
    id: String(i), progetto_id: "preview", company_id: companyId, capitolo_nome: cap, descrizione,
    unita_misura: um, quantita: q, prezzo_unitario: p, costo_materiali: cm, costo_manodopera: cl,
    sconto_pct: 0, importo: q * p, margine_eur: q * (p - cm - cl),
    margine_pct: p > 0 ? ((p - cm - cl) / p) * 100 : 0, listino_voce_id: null, ordine: i,
  });
  return [
    row(0, "Ponteggi e smontaggio", "Ponteggio perimetrale e allestimento cantiere", "mq", 120, 14, 6, 8),
    row(1, "Ponteggi e smontaggio", "Rimozione manto di copertura esistente", "mq", 180, 10, 0, 12),
    row(2, "Struttura e orditura", "Revisione e sostituzione listellatura in legno", "mq", 180, 16, 7, 11),
    row(3, "Isolamento", "Pannelli isolanti in fibra di legno sp. 10 cm", "mq", 180, 38, 24, 12),
    row(4, "Manto di copertura", "Fornitura e posa coppi/tegole + membrana traspirante", "mq", 180, 44, 26, 18),
    row(5, "Lattoneria", "Canali di gronda, pluviali e scossaline in alluminio", "ml", 60, 36, 22, 14),
  ];
}

function buildMockProgetto(companyId: string): TetProgetto {
  return {
    id: "preview", company_id: companyId, code: "ANTEPRIMA", stato: "bozza",
    tipo_intervento: "Rifacimento copertura completo",
    cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_email: null, cliente_telefono: null,
    cantiere_indirizzo: "Via Roma 1", cantiere_citta: "Milano", cantiere_provincia: "MI", cantiere_cap: "20100",
    immobile_tipo: "Appartamento", immobile_superficie_mq: 90, immobile_anno: 1975, immobile_piani: 1,
    opportunita_id: null, cliente_id: null, template_id: null,
    sconto_pct: 0, iva_pct: 10, detrazione_pct: 50,
    totale_imponibile: 0, totale: 0, note: null,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: TetTemplatePdf | null;
  companyId: string | null;
  /** Apertura del PDF in una scheda separata (riusa l'handler dell'editor). */
  onOpenInTab?: () => void;
}

export function TettiTemplatePreviewDialog({
  open, onOpenChange, template, companyId, onOpenInTab,
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
          const blobUrl = await renderTetPreviewBlobUrl({
            progetto: buildMockProgetto(companyId),
            computo: buildMockComputo(companyId),
            media: [],
            template,
          });
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
  }, [open, template, companyId]);

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
