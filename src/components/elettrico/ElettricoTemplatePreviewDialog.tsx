/**
 * ElettricoTemplatePreviewDialog — anteprima LIVE del PDF cliente in un
 * dialog. Rigenera il PDF (debounced ~450ms) ad ogni modifica del template e lo
 * mostra in un iframe. Usa dati di esempio (mock) + il template in editing, quindi
 * funziona anche col modulo Elettrico non ancora pubblicato sul DB.
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
import { renderElePreviewBlobUrl } from "@/hooks/useElettricoPDF";
import type { EleTemplatePdf, EleProgetto, EleComputoVoce } from "@/types/elettrico";

function buildMockComputo(companyId: string): EleComputoVoce[] {
  const row = (
    i: number, cap: string, descrizione: string,
    um: EleComputoVoce["unita_misura"], q: number, p: number, cm: number, cl: number,
  ): EleComputoVoce => ({
    id: String(i), progetto_id: "preview", company_id: companyId, capitolo_nome: cap, descrizione,
    unita_misura: um, quantita: q, prezzo_unitario: p, costo_materiali: cm, costo_manodopera: cl,
    sconto_pct: 0, importo: q * p, margine_eur: q * (p - cm - cl),
    margine_pct: p > 0 ? ((p - cm - cl) / p) * 100 : 0, listino_voce_id: null, ordine: i,
  });
  return [
    row(0, "Demolizioni e rimozioni", "Demolizione tramezzi interni", "mq", 25, 18, 2, 10),
    row(1, "Demolizioni e rimozioni", "Rimozione pavimenti esistenti", "mq", 90, 12, 1, 6),
    row(2, "Opere edili", "Nuove pareti divisorie in cartongesso", "mq", 40, 28, 8, 12),
    row(3, "Impianti", "Rifacimento impianto elettrico certificato", "corpo", 1, 6500, 2000, 2500),
    row(4, "Impianti", "Rifacimento impianto idraulico", "corpo", 1, 4200, 1500, 1500),
    row(5, "Finiture", "Posa pavimento gres porcellanato", "mq", 90, 42, 22, 14),
  ];
}

function buildMockProgetto(companyId: string): EleProgetto {
  return {
    id: "preview", company_id: companyId, code: "ANTEPRIMA", stato: "bozza",
    tipo_intervento: "Nuovo impianto elettrico",
    cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_email: null, cliente_telefono: null,
    cantiere_indirizzo: "Via Roma 1", cantiere_citta: "Milano", cantiere_provincia: "MI", cantiere_cap: "20100",
    immobile_tipo: "Appartamento", immobile_superficie_mq: 90, immobile_anno: 1975, immobile_piani: 1,
    numero_punti: 42, livello_impianto: "Livello 2", massimale_detrazione: null,
    opportunita_id: null, cliente_id: null, template_id: null,
    sconto_pct: 0, iva_pct: 10, detrazione_pct: 50,
    totale_imponibile: 0, totale: 0, note: null,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: EleTemplatePdf | null;
  companyId: string | null;
  /** Apertura del PDF in una scheda separata (riusa l'handler dell'editor). */
  onOpenInTab?: () => void;
}

export function ElettricoTemplatePreviewDialog({
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
          const blobUrl = await renderElePreviewBlobUrl({
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
            <iframe title="Anteprima PDF Elettrico" src={url} className="h-full w-full border-0" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
