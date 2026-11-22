import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import type { VoceEditor } from "@/lib/computo/editorNativo";
import { destinazioneVoceComputo } from "@/lib/computo/destinazioniPdf";

export type PropostaPdfComputo = { voci: VoceEditor[]; dallaPianta?: boolean };
export type RendiPdfComputo = (proposta?: PropostaPdfComputo) => Promise<string>;

export function AnteprimaComputoSilvio({ renderPdf, chiave, proposta, voce, visibile = true }: {
  renderPdf: RendiPdfComputo;
  chiave: string;
  proposta?: PropostaPdfComputo;
  voce?: Pick<VoceEditor, "id" | "descrizione">;
  visibile?: boolean;
}) {
  return <section className="flex h-full min-h-0 flex-col p-2" aria-label="Anteprima del computo">
    <div className="min-h-0 flex-1">
      <PdfBlobLivePreviewPanel
        renderBlobUrl={() => renderPdf(proposta)}
        depsKey={JSON.stringify([chiave, proposta])}
        enabled={visibile}
        fitWholePage
        activeDestination={voce ? destinazioneVoceComputo(voce.id) : null}
        destinationLabel={voce?.descrizione}
        debounceMs={600}
        headerLabel={proposta ? "PDF · Anteprima delle modifiche" : "PDF del preventivo"}
        downloadFileName="bozza-silvio-computo.pdf"
        showDownloadOnMobile
      />
    </div>
  </section>;
}
