import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  apriOriginaleConfronto,
  type OriginaleConfronto,
} from "@/lib/fatturazione/originaliConfronto";
import { messaggioSalvataggio } from "@/lib/fatturazione/salvataggioFattura";

export function OriginaliConfronto({
  files,
  companyId,
  adatta = false,
}: {
  files: OriginaleConfronto[];
  companyId: string;
  adatta?: boolean;
}) {
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
        adatta ? "flex h-[28rem] min-h-0 flex-col gap-3 lg:h-full" : "space-y-3"
      }
    >
      {files.length > 1 && (
        <label className="block shrink-0 text-xs font-medium">
          File del documento
          <select
            aria-label="Scegli il file originale"
            className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm"
            value={file.id}
            onChange={(e) => {
              setId(e.target.value);
              setFotoIngrandita(false);
            }}
          >
            {files.map((f, i) => (
              <option key={f.id} value={f.id}>
                {i + 1}. {f.nome}
              </option>
            ))}
          </select>
        </label>
      )}
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
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span className="mr-auto max-w-full break-all text-xs text-muted-foreground">
                {file.nome}
              </span>
              <Button asChild size="sm" variant="outline">
                <a href={q.data.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Apri originale
                </a>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <a
                  href={q.data.url}
                  download={file.nome}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Scarica
                </a>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Rinnova collegamento al file"
                onClick={() => {
                  setNonVisibile(null);
                  void q.refetch();
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              {/^image\/(jpeg|png|webp|gif|bmp|avif)$/.test(q.data.mime) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setFotoIngrandita((v) => !v)}
                >
                  {fotoIngrandita ? "Adatta foto" : "Ingrandisci foto"}
                </Button>
              )}
            </div>
            {q.data.mime === "application/pdf" ? (
              <iframe
                title={`Originale ${file.nome}`}
                src={q.data.preview}
                referrerPolicy="no-referrer"
                className={
                  adatta
                    ? "min-h-0 w-full flex-1 rounded-lg border bg-white"
                    : "h-[58dvh] min-h-80 w-full rounded-lg border bg-white"
                }
              />
            ) : /^image\/(jpeg|png|webp|gif|bmp|avif)$/.test(q.data.mime) &&
              nonVisibile !== file.id ? (
              <div
                className={
                  adatta
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
                      : adatta
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
