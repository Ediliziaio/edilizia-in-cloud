import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";

export function useContactCustomFields() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: queryKeys.customFields.byType(companyId, "contact"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_custom_fields")
        .select("*")
        .eq("company_id", companyId!)
        .eq("object_type", "contact")
        .order("position");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });
}

export function useOpportunityCustomFields() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: queryKeys.customFields.byType(companyId, "opportunity"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_custom_fields")
        .select("*")
        .eq("company_id", companyId!)
        .eq("object_type", "opportunity")
        .order("position");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });
}

export function useContactFieldValues(contactId: string | null) {
  return useQuery({
    queryKey: queryKeys.customFields.contactValues(contactId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_contact_field_values")
        .select("*")
        .eq("contact_id", contactId!);
      if (error) throw error;
      return data;
    },
    enabled: !!contactId,
  });
}

export function useOpportunityFieldValues(opportunityId: string | null) {
  return useQuery({
    queryKey: queryKeys.customFields.opportunityValues(opportunityId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_opportunity_field_values")
        .select("*")
        .eq("opportunity_id", opportunityId!);
      if (error) throw error;
      return data;
    },
    enabled: !!opportunityId,
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: any }) => {
      const { error } = await supabase
        .from("marketing_contacts")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpsertContactFieldValues() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: { contact_id: string; field_id: string; value: string | null }[]) => {
      if (!values.length) return;
      for (const v of values) {
        const { data: existing } = await supabase
          .from("marketing_contact_field_values")
          .select("id")
          .eq("contact_id", v.contact_id)
          .eq("field_id", v.field_id)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("marketing_contact_field_values")
            .update({ value: v.value })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("marketing_contact_field_values")
            .insert(v);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.customFields.all });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpsertOpportunityFieldValues() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: { opportunity_id: string; field_id: string; value: string | null }[]) => {
      if (!values.length) return;
      for (const v of values) {
        const { data: existing } = await supabase
          .from("marketing_opportunity_field_values")
          .select("id")
          .eq("opportunity_id", v.opportunity_id)
          .eq("field_id", v.field_id)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("marketing_opportunity_field_values")
            .update({ value: v.value })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("marketing_opportunity_field_values")
            .insert(v);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
    },
    onError: (e: any) => toast.error(e.message),
  });
}
