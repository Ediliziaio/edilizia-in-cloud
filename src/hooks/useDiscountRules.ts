import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { toast } from "sonner";

export type DiscountRuleScope = "globale" | "per_commerciale" | "per_cliente_cat";

export interface DiscountRule {
  id: string;
  company_id: string;
  name: string;
  scope: DiscountRuleScope;
  salesperson_id: string | null;
  client_category: string | null;
  tipo_lavoro: string | null;
  importo_min: number | null;
  importo_max: number | null;
  margine_min_pct: number;
  sconto_max_pct: number;
  approva_oltre_pct: number | null;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type DiscountRuleInput = Omit<DiscountRule, "id" | "company_id" | "created_at" | "updated_at">;

export function useDiscountRules() {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["discount-rules", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discount_rules")
        .select("*")
        .eq("company_id", companyId!)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DiscountRule[];
    },
  });
}

export function useUpsertDiscountRule() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();

  return useMutation({
    mutationFn: async (input: Partial<DiscountRuleInput> & { id?: string }) => {
      if (!companyId) throw new Error("missing_company");
      const payload = { ...input, company_id: companyId, updated_at: new Date().toISOString() };
      if (input.id) {
        const { data, error } = await supabase
          .from("discount_rules")
          .update(payload)
          .eq("id", input.id)
          .select()
          .single();
        if (error) throw error;
        return data as DiscountRule;
      }
      const { data, error } = await supabase
        .from("discount_rules")
        .insert(payload as never)
        .select()
        .single();
      if (error) throw error;
      return data as DiscountRule;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discount-rules", companyId] });
      toast.success("Regola salvata");
    },
    onError: (e: Error) => toast.error(`Errore: ${e.message}`),
  });
}

export function useDeleteDiscountRule() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("discount_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discount-rules", companyId] });
      toast.success("Regola eliminata");
    },
    onError: (e: Error) => toast.error(`Errore: ${e.message}`),
  });
}

export function useComputeMaxDiscount(quoteId: string | null) {
  return useQuery({
    queryKey: ["max-discount", quoteId],
    enabled: !!quoteId,
    staleTime: 5_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("compute_max_discount", {
        p_quote_id: quoteId!,
      });
      if (error) throw error;
      return data as {
        max_sconto_pct: number;
        approva_oltre_pct: number | null;
        margine_pct_pre: number;
        applied_rules: Array<{ id: string; name: string; sconto_max_pct: number; margine_min_pct: number; scope: string }>;
        total: number;
      };
    },
  });
}
