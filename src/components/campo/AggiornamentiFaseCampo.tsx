import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Images, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { FotoCantiereRiservata } from "@/components/campo/FotoCantiereRiservata";
import { supabase } from "@/integrations/supabase/client";
import { FOTO_AVANZAMENTO_BUCKET } from "@/lib/campo/schedaCantiere";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

export function AggiornamentiFaseCampo({ orderId, phaseId }: { orderId: string; phaseId: string }) {
  const t = useT();
  const dataAggiornamento = new Intl.DateTimeFormat(intlCampo(), {
    timeZone: "Europe/Rome", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
  const { effectiveCompany, profile, user } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id;
  const [aperto, setAperto] = useState(false);
  const [fotoAttiva, setFotoAttiva] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["campo-avanzamenti-scheda", orderId, companyId, user?.id, phaseId],
    enabled: aperto && !!companyId && !!user?.id,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc("campo_avanzamenti_cantiere", {
        p_azienda: companyId!, p_ordine: orderId, p_fase: phaseId,
      }).abortSignal(signal);
      if (error) throw error;
      return data ?? [];
    },
  });

  return <details className="group/aggiornamenti" onToggle={event => setAperto(event.currentTarget.open)}>
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
      <ChevronDown className="size-4 shrink-0 transition-transform group-open/aggiornamenti:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      {t("Aggiornamenti dal cantiere")}
    </summary>
    {aperto && (query.isError ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
      {t("Aggiornamenti non disponibili.")}
      <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>{t("Riprova")}</Button>
    </div> : query.isPending ? <p role="status" className="pb-2 text-xs text-muted-foreground">{t("Carico gli aggiornamenti…")}</p>
      : query.data.length ? <ul className="divide-y" aria-label={t("Aggiornamenti dal cantiere")}>
        {query.data.map(a => <li key={a.id} className="space-y-1 py-2">
          <p className="break-words text-sm font-medium"><span dir="auto">{a.sottofase || t("Fase")}</span> · {a.percentuale}%</p>
          <p className="text-xs text-muted-foreground">
            {[dataAggiornamento.format(new Date(a.registrato_il)), a.autore].filter(Boolean).join(" · ")}
          </p>
          {a.note && <p className="whitespace-pre-wrap break-words text-sm" dir="auto">{a.note}</p>}
          {a.foto.length > 0 && <div className="flex flex-wrap gap-1">
            {a.foto.map((path, i) => <Button key={path} type="button" size="sm" variant="outline" className="min-h-11 gap-1.5"
              onClick={() => setFotoAttiva(path)}>
              <Images className="size-4" aria-hidden="true" /> {t("Foto {n}", { n: i + 1 })}
            </Button>)}
          </div>}
        </li>)}
      </ul> : <p className="pb-2 text-xs text-muted-foreground">{t("Nessun aggiornamento registrato.")}</p>)}
    {fotoAttiva && <FotoCantiereRiservata key={fotoAttiva} bucket={FOTO_AVANZAMENTO_BUCKET} percorso={fotoAttiva}
      titolo={t("Foto dell’aggiornamento")} chiudi={() => setFotoAttiva(null)} />}
  </details>;
}
