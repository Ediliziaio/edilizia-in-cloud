import { buildPscModulePreview, type FullPscModuleId } from "@/lib/moduli-vendita/fullPscModules";
/**
 * PiscineLivePreviewPanel — wrapper vertical del pannello anteprima live
 * condiviso (PdfBlobLivePreviewPanel). Porta i mock builder Piscine +
 * renderPisPreviewBlobUrl, così l'anteprima è persistente a lato dell'editor.
 */
import { useCallback, useMemo } from "react";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { renderPisPreviewBlobUrl } from "@/hooks/usePiscinePDF";
import type { PisTemplatePdf, PisProgetto, PisComputoVoce } from "@/types/piscine";

function buildMockComputo(companyId: string): PisComputoVoce[] {
  const row = (
    i: number, cap: string, descrizione: string,
    um: PisComputoVoce["unita_misura"], q: number, p: number, cm: number, cl: number,
  ): PisComputoVoce => ({
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

function buildMockProgetto(companyId: string): PisProgetto {
  return {
    id: "preview", company_id: companyId, code: "ANTEPRIMA", stato: "bozza",
    tipo_intervento: "Nuova piscina interrata", tipo_piscina: null, tipo_costruzione: null, massimale_detrazione: null,
    cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_email: null, cliente_telefono: null,
    cantiere_indirizzo: "Via Roma 1", cantiere_citta: "Milano", cantiere_provincia: "MI", cantiere_cap: "20100",
    immobile_tipo: "Appartamento", immobile_superficie_mq: 90, immobile_anno: 1975, immobile_piani: 1,
    opportunita_id: null, cliente_id: null, template_id: null,
    sconto_pct: 0, iva_pct: 10, detrazione_pct: 50,
    totale_imponibile: 0, totale: 0, note: null,
  };
}

export function PiscineLivePreviewPanel({
  template, companyId, moduleId, activeSection,
}: {
  activeSection?: string | null;
  template: PisTemplatePdf | null;
  companyId: string | null;
  moduleId?: FullPscModuleId;
}) {
  const depsKey = useMemo(
    () => (companyId ?? "") + "|" + (moduleId ?? "") + "|" + JSON.stringify(template ?? {}),
    [template, companyId, moduleId],
  );
  const renderBlobUrl = useCallback(() => {
    if (!companyId || !template) return Promise.reject(new Error("Template non pronto"));
    return renderPisPreviewBlobUrl(moduleId ? buildPscModulePreview(companyId, template, moduleId) : {
      progetto: buildMockProgetto(companyId),
      computo: buildMockComputo(companyId),
      media: [],
      template,
    });
  }, [template, companyId, moduleId]);

  return (
    <PdfBlobLivePreviewPanel
      activeSection={activeSection}
      renderBlobUrl={renderBlobUrl}
      depsKey={depsKey}
      enabled={!!companyId && !!template}
      accentClass="text-orange-600"
    />
  );
}
