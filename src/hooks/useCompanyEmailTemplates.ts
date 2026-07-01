import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CompanyEmailTemplate {
  id: string;
  company_id: string;
  name: string;
  category: string;
  subject: string;
  body_text: string;
  created_at: string;
}

export function useCompanyEmailTemplates() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["company_email_templates", companyId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("email_templates")
        .select("*")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data as CompanyEmailTemplate[];
    },
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async (t: Omit<CompanyEmailTemplate, "id" | "company_id" | "created_at">) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("email_templates")
        .insert({ ...t, company_id: companyId! })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company_email_templates", companyId] }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...t }: Partial<CompanyEmailTemplate> & { id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("email_templates")
        .update({ ...t, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company_email_templates", companyId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("email_templates")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company_email_templates", companyId] }),
  });

  return { templates, isLoading, createMutation, updateMutation, deleteMutation };
}
