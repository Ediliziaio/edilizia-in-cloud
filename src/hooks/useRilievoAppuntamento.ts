/**
 * Lo stato del rilievo che nasce con l'appuntamento di sopralluogo.
 * Piano: docs/piano-sopralluoghi-vendita-tecnico.md, lotto 1. Il riquadro è
 * `components/sopralluoghi/RilievoAppuntamento.tsx`; il lavoro vero lo fa
 * `sopralluogo_da_appuntamento` nel database.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { usePermissions } from "@/hooks/usePermissions";
import { rilievoDaAppuntamento } from "@/lib/api/surveys";
import {
  appuntamentoConRilievo, modelloDiPartenza, preparaRilievoDiPartenza, tipoRilievoDaAppuntamento,
  type ModelloRilievo,
} from "@/lib/surveys/rilievoAppuntamento";

export interface RilievoEsistente { id: string; code: string | null }

export interface RilievoAppuntamentoStato {
  visibile: boolean;
  esistente: RilievoEsistente | null;
  attivo: boolean;
  setAttivo: (v: boolean) => void;
  modelloId: string | null;
  setModelloId: (v: string) => void;
  modelli: ModelloRilievo[];
  caricaModelli: boolean;
  tipo: "commerciale" | "tecnico";
  /** Dopo il salvataggio: prepara il rilievo se serve. Restituisce l'id, o null se non serviva. */
  prepara: (appointmentId: string) => Promise<string | null>;
}

export function useRilievoAppuntamento({
  companyId, appointmentId, appointmentType, spento,
}: {
  companyId: string | null | undefined;
  appointmentId: string | null | undefined;
  appointmentType: string;
  /** Dialogo chiuso o in sola lettura: niente letture, niente rilievo. */
  spento: boolean;
}): RilievoAppuntamentoStato {
  const { isFeatureEnabled } = useFeatureFlags();
  const { canViewSopralluoghi } = usePermissions();
  const visibile = !!companyId && !spento && canViewSopralluoghi
    && isFeatureEnabled("surveys_module") && appuntamentoConRilievo(appointmentType);

  const esistente = useQuery({
    queryKey: ["rilievo-appuntamento", appointmentId],
    enabled: visibile && !!appointmentId,
    queryFn: async (): Promise<RilievoEsistente | null> => {
      const { data, error } = await supabase.from("surveys").select("id, code")
        .eq("appointment_id", appointmentId!).is("deleted_at", null).limit(1).maybeSingle();
      if (error) throw error;
      return (data as RilievoEsistente | null) ?? null;
    },
  });

  const modelli = useQuery({
    queryKey: ["rilievo-appuntamento-modelli", companyId],
    enabled: visibile && !esistente.data,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const [lista, ultimo] = await Promise.all([
        supabase.rpc("list_survey_templates_with_settings" as never),
        supabase.from("surveys").select("template_id").eq("company_id", companyId!).is("deleted_at", null)
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (lista.error) throw lista.error;
      const righe = ((lista.data ?? []) as unknown as Array<ModelloRilievo & {
        enabled_for_company?: boolean; is_system?: boolean; company_id?: string | null;
      }>).filter((t) => t.enabled_for_company !== false && (t.is_system || t.company_id === companyId))
        .map(({ id, name, category }) => ({ id, name, category }));
      return { righe, ultimo: (ultimo.data as { template_id?: string } | null)?.template_id ?? null };
    },
  });

  const [attivo, setAttivoStato] = useState(preparaRilievoDiPartenza(appointmentType));
  const toccato = useRef(false);
  useEffect(() => {
    // Cambiando tipo la spunta segue il tipo, finché la persona non l'ha toccata.
    if (!toccato.current) setAttivoStato(preparaRilievoDiPartenza(appointmentType));
  }, [appointmentType]);
  const setAttivo = (v: boolean) => { toccato.current = true; setAttivoStato(v); };

  const [modelloScelto, setModelloId] = useState<string | null>(null);
  const modelloId = modelloScelto ?? modelloDiPartenza(modelli.data?.righe ?? [], modelli.data?.ultimo);
  const tipo = tipoRilievoDaAppuntamento(appointmentType);

  const prepara = async (id: string) => {
    if (!visibile || !attivo || esistente.data || !modelloId) return null;
    return rilievoDaAppuntamento(id, modelloId, tipo, true);
  };

  return {
    visibile, esistente: esistente.data ?? null, attivo, setAttivo, modelloId, setModelloId,
    modelli: modelli.data?.righe ?? [], caricaModelli: modelli.isLoading, tipo, prepara,
  };
}

