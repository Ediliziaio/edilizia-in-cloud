/**
 * @file useSendSms.ts
 * @description Hook per l'invio di un singolo SMS transazionale via Telnyx.
 * @author Claude Code — AEDIX S.r.l.
 * @date 2026-04-07
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { SmsComposeFormData, TelnyxSendSmsResponse } from "@/types/sms";

export function useSendSms() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const mutation = useMutation<TelnyxSendSmsResponse, Error, SmsComposeFormData>({
    mutationFn: async (formData) => {
      if (!companyId) throw new Error("Azienda non trovata");

      const { data, error } = await supabase.functions.invoke<TelnyxSendSmsResponse>(
        "telnyx-send-sms",
        {
          body: {
            to_number: formData.to_number,
            body: formData.body,
            company_id: companyId,
            trigger_type: "manual",
            trigger_entity: formData.trigger_entity ?? null,
            trigger_ref: formData.trigger_ref ?? null,
          },
        }
      );

      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error ?? "Invio SMS fallito");

      return data;
    },
    onSuccess: () => {
      toast.success("SMS inviato", { description: "Il messaggio è stato inviato con successo." });
      queryClient.invalidateQueries({ queryKey: ["sms-messages", companyId] });
      queryClient.invalidateQueries({ queryKey: ["sms-stats", companyId] });
    },
    onError: (error) => {
      toast.error("Errore invio SMS", { description: error.message });
    },
  });

  return {
    sendSms: mutation.mutate,
    sendSmsAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  };
}
