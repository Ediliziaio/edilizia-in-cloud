// MP04 — Hook template Meta approvati.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

export type WAMetaTemplate = Database["public"]["Tables"]["wa_meta_templates"]["Row"];

export function useWAMetaTemplates(waNumberId?: string, onlyApproved = true) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["wa", "templates", companyId, waNumberId, onlyApproved],
    enabled: !!companyId,
    queryFn: async () => {
      let q = supabase
        .from("wa_meta_templates")
        .select("*")
        .eq("company_id", companyId!)
        .order("template_name");
      if (waNumberId) q = q.eq("wa_number_id", waNumberId);
      if (onlyApproved) q = q.eq("status", "APPROVED");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as WAMetaTemplate[];
    },
  });
}

export function useSyncMetaTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("sync-meta-templates", {
        body: {},
      });
      if (error) throw error;
      return data as { synced?: number; errors?: number };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["wa", "templates"] });
      toast.success(`Template sincronizzati: ${data?.synced ?? 0}`);
    },
    onError: (err: Error) => toast.error(`Errore sync: ${err.message}`),
  });
}
