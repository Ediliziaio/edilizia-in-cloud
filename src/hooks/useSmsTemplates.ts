/**
 * Hook CRUD per i template SMS.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { SmsTemplate, SmsTemplateFormData } from "@/types/sms-marketing";

const SMS_TEMPLATES_KEY = "sms-templates";

export function useSmsTemplates() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading, error } = useQuery({
    queryKey: [SMS_TEMPLATES_KEY, companyId],
    queryFn: async (): Promise<SmsTemplate[]> => {
      if (!companyId) return [];
      const { data, error: queryError } = await supabase
        .from("sms_templates")
        .select(
          "id, company_id, nome, categoria, messaggio, variabili, attivo, created_at, updated_at"
        )
        .eq("company_id", companyId)
        .order("nome", { ascending: true });
      if (queryError) {
        console.error("[useSmsTemplates] list:", queryError);
        throw new Error("Impossibile caricare i template. Riprova tra qualche secondo.");
      }
      return (data ?? []) as SmsTemplate[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (formData: SmsTemplateFormData): Promise<SmsTemplate> => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const { data, error: insertError } = await supabase
        .from("sms_templates")
        .insert({ company_id: companyId, ...formData })
        .select(
          "id, company_id, nome, categoria, messaggio, variabili, attivo, created_at, updated_at"
        )
        .single();
      if (insertError) {
        console.error("[useSmsTemplates] create:", insertError);
        throw new Error("Errore durante il salvataggio del template.");
      }
      return data as SmsTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SMS_TEMPLATES_KEY, companyId] });
      toast.success("Template salvato con successo");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data: formData }: { id: string; data: SmsTemplateFormData }): Promise<SmsTemplate> => {
      const { data, error: updateError } = await supabase
        .from("sms_templates")
        .update({ ...formData })
        .eq("id", id)
        .select(
          "id, company_id, nome, categoria, messaggio, variabili, attivo, created_at, updated_at"
        )
        .single();
      if (updateError) {
        console.error("[useSmsTemplates] update:", updateError);
        throw new Error("Errore durante l'aggiornamento del template.");
      }
      return data as SmsTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SMS_TEMPLATES_KEY, companyId] });
      toast.success("Template aggiornato");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error: deleteError } = await supabase
        .from("sms_templates")
        .delete()
        .eq("id", id);
      if (deleteError) {
        console.error("[useSmsTemplates] remove:", deleteError);
        throw new Error("Errore durante l'eliminazione del template.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SMS_TEMPLATES_KEY, companyId] });
      toast.success("Template eliminato");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return {
    templates,
    isLoading,
    error: error instanceof Error ? error.message : null,
    create: (data: SmsTemplateFormData) => createMutation.mutateAsync(data),
    update: (id: string, data: SmsTemplateFormData) => updateMutation.mutateAsync({ id, data }),
    remove: (id: string) => removeMutation.mutateAsync(id),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isRemoving: removeMutation.isPending,
  };
}
