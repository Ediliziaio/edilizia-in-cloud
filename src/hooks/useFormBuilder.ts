import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type FormFieldType =
  | "text" | "email" | "phone" | "number" | "textarea"
  | "select" | "checkbox" | "radio" | "date"
  | "heading" | "paragraph" | "divider" | "hidden";

export interface FormField {
  id: string;
  name: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
  mapping?: string;
  defaultValue?: string; // for hidden fields
}

export interface LeadForm {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  description: string | null;
  fields: FormField[];
  theme: Record<string, any>;
  settings: Record<string, any>;
  is_published: boolean;
  total_views: number;
  total_submissions: number;
  created_at: string;
  updated_at: string;
}

export function useFormBuilder() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [editingForm, setEditingForm] = useState<LeadForm | null>(null);

  const { data: forms = [], isLoading } = useQuery({
    queryKey: ["lead-forms", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("lead_forms")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((f: any) => ({
        ...f,
        fields: (f.fields as FormField[]) || [],
        theme: (f.theme as Record<string, any>) || {},
        settings: (f.settings as Record<string, any>) || {},
      })) as LeadForm[];
    },
    enabled: !!companyId,
  });

  const createForm = useMutation({
    mutationFn: async (input: { name: string; slug: string }) => {
      if (!companyId) throw new Error("No company");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("lead_forms")
        .insert({
          company_id: companyId,
          name: input.name,
          slug: input.slug,
          created_by: user.id,
          fields: [
            { id: crypto.randomUUID(), name: "email", label: "Email", type: "email", required: true },
            { id: crypto.randomUUID(), name: "nome", label: "Nome", type: "text", required: true },
            { id: crypto.randomUUID(), name: "telefono", label: "Telefono", type: "phone", required: false },
          ],
          theme: { accent_color: "#2563eb", background_color: "#f9fafb" },
          settings: { submit_label: "Invia", success_message: "Grazie! Ti contatteremo presto." },
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-forms"] });
      toast.success("Form creato");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateForm = useMutation({
    mutationFn: async (form: Partial<LeadForm> & { id: string }) => {
      const { id, ...updates } = form;
      const payload: Record<string, any> = { ...updates, updated_at: new Date().toISOString() };
      const { error } = await supabase
        .from("lead_forms")
        .update(payload as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-forms"] });
      toast.success("Form aggiornato");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteForm = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lead_forms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-forms"] });
      toast.success("Form eliminato");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const togglePublish = useCallback(
    (form: LeadForm) => {
      updateForm.mutate({ id: form.id, is_published: !form.is_published });
    },
    [updateForm]
  );

  return {
    forms,
    isLoading,
    editingForm,
    setEditingForm,
    createForm,
    updateForm,
    deleteForm,
    togglePublish,
  };
}
