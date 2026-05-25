/**
 * Hook per gestire le richieste di modifica del commercialista (workflow
 * approval_required).
 *
 * Espone:
 *  - useMyChangeRequests(): lista richieste fatte dal commercialista
 *  - useCompanyPendingChangeRequests(companyId): coda da approvare per l'azienda
 *  - useSubmitChangeRequest(): crea una nuova richiesta
 *  - useDecideChangeRequest(): approva/rifiuta (per l'azienda)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type ChangeRequestStatus = "pending" | "approved" | "rejected" | "expired";
export type ChangeRequestOperation = "create" | "update" | "delete";

export interface ChangeRequestRow {
  id: string;
  company_id: string;
  requested_by: string;
  firm_id: string | null;
  resource_type: string;
  resource_id: string | null;
  operation: ChangeRequestOperation;
  payload: Record<string, unknown>;
  status: ChangeRequestStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  expires_at: string;
  created_at: string;
}

const KEY = "accountant-change-requests";

/** Richieste fatte dal commercialista loggato (per dashboard "le mie richieste") */
export function useMyChangeRequests() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: [KEY, "mine", userId] as const,
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<ChangeRequestRow[]> => {
      const { data, error } = await supabase
        .from("accountant_change_requests")
        .select("*")
        .eq("requested_by", userId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        console.error("[useMyChangeRequests]", error);
        return [];
      }
      return (data || []) as ChangeRequestRow[];
    },
  });
}

/** Richieste pending ricevute dall'azienda (per UI di approvazione) */
export function useCompanyPendingChangeRequests(companyId: string | null | undefined) {
  return useQuery({
    queryKey: [KEY, "company-pending", companyId] as const,
    enabled: !!companyId,
    staleTime: 15_000,
    queryFn: async (): Promise<ChangeRequestRow[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("accountant_change_requests")
        .select("*")
        .eq("company_id", companyId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[useCompanyPendingChangeRequests]", error);
        return [];
      }
      return (data || []) as ChangeRequestRow[];
    },
  });
}

/** Submit di una richiesta dal commercialista */
export function useSubmitChangeRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      companyId: string;
      resourceType: string;
      resourceId?: string | null;
      operation: ChangeRequestOperation;
      payload: Record<string, unknown>;
    }) => {
      if (!user?.id) throw new Error("Non autenticato");
      const { data, error } = await supabase
        .from("accountant_change_requests")
        .insert({
          company_id: input.companyId,
          requested_by: user.id,
          resource_type: input.resourceType,
          resource_id: input.resourceId ?? null,
          operation: input.operation,
          payload: input.payload,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ChangeRequestRow;
    },
    onSuccess: () => {
      toast.success("Richiesta inviata", {
        description: "L'azienda riceverà notifica e potrà approvare entro 7 giorni.",
      });
      queryClient.invalidateQueries({ queryKey: [KEY] });
    },
    onError: (error: Error) => {
      toast.error("Impossibile inviare la richiesta", {
        description: error.message,
      });
    },
  });
}

/** Decisione approva/rifiuta (per l'azienda) */
export function useDecideChangeRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      requestId: string;
      decision: "approved" | "rejected";
      note?: string;
    }) => {
      if (!user?.id) throw new Error("Non autenticato");
      const { error } = await supabase
        .from("accountant_change_requests")
        .update({
          status: input.decision,
          decided_by: user.id,
          decided_at: new Date().toISOString(),
          decision_note: input.note ?? null,
        })
        .eq("id", input.requestId)
        .eq("status", "pending");
      if (error) throw error;
      return { requestId: input.requestId, decision: input.decision };
    },
    onSuccess: ({ decision }) => {
      toast.success(
        decision === "approved" ? "Richiesta approvata" : "Richiesta rifiutata",
      );
      queryClient.invalidateQueries({ queryKey: [KEY] });
    },
    onError: (error: Error) => {
      toast.error("Errore decisione", { description: error.message });
    },
  });
}
