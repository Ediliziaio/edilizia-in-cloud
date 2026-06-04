/**
 * SilvioImageJob — mostra in chat l'immagine generata da Silvio (tool
 * genera_creativita → job in silvio_generation_jobs). Fa polling finché il job
 * non è completo, poi rivela l'immagine con l'animazione ImageGeneration.
 * Nessun gergo tecnico: l'utente vede "Sto creando l'immagine…" → l'immagine.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ImageGeneration } from "@/components/ui/ai-chat-image-generation";
import { Download, ImageOff } from "lucide-react";

interface GenJob {
  id: string;
  status: string | null;
  public_url: string | null;
  error: string | null;
  formato: string | null;
}

const ASPECT: Record<string, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
};

export function SilvioImageJob({ jobId }: { jobId: string }) {
  const { data: job } = useQuery({
    queryKey: ["silvio-gen-job", jobId],
    enabled: !!jobId,
    // Polling finché non è pronto/errore; poi stop.
    refetchInterval: (query) => {
      const j = query.state.data as GenJob | null | undefined;
      if (j && (j.public_url || j.error || j.status === "completed" || j.status === "failed")) return false;
      return 2500;
    },
    staleTime: 0,
    queryFn: async (): Promise<GenJob | null> => {
      const { data } = await supabase
        .from("silvio_generation_jobs")
        .select("id, status, public_url, error, formato")
        .eq("id", jobId)
        .maybeSingle();
      return (data as GenJob) ?? null;
    },
  });

  const url = job?.public_url ?? null;
  const failed = !!job?.error || job?.status === "failed";
  const aspect = ASPECT[job?.formato ?? "4:5"] ?? "aspect-[4/5]";

  if (failed) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
        <ImageOff className="h-4 w-4 shrink-0" />
        Non sono riuscito a creare l'immagine. Riprova tra poco.
      </div>
    );
  }

  return (
    <div className="my-2">
      <ImageGeneration status={url ? "completed" : "generating"}>
        {url ? (
          <img src={url} alt="Grafica generata da Silvio" className={`w-full ${aspect} object-cover`} />
        ) : (
          <div className={`w-full ${aspect} bg-slate-100`} />
        )}
      </ImageGeneration>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-orange-600 hover:text-orange-700"
        >
          <Download className="h-3.5 w-3.5" /> Scarica l'immagine
        </a>
      )}
    </div>
  );
}

export default SilvioImageJob;
