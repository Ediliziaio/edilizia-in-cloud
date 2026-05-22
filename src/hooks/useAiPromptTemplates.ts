/**
 * useAiPromptTemplates — CRUD su ai_prompt_templates.
 *
 * Permette all'azienda di:
 *   • Vedere template ufficiali EiC (company_id NULL) + propri custom
 *   • Creare template personalizzati
 *   • Tracciare usage_count
 */

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PromptTemplateVariable {
  name: string;
  label: string;
  required?: boolean;
}

export interface PromptTemplate {
  id: string;
  company_id: string | null;
  name: string;
  category: "copy" | "image" | "hybrid";
  description: string | null;
  system_prompt: string;
  user_prompt_template: string | null;
  variables: PromptTemplateVariable[];
  segment: string | null;
  tone: string | null;
  usage_count: number;
  last_used_at: string | null;
  is_official: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const templatesTable = () => (supabase as any).from("ai_prompt_templates");

export function useAiPromptTemplates(opts: {
  companyId: string | undefined;
  category?: "copy" | "image" | "hybrid";
}) {
  const { companyId, category } = opts;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["ai-prompt-templates", companyId, category],
    queryFn: async (): Promise<PromptTemplate[]> => {
      try {
        let q = templatesTable()
          .select("*")
          .eq("is_active", true)
          .order("is_official", { ascending: false })
          .order("usage_count", { ascending: false });
        if (category) q = q.eq("category", category);
        const { data, error } = await q;
        if (error) {
          const msg = String(error.message ?? "");
          if (msg.includes("does not exist") || msg.includes("schema cache")) return [];
          throw error;
        }
        return (data ?? []) as PromptTemplate[];
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: async (input: {
      name: string;
      category: "copy" | "image" | "hybrid";
      description?: string;
      system_prompt: string;
      user_prompt_template?: string;
      variables?: PromptTemplateVariable[];
      segment?: string;
      tone?: string;
    }): Promise<PromptTemplate | null> => {
      if (!companyId) throw new Error("no_company_id");
      try {
        const { data, error } = await templatesTable()
          .insert({
            company_id: companyId,
            name: input.name,
            category: input.category,
            description: input.description ?? null,
            system_prompt: input.system_prompt,
            user_prompt_template: input.user_prompt_template ?? null,
            variables: input.variables ?? [],
            segment: input.segment ?? null,
            tone: input.tone ?? null,
            is_official: false,
            is_active: true,
          })
          .select("*")
          .single();
        if (error) throw error;
        return data as PromptTemplate;
      } catch (err) {
        const msg = String((err as Error).message ?? err);
        if (msg.includes("does not exist") || msg.includes("schema cache")) {
          toast.warning("Migration ai_prompt_templates non applicata");
          return null;
        }
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-prompt-templates"] });
      toast.success("Template salvato");
    },
    onError: (err) => toast.error("Errore", { description: String((err as Error).message ?? err) }),
  });

  const incrementUsage = async (id: string) => {
    try {
      await templatesTable()
        .update({
          usage_count: (query.data?.find((t) => t.id === id)?.usage_count ?? 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", id);
    } catch {
      // silenzioso
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("no_company_id");
      const { error } = await templatesTable()
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-prompt-templates"] });
      toast.success("Template eliminato");
    },
  });

  return useMemo(
    () => ({
      templates: query.data ?? [],
      officialTemplates: (query.data ?? []).filter((t) => t.is_official),
      customTemplates: (query.data ?? []).filter((t) => !t.is_official && t.company_id === companyId),
      isLoading: query.isLoading,
      create: createMutation.mutateAsync,
      remove: deleteMutation.mutateAsync,
      incrementUsage,
      isMutating: createMutation.isPending || deleteMutation.isPending,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.data, query.isLoading, createMutation.mutateAsync, deleteMutation.mutateAsync, companyId],
  );
}

/**
 * Risolve un template sostituendo i placeholder con i valori forniti.
 * Es. "Brief: {{brief}}" + {brief: "serramenti"} → "Brief: serramenti"
 */
export function resolveTemplate(template: PromptTemplate, values: Record<string, string>): {
  system_prompt: string;
  user_prompt: string;
} {
  const replace = (str: string) =>
    str.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? "");
  return {
    system_prompt: replace(template.system_prompt),
    user_prompt: template.user_prompt_template ? replace(template.user_prompt_template) : "",
  };
}
