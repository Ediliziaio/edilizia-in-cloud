import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useAuth } from "@/contexts/AuthContext";

export type AutomationCategoria =
  | "generale" | "task" | "marketing" | "cantieri" | "crm" | "notifiche";

export interface AutomationRule {
  id: string;
  company_id: string | null;
  nome: string;
  descrizione?: string | null;
  categoria: string;
  icona?: string | null;
  colore?: string | null;
  attiva: boolean;
  is_template: boolean;
  template_id?: string | null;
  trigger_tipo: string;
  trigger_config: Record<string, unknown>;
  condizioni: unknown[];
  azione_tipo: string;
  azione_config: Record<string, unknown>;
  azioni_secondarie: unknown[];
  esecuzioni_totali: number;
  ultima_esecuzione?: string | null;
  ultima_esecuzione_ok?: boolean | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export function useAutomazioni(categoriaFiltro?: AutomationCategoria | "tutte") {
  const companyId = useEffectiveCompanyId();

  return useQuery<AutomationRule[]>({
    queryKey: ["automazioni", companyId, categoriaFiltro],
    queryFn: async () => {
      let q = supabase
        .from("automation_rules")
        .select("*")
        .eq("company_id", companyId!)
        .eq("is_template", false)
        .order("categoria")
        .order("created_at");

      if (categoriaFiltro && categoriaFiltro !== "tutte") {
        q = q.eq("categoria", categoriaFiltro);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AutomationRule[];
    },
    enabled: !!companyId,
  });
}

export function useAutomationTemplates(categoriaFiltro?: AutomationCategoria | "tutte") {
  return useQuery<AutomationRule[]>({
    queryKey: ["automation-templates", categoriaFiltro],
    queryFn: async () => {
      let q = supabase
        .from("automation_rules")
        .select("*")
        .eq("is_template", true)
        .order("categoria");

      if (categoriaFiltro && categoriaFiltro !== "tutte") {
        q = q.eq("categoria", categoriaFiltro);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AutomationRule[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useToggleAutomazione() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, attiva }: { id: string; attiva: boolean }) => {
      const { error } = await supabase
        .from("automation_rules")
        .update({ attiva })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automazioni"] }),
  });
}

export function useSaveAutomazione() {
  const companyId = useEffectiveCompanyId();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rule: Partial<AutomationRule> & { id?: string }) => {
      const payload: Record<string, unknown> = { ...rule };
      // Remove fields that shouldn't go to DB
      delete payload.created_at;
      delete payload.updated_at;

      if (rule.id) {
        const { error } = await supabase
          .from("automation_rules")
          .update(payload as never)
          .eq("id", rule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("automation_rules")
          .insert({
            ...payload,
            company_id: companyId,
            created_by: user?.id,
          } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automazioni"] }),
  });
}

export function useDeleteAutomazione() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("automation_rules")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automazioni"] }),
  });
}

export function useAttivaTemplate() {
  const companyId = useEffectiveCompanyId();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (template: AutomationRule) => {
      const { error } = await supabase
        .from("automation_rules")
        .insert({
          nome: template.nome,
          descrizione: template.descrizione,
          categoria: template.categoria,
          icona: template.icona,
          colore: template.colore,
          trigger_tipo: template.trigger_tipo,
          trigger_config: template.trigger_config,
          condizioni: template.condizioni,
          azione_tipo: template.azione_tipo,
          azione_config: template.azione_config,
          azioni_secondarie: template.azioni_secondarie,
          company_id: companyId,
          is_template: false,
          template_id: template.id,
          attiva: true,
          esecuzioni_totali: 0,
          created_by: user?.id,
        } as never);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automazioni"] }),
  });
}
