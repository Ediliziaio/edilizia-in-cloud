import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  normalizeLeadFormFields,
  sanitizeLeadFormSlug,
  validateLeadFormDraft,
} from "@/lib/formBuilder";

export type FormFieldType =
  | "text" | "email" | "phone" | "number" | "textarea"
  | "select" | "checkbox" | "radio" | "date" | "consent"
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
  // Campo "consent" (autorizzazione privacy / consenso marketing):
  // testo + link cliccabile all'informativa. Il valore spuntato è salvato
  // nella submission come prova del consenso.
  linkUrl?: string;
  linkText?: string;
}

export interface LeadForm {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  description: string | null;
  fields: FormField[];
  theme: Record<string, unknown>;
  settings: Record<string, unknown>;
  is_published: boolean;
  total_views: number;
  total_submissions: number;
  created_at: string;
  updated_at: string;
}

type LeadFormRow = Omit<LeadForm, "fields" | "theme" | "settings"> & {
  fields: unknown;
  theme: unknown;
  settings: unknown;
};

function toPlainRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toLeadForm(row: LeadFormRow): LeadForm {
  return {
    ...row,
    fields: normalizeLeadFormFields((row.fields as FormField[]) || []) as FormField[],
    theme: toPlainRecord(row.theme),
    settings: toPlainRecord(row.settings),
  };
}

function getMutationErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "";
}

function getMutationErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) return String(error.code);
  return "";
}

function isDuplicateSlugError(error: unknown) {
  const message = getMutationErrorMessage(error).toLowerCase();
  return message === "duplicate_slug" || message.includes("duplicate") || getMutationErrorCode(error) === "23505";
}

async function withSupabaseTimeout<T>(request: PromiseLike<T>, message: string, timeoutMs = 25000): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function useFormBuilder() {
  // effectiveCompany può essere sovrascritta a monte da PlatformCompanyProvider
  // (area super-admin) per far puntare i form alla Platform Admin CRM senza
  // modificare questo hook.
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [editingForm, setEditingForm] = useState<LeadForm | null>(null);

  const { data: forms = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["lead-forms", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await withSupabaseTimeout(
        supabase
          .from("lead_forms")
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        "Caricamento form troppo lento. Riprova tra qualche secondo.",
      );
      if (error) throw error;
      return ((data || []) as LeadFormRow[]).map(toLeadForm);
    },
    enabled: !!companyId,
    retry: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const createForm = useMutation({
    mutationFn: async (input: { name: string; slug: string }) => {
      if (!companyId) throw new Error("No company");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const slug = sanitizeLeadFormSlug(input.slug || input.name);
      const fields = normalizeLeadFormFields([
        { id: crypto.randomUUID(), name: "email", label: "Email", type: "email", required: true, mapping: "email" },
        { id: crypto.randomUUID(), name: "nome", label: "Nome", type: "text", required: true, mapping: "first_name" },
        { id: crypto.randomUUID(), name: "telefono", label: "Telefono", type: "phone", required: false, mapping: "phone" },
      ]) as FormField[];
      const validation = validateLeadFormDraft({ name: input.name, slug, fields });
      if (!validation.ok) throw new Error(validation.errors[0]);

      const { data: existing, error: existingError } = await supabase
        .from("lead_forms")
        .select("id")
        .eq("company_id", companyId)
        .eq("slug", slug)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) throw new Error("DUPLICATE_SLUG");

      const { data, error } = await supabase
        .from("lead_forms")
        .insert({
          company_id: companyId,
          name: input.name.trim(),
          slug,
          created_by: user.id,
          fields,
          theme: { accent_color: "#2563eb", background_color: "#f9fafb" },
          settings: { submit_label: "Invia", success_message: "Grazie! Ti contatteremo presto." },
        })
        .select()
        .single();
      if (error) throw error;
      return toLeadForm(data as LeadFormRow);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-forms"] });
      toast.success("Form creato");
    },
    onError: (e: unknown) => {
      if (isDuplicateSlugError(e)) {
        toast.error("Slug già esistente", { description: "Scegli un URL diverso per questo form." });
        return;
      }
      toast.error("Errore nella creazione del form", { description: getMutationErrorMessage(e) || "Riprova tra poco." });
    },
  });

  const updateForm = useMutation({
    mutationFn: async (form: Partial<LeadForm> & { id: string }) => {
      if (!companyId) throw new Error("No company");
      const { id, ...updates } = form;
      const currentForm = forms.find((item) => item.id === id);
      const nextDraft = {
        ...(currentForm ?? {}),
        ...updates,
        slug: updates.slug ? sanitizeLeadFormSlug(updates.slug) : currentForm?.slug,
        fields: updates.fields ? normalizeLeadFormFields(updates.fields) as FormField[] : currentForm?.fields,
        settings: updates.settings ?? currentForm?.settings,
      } as LeadForm;
      const validation = validateLeadFormDraft(nextDraft, { publishing: nextDraft.is_published });
      if (!validation.ok) throw new Error(validation.errors[0]);

      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if ("name" in updates) payload.name = String(updates.name ?? "").trim();
      if ("slug" in updates && updates.slug) payload.slug = sanitizeLeadFormSlug(updates.slug);
      if ("description" in updates) payload.description = updates.description || null;
      if ("fields" in updates) payload.fields = normalizeLeadFormFields(updates.fields) as FormField[];
      if ("settings" in updates) payload.settings = updates.settings || {};
      if ("theme" in updates) payload.theme = updates.theme || {};
      if ("is_published" in updates) payload.is_published = Boolean(updates.is_published);

      const { data, error } = await supabase
        .from("lead_forms")
        .update(payload)
        .eq("id", id)
        .eq("company_id", companyId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Form non trovato o non modificabile");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-forms"] });
      toast.success("Form aggiornato");
    },
    onError: (e: unknown) => {
      if (isDuplicateSlugError(e)) {
        toast.error("Slug già esistente", { description: "Scegli un URL diverso per questo form." });
        return;
      }
      toast.error("Errore nell'aggiornamento del form", { description: getMutationErrorMessage(e) || "Riprova tra poco." });
    },
  });

  const deleteForm = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("No company");
      const { error } = await supabase.from("lead_forms").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-forms"] });
      toast.success("Form eliminato");
    },
    onError: (e: unknown) => toast.error("Errore nell'eliminazione del form", { description: getMutationErrorMessage(e) || "Riprova tra poco." }),
  });

  const togglePublish = useCallback(
    (form: LeadForm) => {
      if (!form.is_published) {
        const validation = validateLeadFormDraft(form, { publishing: true });
        if (!validation.ok) {
          toast.error("Form non pubblicabile", { description: validation.errors[0] });
          return;
        }
      }
      updateForm.mutate({ id: form.id, is_published: !form.is_published });
    },
    [updateForm]
  );

  return {
    forms,
    isLoading,
    isError,
    error,
    refetch,
    editingForm,
    setEditingForm,
    createForm,
    updateForm,
    deleteForm,
    togglePublish,
  };
}
