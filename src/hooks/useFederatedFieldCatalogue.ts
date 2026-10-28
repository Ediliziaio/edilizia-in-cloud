import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { catalogueFields, catalogueScopes, readDefinitionPages, type CatalogueSource, type DefinitionRow } from "@/lib/custom-fields/federatedCatalogue";

/** Narrow selects: no values, files, contact identities or service-role access. */
export async function fetchFieldDefinitions(source: CatalogueSource, companyId: string, signal: AbortSignal) {
  return (await fetchFieldCatalogue(source, companyId, signal)).fields;
}

export async function fetchFieldCatalogue(source: CatalogueSource, companyId: string, signal: AbortSignal) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) throw new Error("Azienda non disponibile.");
  const rows = await readDefinitionPages(async (from, to) => {
    const query = source === "catalogue"
      ? supabase.from("listino_macrocategoria_fields")
        .select("id, macrocategoria_id, field_key, field_label, field_type, field_unit, required, show_in_pdf, listino_macrocategorie!inner(id,nome,company_id,attivo)")
        .eq("listino_macrocategorie.company_id", companyId).eq("listino_macrocategorie.attivo", true)
      : source === "documents"
        ? supabase.from("documento_template_fields")
          .select("id, template_id, nome, etichetta, tipo, segnaposto, obbligatorio, documento_templates!documento_fields_template_company_fk!inner(id,nome,company_id,attivo)")
          .eq("company_id", companyId).eq("documento_templates.company_id", companyId).eq("documento_templates.attivo", true)
        : source === "surveys"
          ? supabase.from("survey_templates").select("id, name, schema")
            .or(`company_id.eq.${companyId},and(is_system.eq.true,company_id.is.null)`).eq("is_active", true)
          : source === "contracts"
            ? supabase.from("quote_templates").select("id, name, contractual_terms_text, legal_terms_text")
              .eq("company_id", companyId).eq("is_active", true)
            : source === "recruitment"
              ? supabase.from("hr_candidatura_forms").select("id, titolo, campi").eq("company_id", companyId).eq("attivo", true)
              : supabase.from("lead_forms").select("id, name, fields").eq("company_id", companyId);
    const { data, error } = await query.order("id").range(from, to).abortSignal(signal);
    if (error) throw error;
    return (data ?? []) as unknown as DefinitionRow[];
  }, signal);
  const fields = catalogueFields(source, rows);
  return { fields, scopes: catalogueScopes(source, rows, fields) };
}

export function useFederatedFieldCatalogue(source: CatalogueSource, active: boolean) {
  const { effectiveCompany, user } = useAuth();
  const p = usePermissions();
  const companyId = effectiveCompany?.id;
  const allowed = !p.isLoading && p.canViewSettingsCustomization === true && (
    source === "catalogue" || source === "contracts" ? p.canViewSettingsPricing === true
      : source === "documents" ? p.canViewFirmaElettronica === true
        : source === "surveys" ? p.canViewSopralluoghi === true
          : source === "recruitment" ? p.canViewPersone === true : true
  );
  const query = useQuery({
    queryKey: ["federated-field-catalogue", companyId, user?.id, source],
    queryFn: ({ signal }) => fetchFieldCatalogue(source, companyId!, signal),
    enabled: active && !!companyId && allowed,
    staleTime: 30_000,
    gcTime: 0,
    retry: false,
  });
  // Do not return cached rows while permissions or tenant are being re-evaluated.
  return { ...query, data: allowed && active ? query.data?.fields : undefined, scopes: allowed && active ? query.data?.scopes : undefined, allowed, checkingPermissions: p.isLoading };
}
