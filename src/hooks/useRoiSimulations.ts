/**
 * Hook dati per il Simulatore ROI (tabella `crm_roi_simulations`).
 *
 * - `useSaveRoiSimulation`: insert company-scoped (inputs+results in jsonb),
 *   opzionalmente legato a contact/opportunity.
 * - `useLatestRoiSimulation`: ultima simulazione salvata su un'opportunità
 *   (mostrata sul deal).
 *
 * La tabella non è ancora nei tipi generati (migrazione non applicata) → si usa
 * un cast `supabase as any`, com'è prassi in altri hook (vedi useResellerPlans).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { RoiInputs, RoiResults } from "@/lib/roiSimulator";

export interface RoiSimulationRow {
  id: string;
  company_id: string;
  contact_id: string | null;
  opportunity_id: string | null;
  client_name: string;
  inputs: RoiInputs;
  results: RoiResults;
  created_by: string | null;
  created_at: string;
}

export interface SaveRoiSimulationArgs {
  clientName: string;
  inputs: RoiInputs;
  results: RoiResults;
  contactId?: string | null;
  opportunityId?: string | null;
}

export function useSaveRoiSimulation() {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id ?? null;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: SaveRoiSimulationArgs): Promise<RoiSimulationRow> => {
      if (!companyId) throw new Error("Azienda non disponibile");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data, error } = await sb
        .from("crm_roi_simulations")
        .insert({
          company_id: companyId,
          contact_id: args.contactId ?? null,
          opportunity_id: args.opportunityId ?? null,
          client_name: args.clientName ?? "",
          inputs: args.inputs,
          results: args.results,
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as RoiSimulationRow;
    },
    onSuccess: (row) => {
      if (row.opportunity_id) {
        queryClient.invalidateQueries({ queryKey: ["roi-simulation-latest", row.opportunity_id] });
      }
    },
  });
}

/** Ultima simulazione ROI salvata su una specifica opportunità (deal). */
export function useLatestRoiSimulation(opportunityId: string | null | undefined) {
  return useQuery({
    queryKey: ["roi-simulation-latest", opportunityId ?? null],
    enabled: !!opportunityId,
    queryFn: async (): Promise<RoiSimulationRow | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data, error } = await sb
        .from("crm_roi_simulations")
        .select("*")
        .eq("opportunity_id", opportunityId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as RoiSimulationRow) ?? null;
    },
  });
}
