/**
 * TettiLivePreviewPanel — wrapper vertical del pannello anteprima live
 * condiviso (PdfBlobLivePreviewPanel). Porta i mock builder Tetti +
 * renderTetPreviewBlobUrl, così l'anteprima è persistente a lato dell'editor.
 */
import { useCallback, useMemo } from "react";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
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

export function TettiLivePreviewPanel({
  template, companyId,
}: {
  template: TetTemplatePdf | null;
  companyId: string | null;
}) {
  const depsKey = useMemo(
    () => (companyId ?? "") + "|" + JSON.stringify(template ?? {}),
    [template, companyId],
  );
  const renderBlobUrl = useCallback(() => {
    if (!companyId || !template) return Promise.reject(new Error("Template non pronto"));
    return renderTetPreviewBlobUrl({
      progetto: buildMockProgetto(companyId),
      computo: buildMockComputo(companyId),
      media: [],
      template,
    });
  }, [template, companyId]);

  return (
    <PdfBlobLivePreviewPanel
      renderBlobUrl={renderBlobUrl}
      depsKey={depsKey}
      enabled={!!companyId && !!template}
      accentClass="text-orange-600"
    />
  );
}
