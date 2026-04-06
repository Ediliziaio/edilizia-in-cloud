/**
 * Hook per le preferenze SMS dell'azienda.
 * Mittente display, notifiche soglia, stato onboarding.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { SmsProviderConfig } from "@/types/sms-marketing";

const PROVIDER_CONFIG_KEY = "sms-provider-config";

export interface SmsProviderConfigFormData {
  mittente_display: string | null;
  notifica_soglia_email: boolean;
  notifica_soglia_inapp: boolean;
}

export function useSmsProviderConfig() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: [PROVIDER_CONFIG_KEY, companyId],
    queryFn: async (): Promise<SmsProviderConfig | null> => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("sms_provider_config")
        .select("id, company_id, mittente_display, notifica_soglia_email, notifica_soglia_inapp, onboarding_completato, created_at, updated_at")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data as SmsProviderConfig | null;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: async (formData: SmsProviderConfigFormData): Promise<void> => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const { error } = await supabase
        .from("sms_provider_config")
        .upsert(
          {
            company_id: companyId,
            mittente_display: formData.mittente_display || null,
            notifica_soglia_email: formData.notifica_soglia_email,
            notifica_soglia_inapp: formData.notifica_soglia_inapp,
          },
          { onConflict: "company_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROVIDER_CONFIG_KEY, companyId] });
      toast.success("Impostazioni SMS salvate");
    },
    onError: (err: Error) => toast.error(`Errore nel salvataggio: ${err.message}`),
  });

  return {
    config,
    isLoading,
    isOnboardingCompleto: config?.onboarding_completato ?? false,
    saveConfig: (data: SmsProviderConfigFormData) => saveMutation.mutateAsync(data),
    isSaving: saveMutation.isPending,
  };
}
