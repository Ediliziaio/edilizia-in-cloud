/**
 * Hook per i campi personalizzati del catalogo esteso (Sprint C).
 * Carica le definizioni (marketing_custom_fields) per i nuovi object_type:
 *  - product   → custom_field_values su article_templates
 *  - family    → custom_field_values su article_families
 *  - tariffa   → custom_field_values su tariffe_aziendali
 *
 * A differenza di useEntityFieldValues (tabella separata), i valori per il
 * catalogo esteso sono inline JSONB sul record stesso — questo hook ritorna
 * SOLO le definizioni; l'update dei valori avviene tramite la mutation
 * sull'entità host (es. useUpdateArticleTemplate).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";

export type CatalogObjectType = "product" | "family" | "tariffa";

export interface CompanyCustomFieldDef {
  id: string;
  company_id: string;
  name: string;
  object_type: string;
  field_type: string;
  options: string[] | null;
  position: number | null;
  section: string | null;
  created_at: string | null;
}

/** Definizioni di campi personalizzati per un object_type del catalogo */
export function useCompanyCustomFields(objectType: CatalogObjectType) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery<CompanyCustomFieldDef[]>({
    queryKey: queryKeys.customFields.byType(companyId, objectType),
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_custom_fields")
        .select("*")
        .eq("company_id", companyId)
        .eq("object_type", objectType)
        .order("position", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []) as CompanyCustomFieldDef[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Helper: estrae il valore tipizzato da un blob JSONB custom_field_values */
export function getCustomFieldValue(
  blob: Record<string, unknown> | null | undefined,
  fieldId: string,
): unknown {
  if (!blob || typeof blob !== "object") return undefined;
  return (blob as Record<string, unknown>)[fieldId];
}

/** Helper: produce un nuovo blob con il valore aggiornato (immutabile) */
export function setCustomFieldValue(
  blob: Record<string, unknown> | null | undefined,
  fieldId: string,
  value: unknown,
): Record<string, unknown> {
  const next = { ...(blob ?? {}) };
  if (value === null || value === undefined || value === "") {
    delete next[fieldId];
  } else {
    next[fieldId] = value;
  }
  return next;
}
