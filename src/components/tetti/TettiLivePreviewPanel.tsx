/**
 * TettiLivePreviewPanel — wrapper vertical del pannello anteprima live
 * condiviso (PdfBlobLivePreviewPanel). Porta i mock builder Tetti +
 * renderTetPreviewBlobUrl, così l'anteprima è persistente a lato dell'editor.
 */
import { useCallback, useMemo } from "react";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { renderTetPreviewBlobUrl } from "@/hooks/useTettiPDF";
import type { TetTemplatePdf } from "@/types/tetti";
import { buildTettiTemplatePreview, type TettiTemplateModuleId } from "@/lib/moduli-vendita/tettiTemplateModules";

export function TettiLivePreviewPanel({
  template, companyId, moduleId, activeSection,
}: {
  activeSection?: string | null;
  template: TetTemplatePdf | null;
  companyId: string | null;
  moduleId?: TettiTemplateModuleId;
}) {
  const depsKey = useMemo(
    () => (companyId ?? "") + "|" + (moduleId ?? "") + "|" + JSON.stringify(template ?? {}),
    [template, companyId, moduleId],
  );
  const renderBlobUrl = useCallback(() => {
    if (!companyId || !template) return Promise.reject(new Error("Template non pronto"));
    return renderTetPreviewBlobUrl(buildTettiTemplatePreview(companyId, template, moduleId));
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
