/**
 * Pagina pubblica /giornale-dl/:token: la pagina firmata del giornale per la direzione
 * lavori. Niente login, il link scade. Il documento sta in un iframe senza script.
 */
import { useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export default function GiornaleDirezioneLavori() {
  const { token } = useParams<{ token: string }>();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["giornale-dl-documento", token],
    queryFn: async () => {
      const { data: esito, error: errore } = await supabase.functions.invoke("giornale-dl-documento", { body: { token } });
      if (errore) {
        const dettaglio = errore.context ? await errore.context.json?.().catch((): null => null) : null;
        throw new Error(dettaglio?.error || "Documento non disponibile");
      }
      return esito as { html: string };
    },
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Caricamento del documento">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data?.html) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">{error instanceof Error ? error.message : "Documento non disponibile."}</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-white">
      <div className="flex items-center justify-end border-b p-2">
        <Button size="sm" variant="outline" onClick={() => iframeRef.current?.contentWindow?.print()}>
          <Printer className="mr-2 h-4 w-4" aria-hidden="true" />Stampa o salva PDF
        </Button>
      </div>
      {/* allow-same-origin serve solo a far partire la stampa da qui; senza allow-scripts il documento non esegue niente. */}
      <iframe ref={iframeRef} title="Giornale dei lavori" srcDoc={data.html} sandbox="allow-same-origin allow-modals" className="w-full flex-1 border-0" />
    </div>
  );
}
