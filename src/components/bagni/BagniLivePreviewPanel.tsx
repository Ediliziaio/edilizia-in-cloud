/**
 * BagniLivePreviewPanel — wrapper vertical del pannello anteprima live
 * condiviso (PdfBlobLivePreviewPanel). Porta i mock builder Bagni +
 * renderBgnPreviewBlobUrl, così l'anteprima è persistente a lato dell'editor.
 */
import { useCallback, useMemo } from "react";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { renderBgnPreviewBlobUrl } from "@/hooks/useBagniPDF";
import type { BgnTemplatePdf } from "@/types/bagni";
import { buildBgnModulePreview, type FullBgnModuleId } from "@/lib/moduli-vendita/fullBgnModules";



export function BagniLivePreviewPanel({
  template, companyId, moduleId, activeSection,
}: {
  activeSection?: string | null;
  template: BgnTemplatePdf | null;
  companyId: string | null;
  moduleId?: FullBgnModuleId;
}) {
  const depsKey = useMemo(
    () => (companyId ?? "") + "|" + (moduleId ?? "") + "|" + JSON.stringify(template ?? {}),
    [template, companyId, moduleId],
  );
  const renderBlobUrl = useCallback(() => {
    if (!companyId || !template) return Promise.reject(new Error("Template non pronto"));
    return renderBgnPreviewBlobUrl(buildBgnModulePreview(companyId, template, moduleId));
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
