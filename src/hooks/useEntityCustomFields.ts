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
import { readDefinitionPages } from "@/lib/custom-fields/federatedCatalogue";
import type { Tables } from "@/integrations/supabase/types";

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "Errore nel salvataggio";
}

/** Definizioni dei campi personalizzati per un dato object_type */
export function useEntityCustomFields(objectType: string, allowed = true) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: queryKeys.customFields.byType(companyId, objectType),
    queryFn: async ({ signal }) => (await readDefinitionPages(async (from, to) => {
      const { data, error } = await supabase
        .from("marketing_custom_fields")
        .select("*")
        .eq("company_id", companyId!)
        .eq("object_type", objectType)
        // Un campo eliminato sparisce dalle schede: i valori restano e il campo si può ripristinare.
        .is("deleted_at", null)
        .order("position").order("id").range(from, to).abortSignal(signal);
      if (error) throw error;
      return data || [];
    }, signal)) as Tables<"marketing_custom_fields">[],
    enabled: !!companyId && allowed,
    staleTime: 5 * 60 * 1000,
  });
}

/** Valori salvati per una specifica istanza di un'entità */
export function useEntityFieldValues(entityType: string, entityId: string | null, allowed = true) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: queryKeys.entityCustomFieldValues.byEntity(entityType, entityId, companyId),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("entity_custom_field_values")
        .select("*")
        .eq("company_id", companyId!)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId!).abortSignal(signal);
      if (error) throw error;
      return (data || []) as Array<{ id: string; field_id: string; value: string | null }>;
    },
    enabled: !!entityId && !!companyId && allowed,
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
      if (!values.length) return;
      if (!effectiveCompany?.id) throw new Error("Seleziona un’azienda prima di salvare.");
      const companyId = effectiveCompany.id;
      const rows = values.map((v) => ({
        ...v,
        company_id: effectiveCompany.id,
      }));
      const { data: saved, error } = await supabase
        .from("entity_custom_field_values")
        .upsert(rows, { onConflict: "entity_type,entity_id,field_id" }).select("field_id");
      if (error) throw error;
      if (saved?.length !== rows.length) throw new Error("Il server non ha confermato tutti i campi. Le modifiche restano da salvare.");
      return { companyId };
    },
    onSuccess: (result, variables) => {
      const targets = new Map(variables.map(v => [`${v.entity_type}:${v.entity_id}`, v]));
      for (const target of targets.values()) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.entityCustomFieldValues.byEntity(
            target.entity_type,
            target.entity_id,
            result?.companyId,
          ),
        });
      }
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
