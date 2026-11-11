import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Download, ExternalLink, Eye } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  documentiDb,
  type FileDocumento,
} from "@/lib/ddt/documentiPersistenti";

export function DDTOriginaliCard({
  ddtId,
  companyId,
  incorporato = false,
}: {
  ddtId: string;
  companyId: string;
  /**
   * Righe di un elenco (<li>) invece di una scheda: è la prima voce di
   * «Documenti della bolla» (11/11/2026). L'anteprima grande si apre a
   * richiesta, non occupa più 36rem di pagina.
   */
  incorporato?: boolean;
}) {
  const [pagina, setPagina] = useState(0);
  const [anteprima, setAnteprima] = useState<number | null>(null);
  const q = useQuery({
    queryKey: ["ddt-originali", companyId, ddtId],
    staleTime: 40 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await documentiDb
        .from("ddt_document_jobs")
        .select("files")
        .eq("ddt_id", ddtId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      const result = [];
      for (const f of (data?.files ?? []) as FileDocumento[]) {
        const bucket = f.bucket ?? "ddt-documenti";
        if (
          !["ddt-documenti", "whatsapp-media"].includes(bucket) ||
          !f.path.startsWith(`${companyId}/`)
        )
          throw new Error("Originale non disponibile");
        const { data: link, error: e } = await supabase.storage
          .from(bucket)
          .createSignedUrl(f.path, 3600);
        if (e || !link) throw new Error("Originale non disponibile");
        let preview = link.signedUrl,
          mime = f.mime;
        if (f.prepared_path) {
          const { data: p, error: pe } = await supabase.storage
            .from(bucket)
            .createSignedUrl(f.prepared_path, 3600);
          if (!pe && p) {
            preview = p.signedUrl;
            mime = f.prepared_mime ?? "image/jpeg";
          }
        }
        result.push({ ...f, url: link.signedUrl, preview, mimePreview: mime });
      }
      return result;
    },
  });
  const file = q.data?.[pagina] ?? q.data?.[0];
  if (!q.isError && !q.isLoading && !q.data?.length) return null;
  if (incorporato) {
    if (q.isLoading)
      return <li className="px-2.5 py-2 text-xs text-muted-foreground">Apertura dell’originale…</li>;
    if (q.isError)
      return (
        <li role="alert" className="px-2.5 py-2 text-sm text-destructive">
          Non riesco ad aprire l’originale.{" "}
          <button className="underline" onClick={() => void q.refetch()}>
            Riprova
          </button>
        </li>
      );
    const tutte = q.data ?? [];
    return (
      <>
        {tutte.map((f, i) => (
          <li key={f.path} className="bg-primary/5">
            <div className="flex items-center gap-2.5 px-2.5 py-1.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border bg-background">
                <FileText className="h-4 w-4 text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={f.name}>{f.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  <span className="mr-1.5 rounded border border-primary/30 bg-primary/10 px-1 py-px font-medium text-primary">
                    Bolla originale
                  </span>
                  {tutte.length > 1 ? `pagina ${i + 1} di ${tutte.length}` : null}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5 text-xs">
                <button
                  type="button"
                  aria-expanded={anteprima === i}
                  aria-label={`Anteprima ${f.name}`}
                  onClick={() => setAnteprima(anteprima === i ? null : i)}
                  className="inline-flex h-7 items-center gap-1 rounded px-2 hover:bg-muted"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{anteprima === i ? "Chiudi" : "Anteprima"}</span>
                </button>
                <a
                  className="inline-flex h-7 items-center gap-1 rounded px-2 hover:bg-muted"
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Apri</span>
                  <span className="sr-only sm:hidden">Apri originale</span>
                </a>
                <a
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  href={f.url}
                  download={f.name}
                  title="Scarica originale"
                  aria-label="Scarica originale"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
            {anteprima === i && (
              <div className="px-2.5 pb-2.5">
                <AnteprimaOriginale file={f} />
              </div>
            )}
          </li>
        ))}
      </>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" />
          Originale del fornitore
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Apertura documento…</p>
        ) : q.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Non riesco ad aprire l’originale.{" "}
            <button className="underline" onClick={() => void q.refetch()}>
              Riprova
            </button>
          </p>
        ) : (
          file && (
            <>
              {(q.data?.length ?? 0) > 1 && (
                <div
                  className="flex flex-wrap gap-2"
                  aria-label="Pagine originali"
                >
                  {q.data!.map((f, i) => (
                    <button
                      key={f.path}
                      type="button"
                      aria-pressed={i === pagina}
                      className={`min-h-10 rounded-md border px-3 text-xs ${i === pagina ? "bg-primary text-primary-foreground" : "bg-background"}`}
                      onClick={() => setPagina(i)}
                    >
                      Pagina {i + 1}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <p className="break-all font-medium">{file.name}</p>
                <div className="flex gap-4">
                  <a
                    className="inline-flex min-h-10 items-center gap-1 underline"
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Apri originale
                  </a>
                  <a
                    className="inline-flex min-h-10 items-center gap-1 underline"
                    href={file.url}
                    download={file.name}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Scarica originale
                  </a>
                </div>
              </div>
              <AnteprimaOriginale file={file} />
            </>
          )
        )}
      </CardContent>
    </Card>
  );
}

function AnteprimaOriginale({
  file,
}: {
  file: { name: string; preview: string; url: string; mimePreview: string };
}) {
  return (
    <>
      {file.mimePreview === "application/pdf" ? (
        <iframe
          title={`Originale ${file.name}`}
          src={file.preview}
          className="h-[36rem] w-full rounded-lg border bg-white"
        />
      ) : /image\/hei[cf]/.test(file.mimePreview) ? (
        <p className="rounded-lg border bg-muted/30 p-4 text-sm">
          Foto HEIC originale conservata. Usa “Apri originale” o
          “Scarica originale” per visualizzarla sul dispositivo.
        </p>
      ) : (
        <img
          loading="lazy"
          alt={`Originale ${file.name}`}
          src={file.preview}
          className="max-h-[45rem] w-full rounded-lg border bg-white object-contain"
        />
      )}
    </>
  );
}
