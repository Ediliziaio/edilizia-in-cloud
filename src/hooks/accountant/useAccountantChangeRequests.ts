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
import { messaggioErrorePersone } from "@/lib/users/erroriPersone";

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
      if (error) throw new Error(error.message);
      return ((data ?? []) as ChangeRequestRow[]).map(riga =>
        riga.status === "pending" && Date.parse(riga.expires_at) <= Date.now()
          ? { ...riga, status: "expired" as const }
          : riga,
      );
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
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data || []) as ChangeRequestRow[];
    },
  });
}

/** Propone una modifica per una delega Con approvazione. */
export function useSubmitChangeRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      studioId: string; companyId: string; orderId: string | null; precedente: string | null;
      testo: string; motivo: string;
    }) => {
      const { error } = await supabase.rpc("studio_invia_richiesta" as never, {
        p_studio: input.studioId, p_azienda: input.companyId, p_commessa: input.orderId,
        p_testo: input.testo, p_motivo: input.motivo, p_precedente: input.precedente,
      } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Richiesta inviata"); void queryClient.invalidateQueries({ queryKey: [KEY] }); },
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
      const { error } = await supabase.rpc("studio_decidi_richiesta" as never, {
        p_id: input.requestId, p_decisione: input.decision, p_nota: input.note ?? null,
      } as never);
      if (error) throw new Error(error.message);
      return { requestId: input.requestId, decision: input.decision };
    },
    onSuccess: ({ decision }) => {
      toast.success(
        decision === "approved" ? "Richiesta approvata" : "Richiesta rifiutata",
      );
      queryClient.invalidateQueries({ queryKey: [KEY] });
    },
    onError: (error: Error) => {
      toast.error("Non sono riuscito a registrare la decisione", {
        description: messaggioErrorePersone(error, "Riprova tra un attimo."),
      });
    },
  });
}
