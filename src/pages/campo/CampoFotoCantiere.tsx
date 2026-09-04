/**
 * Rullino foto della commessa.
 *
 * Il rapportino chiedeva le foto la sera, con `capture="environment"` che su
 * telefono apre la fotocamera e rende la galleria irraggiungibile: gli scatti
 * fatti in giornata non si potevano allegare. Risultato, zero foto su tutti i
 * rapportini esistenti.
 *
 * Qui le foto si fanno QUANDO si fanno — davanti al lavoro — e restano
 * attaccate alla commessa. La sera il rapportino le pesca già pronte.
 * Ogni scatto viene compresso, marchiato con data/ora/cantiere/GPS e, se non
 * c'è campo, messo in coda: parte da solo al ritorno della rete.
 */
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Camera, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useFotoCantiere } from "@/hooks/useFotoCantiere";
import { useOfflineSync } from "@/hooks/campo/useOfflineSync";
import { FotoUploader } from "@/components/foto-cantiere/FotoUploader";
import { FotoGrid } from "@/components/foto-cantiere/FotoGrid";

export default function CampoFotoCantiere() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { queueCount } = useOfflineSync();
  const { foto, isLoading, upload, isUploading, elimina, getSignedUrl } = useFotoCantiere(orderId);

  const { data: order } = useQuery({
    queryKey: ["campo-foto-order", orderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, order_code, description, indirizzo_lavori")
        .eq("id", orderId!)
        .maybeSingle();
      return data;
    },
    enabled: !!orderId,
  });

  const nomeCantiere = order?.order_code ?? order?.description ?? undefined;

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-2 py-2 backdrop-blur">
        <button
          onClick={() => navigate(`/campo/lavoro/${orderId}`)}
          aria-label="Torna al lavoro"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl active:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Camera className="h-4 w-4 shrink-0 text-primary" />
            Foto cantiere
          </p>
          {nomeCantiere && (
            <p className="truncate text-xs text-muted-foreground">{nomeCantiere}</p>
          )}
        </div>
        {queueCount > 0 && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-xs font-semibold text-amber-700">
            <WifiOff className="h-3.5 w-3.5" />
            {queueCount} in attesa
          </span>
        )}
      </div>

      <div className="space-y-4 p-3">
        <FotoUploader
          onUpload={({ files, descrizione }) => upload({ files, descrizione, nomeCantiere })}
          isUploading={isUploading}
        />

        <div>
          <p className="mb-2 text-sm font-semibold text-muted-foreground">
            {foto.length > 0 ? `${foto.length} foto su questa commessa` : "Nessuna foto"}
          </p>
          <FotoGrid
            foto={foto}
            isLoading={isLoading}
            onElimina={elimina}
            getSignedUrl={getSignedUrl}
          />
        </div>
      </div>
    </div>
  );
}
