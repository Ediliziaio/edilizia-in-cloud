import { useDocumentoAffiancato } from "@/components/shared/contestoConfrontoDocumenti";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, RefreshCw, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  apriOriginaleConfronto,
  type OriginaleConfronto,
} from "@/lib/fatturazione/originaliConfronto";
import { ComandiDocumento } from "@/components/shared/ConfrontoDocumentiLayout";
import { PdfRigaConfronto } from "./PdfRigaConfronto";
import { messaggioSalvataggio } from "@/lib/fatturazione/salvataggioFattura";

export function OriginaliConfronto({
  files,
  companyId,
  adatta = false,
  ricerca,
  paginaIniziale,
}: {
  files: OriginaleConfronto[];
  companyId: string;
  adatta?: boolean;
  ricerca?: string;
  paginaIniziale?:number;
}) {
  const nelConfronto = useDocumentoAffiancato();
  const riempi = adatta || nelConfronto;
  const [id, setId] = useState("");
  const file = files.find((f) => f.id === id) ?? files[0];
  const q = useQuery({
    queryKey: [
      "fattura-originale-confronto",
      companyId,
      file?.id,
      file?.previewPath,
    ],
    enabled: !!file,
    staleTime: 45 * 60 * 1000,
    gcTime: 50 * 60 * 1000,
    queryFn: () => apriOriginaleConfronto(file),
  });
  const [nonVisibile, setNonVisibile] = useState<string | null>(null);
  const [fotoIngrandita, setFotoIngrandita] = useState(false);
  if (!files.length)
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nessun file originale conservato per questo documento. Puoi caricarlo
        dalla sua scheda.
      </div>
    );
  return (
    <div
      className={
        nelConfronto ? "flex h-full min-h-0 flex-1 flex-col gap-2" : adatta ? "flex h-[28rem] min-h-0 flex-col gap-3 lg:h-full" : "space-y-3"
      }
    >
      <ComandiDocumento>
        <div className={`flex min-w-0 shrink-0 items-center gap-2 ${nelConfronto ? "flex-nowrap" : "flex-wrap"}`}>
      {files.length > 1 && (
        <label className="min-w-0 flex-1 text-xs font-medium">
          <span className={nelConfronto ? "sr-only" : ""}>File del documento</span>
          <select
            aria-label="Scegli il file originale"
            className={nelConfronto ? "h-8 w-full min-w-0 rounded-md border bg-background px-2 text-xs" : "mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm"}
            value={file.id}
            onChange={(e) => {
              setId(e.target.value);
              setFotoIngrandita(false);
            }}
          >
            {files.map((f, i) => (
              <option key={f.id} value={f.id}>
                {i + 1}. {f.etichetta ? `${f.etichetta} · ` : ""}{f.nome}
              </option>
            ))}
          </select>
        </label>
      )}
          {files.length === 1 && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={[file.etichetta,file.nome].filter(Boolean).join(' · ')}>{file.etichetta ? `${file.etichetta} · ` : ''}{file.nome}</span>}
          {q.data && <>
              <Button asChild size={nelConfronto ? "icon" : "sm"} variant="outline" className={nelConfronto ? "h-8 w-8 shrink-0" : undefined}>
                <a href={q.data.url} target="_blank" rel="noreferrer" title="Apri originale">
                  <ExternalLink className={nelConfronto ? "h-3.5 w-3.5" : "mr-1.5 h-3.5 w-3.5"} />
                  <span className={nelConfronto ? "sr-only" : ""}>Apri originale</span>
                </a>
              </Button>
              <Button asChild size={nelConfronto ? "icon" : "sm"} variant="ghost" className={nelConfronto ? "h-8 w-8 shrink-0" : undefined}>
                <a
                  href={q.data.url}
                  download={file.nome}
                  title="Scarica"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download className={nelConfronto ? "h-3.5 w-3.5" : "mr-1.5 h-3.5 w-3.5"} />
                  <span className={nelConfronto ? "sr-only" : ""}>Scarica</span>
                </a>
              </Button>
              <Button
                size={nelConfronto ? "icon" : "sm"}
                className={nelConfronto ? "h-8 w-8 shrink-0" : undefined}
                variant="ghost"
                aria-label="Rinnova collegamento al file"
                title="Rinnova collegamento al file"
                onClick={() => {
                  setNonVisibile(null);
                  void q.refetch();
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              {/^image\/(jpeg|png|webp|gif|bmp|avif)$/.test(q.data.mime) && (
                <Button
                  size={nelConfronto ? "icon" : "sm"}
                  className={nelConfronto ? "h-8 w-8 shrink-0" : undefined}
                  aria-label={fotoIngrandita ? "Adatta foto" : "Ingrandisci foto"}
                  variant="outline"
                  onClick={() => setFotoIngrandita((v) => !v)}
                >
                  {nelConfronto ? <ZoomIn className="h-3.5 w-3.5"/> : fotoIngrandita ? "Adatta foto" : "Ingrandisci foto"}
                </Button>
              )}
          </>}
        </div>
      </ComandiDocumento>
      {q.isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Apertura originale…
        </p>
      ) : q.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {messaggioSalvataggio(q.error)}{" "}
          <button className="underline" onClick={() => void q.refetch()}>
            Riprova
          </button>
        </p>
      ) : (
        q.data && (
          <>
            {q.data.mime === "application/pdf" ? (
              <div
                className={
                  riempi
                    ? "flex min-h-0 flex-1 flex-col"
                    : "flex h-[58dvh] min-h-80 flex-col"
                }
              >
                <PdfRigaConfronto
                  key={`${q.data.url}:${ricerca ?? ""}`}
                  url={q.data.url}
                  nome={file.nome}
                  ricerca={ricerca}
                  paginaIniziale={paginaIniziale}
                />
              </div>
            ) : /^image\/(jpeg|png|webp|gif|bmp|avif)$/.test(q.data.mime) &&
              nonVisibile !== file.id ? (
              <div data-confronto-superficie={nelConfronto ? true : undefined}
                className={
                  riempi
                    ? "min-h-0 flex-1 overflow-auto rounded-lg border bg-white"
                    : "max-h-[65dvh] overflow-auto rounded-lg border bg-white"
                }
              >
                <img
                  src={q.data.preview}
                  alt={`Originale ${file.nome}`}
                  referrerPolicy="no-referrer"
                  className={
                    fotoIngrandita
                      ? "block h-auto w-auto max-w-none"
                      : riempi
                        ? "h-full w-full object-contain"
                        : "w-full object-contain"
                  }
                  onError={() => setNonVisibile(file.id)}
                />
              </div>
            ) : (
              <p className="rounded-xl border bg-muted/30 p-5 text-sm text-muted-foreground">
                {/image\/hei[cf]/.test(q.data.mime)
                  ? "Foto HEIC originale conservata. Aprila sul dispositivo o scaricala."
                  : "Anteprima non disponibile per questo file. Usa Apri originale o Scarica."}
              </p>
            )}
          </>
        )
      )}
    </div>
  );
}
