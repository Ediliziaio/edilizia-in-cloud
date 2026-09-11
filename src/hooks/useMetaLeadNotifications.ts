import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { subscribeChannel } from "@/lib/realtime/subscribeChannel";
import { useMarketingRoutePrefix } from "@/hooks/useMarketingRoutePrefix";

type OpportunitaNata = {
  id?: string;
  name?: string | null;
  source?: string | null;
  pipeline_id?: string | null;
};

/** Stessa regola del trigger dedupe_fb_open_opportunity: fonte che comincia
 *  per «facebook» o che contiene «meta» ("facebook green", "Meta Best Infissi",
 *  "meta_lead_…"). Così avviso e deduplica chiamano "da Facebook" le stesse. */
export function daFacebook(source: string | null | undefined): boolean {
  const s = (source ?? "").toLowerCase();
  return s.startsWith("facebook") || s.includes("meta");
}

/** «Lead Ads - Mario Rossi» (il nome che dà meta-process-leads) → «Mario Rossi». */
function nomeLead(nome: string | null | undefined): string {
  return (nome ?? "").replace(/^Lead Ads\s*-\s*/i, "").trim();
}

/** Le opportunità nate insieme (un'importazione, più lead nello stesso giro
 *  dell'automazione) diventano un avviso solo. */
const RACCOLTA_MS = 1500;

/**
 * Avviso «Nuovo lead da Facebook» sulla dashboard Marketing.
 *
 * Prima ascoltava integration_webhook_events, che non è nella pubblicazione
 * del tempo reale: l'avviso non è mai scattato. E non conviene aggiungerla:
 * il payload contiene le risposte del modulo (nome, telefono, email) e il
 * tempo reale le spedirebbe nel browser di ogni membro dell'azienda, anche di
 * chi vede solo i lead assegnati a lui.
 *
 * Si ascolta invece la nascita dell'opportunità del lead (quasi sempre la crea
 * l'automazione dell'azienda, con la fonte del contatto): marketing_opportunities
 * è già in tempo reale e le regole di visibilità valgono, quindi l'avviso
 * arriva solo a chi quel lead lo può vedere, con il nome e un link per aprirlo.
 *
 * Le notifiche meta_lead_assigned non si ascoltano più qui: le mostra già
 * NotificationsRealtime (in CompanyLayout), e sulla dashboard uscivano due volte.
 */
export function useMetaLeadNotifications() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const navigate = useNavigate();
  const prefisso = useMarketingRoutePrefix();

  // navigate e prefisso cambiano a ogni navigazione: in un ref, così il canale
  // non si chiude e riapre per niente.
  const vai = useRef<(percorso: string) => void>(() => {});
  vai.current = (percorso) => navigate(`${prefisso}${percorso}`);

  useEffect(() => {
    if (!companyId) return;
    let raccolte: OpportunitaNata[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;

    const avvisa = () => {
      timer = undefined;
      const nuove = raccolte;
      raccolte = [];
      if (nuove.length === 0) return;
      const ultima = nuove[nuove.length - 1];

      if (nuove.length === 1) {
        const { id, pipeline_id: pipelineId } = ultima;
        toast.info("Nuovo lead da Facebook", {
          description: nomeLead(ultima.name) || undefined,
          duration: 8000,
          action: id && pipelineId
            ? { label: "Apri", onClick: () => vai.current(`/opportunita?pipeline=${pipelineId}&apri=${id}`) }
            : undefined,
        });
        return;
      }

      const stessaPipeline = nuove.every((o) => o.pipeline_id === ultima.pipeline_id);
      const pipeline = stessaPipeline && ultima.pipeline_id ? `?pipeline=${ultima.pipeline_id}` : "";
      const nomi = nuove.map((o) => nomeLead(o.name)).filter(Boolean).slice(0, 2);
      const altri = nuove.length - nomi.length;
      toast.info(`${nuove.length} nuovi lead da Facebook`, {
        description: nomi.length ? nomi.join(", ") + (altri > 0 ? ` e altri ${altri}` : "") : undefined,
        duration: 8000,
        action: { label: "Vedi", onClick: () => vai.current(`/opportunita${pipeline}`) },
      });
    };

    const canale = supabase
      .channel(`meta-leads:${companyId}:${Math.random().toString(36).slice(2, 9)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "marketing_opportunities", filter: `company_id=eq.${companyId}` },
        (payload) => {
          const opp = payload.new as OpportunitaNata;
          if (!daFacebook(opp?.source)) return;
          raccolte.push(opp);
          if (!timer) timer = setTimeout(avvisa, RACCOLTA_MS);
        },
      );
    subscribeChannel(canale, "meta-leads");

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(canale);
    };
  }, [companyId]);
}
