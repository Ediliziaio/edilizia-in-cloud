// MP04 — Hook trigger notifiche automatiche.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { toast } from "sonner";
import type { Database, Json } from "@/integrations/supabase/types";

export type WANotificaTrigger = Database["public"]["Tables"]["wa_notifiche_triggers"]["Row"];

export type NotificaKind =
  | "fattura_scaduta"
  | "ddt_pendente"
  | "margine_basso"
  | "approvazione_pendente"
  | "preventivo_inviato"
  | "sal_raggiunto"
  | "fattura_emessa"
  | "custom";

export const TRIGGER_LABELS: Record<NotificaKind, string> = {
  fattura_scaduta: "Fattura scaduta",
  ddt_pendente: "DDT in attesa di validazione",
  margine_basso: "Cantiere sotto marginalità target",
  approvazione_pendente: "Approvazione richiesta",
  preventivo_inviato: "Preventivo inviato al cliente",
  sal_raggiunto: "SAL cantiere raggiunto",
  fattura_emessa: "Fattura emessa al cliente",
  custom: "Personalizzato",
};

export function useWANotificheTriggers() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["wa", "notifiche", "triggers", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_notifiche_triggers")
        .select("*")
        .eq("company_id", companyId!)
        .order("trigger_kind");
      if (error) throw error;
      return (data ?? []) as WANotificaTrigger[];
    },
  });
}

export interface UpsertTriggerPayload {
  id?: string;
  trigger_kind: NotificaKind;
  enabled: boolean;
  config: Json;
  template_name: string;
  wa_number_id: string | null;
  destinatario_kind: "titolare" | "cliente" | "operaio" | "custom";
  destinatario_custom_phone?: string | null;
}

export function useUpsertWATrigger() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpsertTriggerPayload) => {
      const { error } = await supabase
        .from("wa_notifiche_triggers")
        .upsert(
          { company_id: companyId!, ...payload },
          { onConflict: "company_id,trigger_kind" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa", "notifiche", "triggers"] });
      toast.success("Trigger aggiornato.");
    },
    onError: (err: Error) => toast.error(`Errore: ${err.message}`),
  });
}

export function useToggleWATrigger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("wa_notifiche_triggers")
        .update({ enabled: payload.enabled })
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa", "notifiche", "triggers"] });
    },
    onError: (err: Error) => toast.error(`Errore: ${err.message}`),
  });
}
