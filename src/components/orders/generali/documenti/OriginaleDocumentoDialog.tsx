import { lazy, Suspense, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { attachmentStorage, fileKind, scaricaAllegato } from "@/components/orders/filePreviewUtils";
import { useGenerazioneProtetta } from "@/components/shared/livePreview/useGenerazioneProtetta";
import { ZoomDocumento } from "@/components/shared/ZoomDocumento";
import { scalaDocumento, useDimensioniDocumento, type AdattamentoDocumento } from "@/components/shared/zoomDocumentoLayout";
import { supabase } from "@/integrations/supabase/client";
import type { AllegatoCommessa } from "@/lib/orders/generali/documenti";
import { createPdfPreviewUrl } from "@/lib/pdfPreviewSource";
import { DialogContentOperativo } from "../design/ContestoOperativo";

const PdfPanel = lazy(() => import("@/components/shared/PdfBlobLivePreviewPanel").then(m => ({ default: m.PdfBlobLivePreviewPanel })));
const ESTENSIONE_FOTO = /\.(?:png|jpe?g|webp|gif|avif|bmp|svg)$/i;
const MIME_FOTO = /^image\/(?:png|jpeg|webp|gif|avif|bmp|svg\+xml)(?:;|$)/i;

async function leggiOriginale(file: AllegatoCommessa) {
  const { bucket, path } = attachmentStorage(file.file_url);
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error("Impossibile leggere il file originale. Riprova.");
  return data;
}

export function OriginaleDocumentoDialog({ file, ambito, chiudi, restituisciFocus }: {
  file: AllegatoCommessa;
  ambito: string;
  chiudi: () => void;
  restituisciFocus: () => void;
}) {
  const pdf = fileKind(file) === "pdf";
  const foto = ESTENSIONE_FOTO.test(file.file_name) || MIME_FOTO.test(file.file_type ?? "");
  return <Dialog open onOpenChange={open => { if (!open) chiudi(); }}>
    <DialogContentOperativo struttura="contenuta" onCloseAutoFocus={e => { e.preventDefault(); restituisciFocus(); }}
      className={pdf || foto ? "flex h-[90dvh] max-w-5xl flex-col gap-2 overflow-hidden p-3 sm:p-4" : "max-w-md"}>
      <DialogHeader className="min-w-0 shrink-0 pr-7">
        <DialogTitle className="break-words text-base">{file.file_name}</DialogTitle>
        <DialogDescription>{ambito}</DialogDescription>
      </DialogHeader>
      {pdf ? <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<p role="status" className="p-3 text-sm">Caricamento PDF…</p>}>
          <PdfPanel headerLabel="PDF originale" downloadFileName={file.file_name} showDownloadOnMobile vistaPagina
            depsKey={file.id} debounceMs={0} renderBlobUrl={async () => createPdfPreviewUrl(await leggiOriginale(file))} />
        </Suspense>
      </div> : foto ? <AnteprimaFoto file={file} /> : <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">Scarica il file originale per aprirlo sul dispositivo.</p>
        <Scarica file={file} />
      </div>}
    </DialogContentOperativo>
  </Dialog>;
}

function Scarica({ file }: { file: AllegatoCommessa }) {
  return <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5"
    onClick={() => void scaricaAllegato(file.file_url, file.file_name)}>
    <Download className="size-4" aria-hidden="true" /> Scarica originale
  </Button>;
}

function AnteprimaFoto({ file }: { file: AllegatoCommessa }) {
  const [zoom, setZoom] = useState(1);
  const [adatta, setAdatta] = useState<AdattamentoDocumento>("pagina");
  const [immagine, setImmagine] = useState({ width: 1, height: 1 });
  const [letturaFallita, setLetturaFallita] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const dimensioni = useDimensioniDocumento(area);
  const { risultato, aggiornato, errore, rigenera } = useGenerazioneProtetta(
    async () => URL.createObjectURL(await leggiOriginale(file)), file.id,
    { debounceMs: 0, onScarta: url => URL.revokeObjectURL(url) },
  );
  const larghezza = Math.round(immagine.width * scalaDocumento(immagine, dimensioni, adatta) * zoom);

  return <>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <ZoomDocumento nome="foto" zoom={zoom} adatta={adatta} onZoom={setZoom}
        onAdatta={modo => { setAdatta(modo); setZoom(1); }} />
      <Scarica file={file} />
    </div>
    <div ref={area} className="min-h-0 min-w-0 flex-1 overflow-auto rounded-md border bg-muted/50" tabIndex={0} aria-label="Anteprima della foto">
      {errore ? <div role="alert" className="space-y-2 p-4 text-sm">
        <p>Non riesco a leggere l’originale.</p><Button type="button" size="sm" variant="outline" onClick={rigenera}>Riprova</Button>
      </div> : letturaFallita ? <p role="alert" className="p-4 text-sm">Scarica l’originale per aprire la foto sul dispositivo.</p>
        : aggiornato && risultato ? <img src={risultato} alt={file.file_name} className="mx-auto my-2 block h-auto max-w-none"
          style={{ width: larghezza }} onError={() => setLetturaFallita(true)} onLoad={e => {
            const { naturalWidth: width, naturalHeight: height } = e.currentTarget;
            if (width > 0 && height > 0) setImmagine({ width, height });
          }} /> : <p role="status" className="p-4 text-sm text-muted-foreground">Caricamento foto…</p>}
    </div>
  </>;
}
