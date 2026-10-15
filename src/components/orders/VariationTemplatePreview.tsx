import { createPdfPreviewUrl, revokePdfPreviewUrl } from "@/lib/pdfPreviewSource";
import { useCallback, useEffect, useRef } from "react";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { variationTemplateExamplePdf, variationTemplateVisualKey } from "@/lib/orders/variationTemplateExample";
import type { VariationTemplateContent } from "@/lib/orders/variationTemplates";

/** New visual content gets its own preview: old URLs can never remain downloadable after an edit. */
export function VariationTemplatePreview({ content, scope }: { content: VariationTemplateContent; scope?: string }) {
  const key = `${scope ?? ""}:${variationTemplateVisualKey(content)}`;
  return <CurrentPreview key={scope ?? ""} content={content} snapshot={key} />;
}

function CurrentPreview({ content, snapshot }: { content: VariationTemplateContent; snapshot: string }) {
  const alive = useRef(true);
  const owned = useRef(new Set<string>());
  const currentSnapshot=useRef(snapshot);currentSnapshot.current=snapshot;
  useEffect(() => {
    alive.current = true;
    const urls = owned.current;
    return () => { alive.current = false; for (const url of urls) revokePdfPreviewUrl(url); urls.clear(); };
  }, []);
  const render = useCallback(async () => {
    if (!alive.current || currentSnapshot.current!==snapshot) return "";
    const doc = await variationTemplateExamplePdf(content);
    // Closing/changing a model while the import resolves must not leak a Blob URL.
    if (!alive.current || currentSnapshot.current!==snapshot) return "";
    const url = createPdfPreviewUrl(doc.output("blob")); owned.current.add(url); return url;
  }, [content,snapshot]);
  return <PdfBlobLivePreviewPanel renderBlobUrl={render} depsKey={snapshot} debounceMs={500}
    downloadFileName="esempio-modello-variante.pdf" showDownloadOnMobile accentClass="text-primary" />;
}
