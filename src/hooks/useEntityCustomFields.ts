/**
 * Hook generici per i campi personalizzati delle entità cantiere.
 * Supporta: ordini_variazione, giornale_lavori, pos_document, duvri_document
 * e qualsiasi futuro entity_type registrato in marketing_custom_fields.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";

/** Definizioni dei campi personalizzati per un dato object_type */
export function useEntityCustomFields(objectType: string) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: queryKeys.customFields.byType(companyId, objectType),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_custom_fields")
        .select("*")
        .eq("company_id", companyId!)
        .eq("object_type", objectType)
        .order("position");
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Valori salvati per una specifica istanza di un'entità */
export function useEntityFieldValues(entityType: string, entityId: string | null) {
  return useQuery({
    queryKey: queryKeys.entityCustomFieldValues.byEntity(entityType, entityId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_custom_field_values" as any)
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId!);
      if (error) throw error;
      return (data || []) as Array<{ id: string; field_id: string; value: string | null }>;
    },
    enabled: !!entityId,
    staleTime: 30 * 1000,
  });
}

/** Salva/aggiorna valori dei campi personalizzati tramite upsert */
export function useUpsertEntityFieldValues() {
  const queryClient = useQueryClient();
  const { effectiveCompany } = useAuth();

  return useMutation({
    mutationFn: async (values: {
      entity_type: string;
      entity_id: string;
      field_id: string;
      value: string | null;
    }[]) => {
      if (!values.length || !effectiveCompany?.id) return;
      const rows = values.map((v) => ({
        ...v,
        company_id: effectiveCompany.id,
      }));
      const { error } = await supabase
        .from("entity_custom_field_values" as any)
        .upsert(rows, { onConflict: "entity_type,entity_id,field_id" });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      if (variables.length > 0) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.entityCustomFieldValues.byEntity(
            variables[0].entity_type,
            variables[0].entity_id,
          ),
        });
      }
    },
    onError: (e: any) => toast.error(e.message ?? "Errore nel salvataggio"),
  });
}
