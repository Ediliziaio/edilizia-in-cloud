import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UniformSelect } from "@/components/ui/uniform-select";
import { ComandiDocumento } from "@/components/shared/ConfrontoDocumentiLayout";
import { useDocumentoAffiancato } from "@/components/shared/contestoConfrontoDocumenti";
import { ZoomDocumento } from "@/components/shared/ZoomDocumento";
import { scalaDocumento, useDimensioniDocumento, type AdattamentoDocumento } from "@/components/shared/zoomDocumentoLayout";
import { apriOriginaleConfronto, type OriginaleConfronto } from "@/lib/fatturazione/originaliConfronto";
import { messaggioSalvataggio } from "@/lib/fatturazione/salvataggioFattura";
import { PdfRigaConfronto } from "./PdfRigaConfronto";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const FOTO_VISIBILE = /^image\/(jpeg|png|webp|gif|bmp|avif)$/;

function FotoOriginale({ src, nome }: { src: string; nome: string }) {
  const t = useT();
  const superficie = useRef<HTMLDivElement>(null);
  const spazio = useDimensioniDocumento(superficie);
  const [dimensioni, setDimensioni] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [adatta, setAdatta] = useState<AdattamentoDocumento>("pagina");
  const [errore, setErrore] = useState(false);
  const larghezza = dimensioni && spazio.width > 0 && spazio.height > 0
    ? dimensioni.width * scalaDocumento(dimensioni, spazio, adatta) * zoom
    : 1;

  if (errore) return <p role="alert" className="rounded-lg border bg-muted/30 p-4 text-sm">{t("Anteprima della foto non disponibile. Puoi aprire o scaricare l’originale.")}</p>;
  return (
    <>
      <ComandiDocumento ordine={20}>
        <div className="flex justify-end">
          <ZoomDocumento nome="foto" zoom={zoom} onZoom={setZoom} adatta={adatta}
            onAdatta={valore => { setAdatta(valore); setZoom(1); }} />
        </div>
      </ComandiDocumento>
      <div ref={superficie} data-confronto-superficie className="min-h-0 min-w-0 flex-1 overflow-auto rounded-md border bg-muted/50">
        <div className="flex w-max min-w-full justify-center p-2">
          <img
            src={src}
            alt={t("Originale {nome}", { nome: String(nome ?? "") })}
            referrerPolicy="no-referrer"
            className="block h-auto max-w-none shrink-0 bg-white shadow-sm"
            style={{ width: larghezza }}
            onLoad={({ currentTarget }) => {
              setDimensioni({ width: currentTarget.naturalWidth, height: currentTarget.naturalHeight });
            }}
            onError={() => setErrore(true)}
          />
        </div>
      </div>
    </>
  );
}

export function OriginaliConfronto({ files, companyId, adatta = false, ricerca, paginaIniziale }: {
  files: OriginaleConfronto[];
  companyId: string;
  adatta?: boolean;
  ricerca?: string;
  paginaIniziale?: number;
}) {
  const t = useT();
  const nelConfronto = useDocumentoAffiancato();
  const [id, setId] = useState("");
  const file = files.find(f => f.id === id) ?? files[0];
  const q = useQuery({
    queryKey: ["fattura-originale-confronto", companyId, file?.id, file?.previewPath],
    enabled: !!file,
    staleTime: 45 * 60 * 1000,
    gcTime: 50 * 60 * 1000,
    queryFn: () => apriOriginaleConfronto(file),
  });

  if (!file) return (
    <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
      {t("Nessun file originale conservato per questo documento. Puoi caricarlo dalla sua scheda.")}
    </div>
  );

  const nome = [file.etichetta, file.nome].filter(Boolean).join(" · ");
  const classiAltezza = nelConfronto ? "h-full flex-1" : adatta ? "h-[28rem] lg:h-full" : "h-[58dvh] min-h-64";
  const anteprima = q.data;
  return (
    <div className={`flex min-h-0 min-w-0 flex-col gap-2 ${nelConfronto || adatta ? "flex-1" : ""}`}>
      <ComandiDocumento>
        <div className="flex min-w-0 items-center gap-1 rounded-md border bg-muted/30 p-1">
          {files.length > 1 ? (
            <UniformSelect aria-label={t("Scegli il file originale")} value={file.id} onChange={e => setId(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs">
              {files.map(f => <option key={f.id} value={f.id}>{[f.etichetta, f.nome].filter(Boolean).join(" · ")}</option>)}
            </UniformSelect>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 text-xs">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate font-medium" title={nome}>{nome}</span>
            </div>
          )}
          {anteprima && (
            <>
              <Button asChild size="icon" variant="ghost" className="h-8 w-8 shrink-0">
                <a href={anteprima.url} target="_blank" rel="noreferrer" title={t("Apri originale")} aria-label={t("Apri originale")}>
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              </Button>
              <Button asChild size="icon" variant="ghost" className="h-8 w-8 shrink-0">
                <a href={anteprima.url} download={file.nome} title={t("Scarica")} aria-label={t("Scarica")} target="_blank" rel="noreferrer">
                  <Download className="size-4" aria-hidden="true" />
                </a>
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0"
                aria-label={t("Rinnova collegamento al file")} title={t("Rinnova collegamento al file")}
                disabled={q.isFetching} onClick={() => void q.refetch()}>
                <RefreshCw className="size-4" aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      </ComandiDocumento>
      {q.isLoading && <p role="status" className="p-3 text-sm text-muted-foreground">{t("Apertura originale…")}</p>}
      {q.isError && (
        <p role="alert" className="p-3 text-sm text-destructive">
          {messaggioSalvataggio(q.error)}{" "}
          <button className="underline" onClick={() => void q.refetch()}>{t("Riprova")}</button>
        </p>
      )}
      {anteprima?.mime === "application/pdf" && (
        <div className={`flex min-h-0 min-w-0 flex-col ${classiAltezza}`}>
          <PdfRigaConfronto nome={file.nome} url={anteprima.preview} ricerca={ricerca} paginaIniziale={paginaIniziale} />
        </div>
      )}
      {anteprima && FOTO_VISIBILE.test(anteprima.mime) && (
        <div className={`flex min-h-0 min-w-0 flex-col gap-2 ${classiAltezza}`}>
          <FotoOriginale key={`${file.id}:${q.dataUpdatedAt}`} nome={file.nome} src={anteprima.preview} />
        </div>
      )}
      {anteprima && anteprima.mime !== "application/pdf" && !FOTO_VISIBILE.test(anteprima.mime) && (
        <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          {/image\/hei[cf]/.test(anteprima.mime)
            ? t("Foto HEIC originale conservata. Aprila sul dispositivo o scaricala.")
            : t("Anteprima non disponibile per questo file. Puoi aprire o scaricare l’originale.")}
        </p>
      )}
    </div>
  );
}
