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
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
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
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
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
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
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

      // Batch: fetch all existing values in one query
      const contactId = values[0].contact_id;
      const fieldIds = values.map(v => v.field_id);
      const { data: existingRows } = await supabase
        .from("marketing_contact_field_values")
        .select("id, field_id")
        .eq("contact_id", contactId)
        .in("field_id", fieldIds);

      const existingMap = new Map((existingRows || []).map(r => [r.field_id, r.id]));

      const toUpdate = values.filter(v => existingMap.has(v.field_id));
      const toInsert = values.filter(v => !existingMap.has(v.field_id));

      // Batch update existing values
      const updatePromises = toUpdate.map(v =>
        supabase
          .from("marketing_contact_field_values")
          .update({ value: v.value })
          .eq("id", existingMap.get(v.field_id)!)
      );

      // Batch insert new values
      const insertPromise = toInsert.length > 0
        ? supabase.from("marketing_contact_field_values").insert(toInsert)
        : null;

      const results = await Promise.all([
        ...updatePromises,
        ...(insertPromise ? [insertPromise] : []),
      ]);

      for (const result of results) {
        if (result.error) throw result.error;
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

      // Batch: fetch all existing values in one query
      const opportunityId = values[0].opportunity_id;
      const fieldIds = values.map(v => v.field_id);
      const { data: existingRows } = await supabase
        .from("marketing_opportunity_field_values")
        .select("id, field_id")
        .eq("opportunity_id", opportunityId)
        .in("field_id", fieldIds);

      const existingMap = new Map((existingRows || []).map(r => [r.field_id, r.id]));

      const toUpdate = values.filter(v => existingMap.has(v.field_id));
      const toInsert = values.filter(v => !existingMap.has(v.field_id));

      // Batch update existing values
      const updatePromises = toUpdate.map(v =>
        supabase
          .from("marketing_opportunity_field_values")
          .update({ value: v.value })
          .eq("id", existingMap.get(v.field_id)!)
      );

      // Batch insert new values
      const insertPromise = toInsert.length > 0
        ? supabase.from("marketing_opportunity_field_values").insert(toInsert)
        : null;

      const results = await Promise.all([
        ...updatePromises,
        ...(insertPromise ? [insertPromise] : []),
      ]);

      for (const result of results) {
        if (result.error) throw result.error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.customFields.all });
    },
    onError: (e: any) => toast.error(e.message),
  });
}
