/**
 * Rullino foto della commessa.
 *
 * Il rapportino chiedeva le foto la sera, con `capture="environment"` che su
 * telefono apre la fotocamera e rende la galleria irraggiungibile: gli scatti
 * fatti in giornata non si potevano allegare. Risultato, zero foto su tutti i
 * rapportini esistenti.
 *
 * Qui le foto si fanno QUANDO si fanno — davanti al lavoro — e restano
 * attaccate alla commessa. La sera il rapportino le pesca già pronte
 * (vedi «campo-foto-del-giorno» in CampoRapportino).
 * Ogni scatto viene compresso, marchiato con data/ora/cantiere/GPS e, se non
 * c'è campo, messo in coda: parte da solo al ritorno della rete.
 *
 * 24/11/2026 (founder: «quando scatto le foto posso vedere più foto»): rullino come quello del telefono (3 per
 * riga, per giorno, a tutto schermo si sfogliano), le foto scattate adesso col bordo e «Scatta un'altra» subito
 * sopra, così si fanno più foto di fila senza cercare il bottone.
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Camera, CheckCircle2, Image as ImageIcon, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFotoCantiere } from "@/hooks/useFotoCantiere";
import { useOfflineSync } from "@/hooks/campo/useOfflineSync";
import { ScattaFoto } from "@/components/campo/ScattaFoto";
import { RullinoCampo } from "@/components/campo/RullinoCampo";
import { cn } from "@/lib/utils";
import { PILLOLA } from "@/lib/campo/stileCampo";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export default function CampoFotoCantiere() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const t = useT();
  const { user } = useAuth();
  const { queueCount } = useOfflineSync();
  const { foto, isLoading, elimina, getSignedUrl } = useFotoCantiere(orderId);
  // Le foto nate da quando la pagina è aperta sono quelle appena scattate.
  const [aperturaPagina] = useState(() => Date.now());
  const nuove = foto.filter(f => f.uploaded_by === user?.id && new Date(f.created_at).getTime() >= aperturaPagina - 5_000).length;

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
    <div className="mx-auto w-full max-w-3xl">
      <div className="sticky -top-3 z-10 flex items-center gap-2 border-b bg-background/95 px-1 py-2 backdrop-blur md:top-14">
        <button
          onClick={() => navigate(`/campo/lavoro/${orderId}`)}
          aria-label={t("Torna al lavoro")}
          className="flex size-11 shrink-0 items-center justify-center rounded-full active:bg-muted max-md:hidden"
        >
          <ArrowLeft className="size-5 rtl:rotate-180" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-1.5 text-[17px] font-bold">
            <Camera className="size-4 shrink-0 text-primary" aria-hidden="true" />
            {t("Foto cantiere")}
            {foto.length > 0 && <span className="text-[13px] font-semibold text-muted-foreground">· {foto.length}</span>}
          </h1>
          {nomeCantiere && <p dir="auto" className="truncate text-xs text-muted-foreground">{nomeCantiere}</p>}
        </div>
        {queueCount > 0 && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-xs font-semibold text-amber-700">
            <WifiOff className="size-3.5" aria-hidden="true" />
            {t("{n} in attesa", { n: queueCount })}
          </span>
        )}
      </div>

      <div className="space-y-3 py-3">
        {orderId && (
          <div className="grid grid-cols-2 gap-2">
            <ScattaFoto orderId={orderId} nomeCantiere={nomeCantiere} className="min-h-14 rounded-full bg-primary text-[15px] text-primary-foreground">
              <Camera className="size-5" aria-hidden="true" />{nuove > 0 ? t("Scatta un'altra") : t("Scatta")}
            </ScattaFoto>
            <ScattaFoto orderId={orderId} nomeCantiere={nomeCantiere} galleria className={cn(PILLOLA, "min-h-14 text-[15px]")}>
              <ImageIcon className="size-5" aria-hidden="true" />{t("Galleria")}
            </ScattaFoto>
          </div>
        )}
        {nuove > 0 && (
          <p role="status" className="flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-[13px] font-semibold text-emerald-800">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            {nuove === 1 ? t("1 foto salvata adesso: la trovi col bordo qui sotto.") : t("{n} foto salvate adesso: le trovi col bordo qui sotto.", { n: nuove })}
          </p>
        )}
        <p className="px-1 text-xs text-muted-foreground">{t("Puoi scattare più foto di fila: ognuna si salva da sola, anche senza rete.")}</p>

        <RullinoCampo
          foto={foto}
          isLoading={isLoading}
          getSignedUrl={getSignedUrl}
          puoEliminare={f => f.uploaded_by === user?.id}
          onElimina={elimina}
          appena={nuove > 0 ? aperturaPagina : null}
        />
      </div>
    </div>
  );
}
