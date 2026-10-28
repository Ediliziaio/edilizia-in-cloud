import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readDefinitionPages } from "@/lib/custom-fields/federatedCatalogue";
export type AutomationFieldDefinition = {
  id: string;
  name: string;
  object_type: string;
  field_type: string;
  options: string[] | null;
  is_required: boolean;
};
export function useAutomationFieldDefinitions(
  companyId?: string,
  objectType?: string | null,
) {
  return useQuery({
    queryKey: ["automation-field-definitions", companyId, objectType],
    enabled: !!companyId && !!objectType,
    staleTime: 60_000,
    queryFn: async ({ signal }) =>
      (await readDefinitionPages(async (from, to) => {
        const { data, error } = await supabase.from("marketing_custom_fields")
          .select("id,name,object_type,field_type,options,is_required").eq(
            "company_id",
            companyId!,
          ).eq("object_type", objectType!).is("deleted_at", null).order(
            "position",
          ).order("id").range(from, to).abortSignal(signal);
        if (error) throw error;
        return data ?? [];
      }, signal)) as AutomationFieldDefinition[],
  });
}
