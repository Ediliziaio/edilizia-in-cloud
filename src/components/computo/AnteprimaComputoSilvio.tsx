import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import type { VoceEditor } from "@/lib/computo/editorNativo";
import { destinazioneVoceComputo } from "@/lib/computo/destinazioniPdf";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export type PropostaPdfComputo = { voci: VoceEditor[]; dallaPianta?: boolean };
export type RendiPdfComputo = (proposta?: PropostaPdfComputo) => Promise<string>;

export function AnteprimaComputoSilvio({ renderPdf, chiave, proposta, voce, visibile = true }: {
  renderPdf: RendiPdfComputo;
  chiave: string;
  proposta?: PropostaPdfComputo;
  voce?: Pick<VoceEditor, "id" | "descrizione">;
  visibile?: boolean;
}) {
  const t = useT();
  return <section className="flex h-full min-h-0 flex-col p-2" aria-label={t("Anteprima del computo")}>
    <div className="min-h-0 flex-1">
      <PdfBlobLivePreviewPanel
        renderBlobUrl={() => renderPdf(proposta)}
        depsKey={JSON.stringify([chiave, proposta])}
        enabled={visibile}
        fitWholePage
        activeDestination={voce ? destinazioneVoceComputo(voce.id) : null}
        destinationLabel={voce?.descrizione}
        debounceMs={600}
        headerLabel={proposta ? t("PDF · Anteprima delle modifiche") : t("PDF del preventivo")}
        downloadFileName="bozza-silvio-computo.pdf"
        showDownloadOnMobile
      />
    </div>
  </section>;
}
