/**
 * Posizione nelle timbrature: cosa serve per legge (26/11/2026, piano campo completo, punto 4.2, ufficio).
 * Quante persone hanno letto l'informativa nell'app (campo_informative, lettura dell'amministratore) e il
 * promemoria dell'accordo sindacale o dell'autorizzazione dell'Ispettorato (art. 4 dello Statuto dei
 * lavoratori), da caricare nei documenti dell'azienda.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { VERSIONE_INFORMATIVA_POSIZIONE } from "@/components/campo/InformativaPosizione";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function PosizioneTimbratureConfig({ companyId }: { companyId: string }) {
  const t = useT();
  const q = useQuery({
    queryKey: ["informative-posizione-lette", companyId],
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await (supabase as unknown as { from: (t: "campo_informative") => any }).from("campo_informative")
        .select("user_id", { count: "exact", head: true })
        .eq("company_id", companyId).eq("tipo", "posizione_timbratura").eq("versione", VERSIONE_INFORMATIVA_POSIZIONE);
      if (error) throw error;
      return count ?? 0;
    },
  });
  return (
    <SezioneImpostazione id="posizione-timbrature" titolo={t("Posizione nelle timbrature")}>
      <div className="space-y-2 p-4 text-sm">
        <p className="flex items-center gap-2 font-medium"><MapPin className="size-4 text-primary" aria-hidden="true" />
          {q.isSuccess ? t("Hanno letto l'informativa: {n} persone", { n: q.data }) : t("Carico…")}</p>
        <p className="text-muted-foreground">{t("Prima della prima timbratura l'app mostra come si usa la posizione e la prende solo dopo «Ho letto».")}</p>
        <p className="text-muted-foreground">{t("Per usare la posizione serve anche l'accordo sindacale o l'autorizzazione dell'Ispettorato del lavoro (art. 4 dello Statuto dei lavoratori): caricalo nei documenti dell'azienda.")}</p>
        <Link to="/azienda/impostazioni/documenti-azienda" className="font-medium text-primary underline">{t("Apri i documenti dell'azienda")}</Link>
      </div>
    </SezioneImpostazione>
  );
}
