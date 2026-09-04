import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Registro attività unificato (F1-07).
 *
 * Prima esistevano due schermate su due tabelle diverse, e la sorgente più
 * ricca — central_audit_log, con stato precedente e successivo di ogni riga —
 * non era esposta da nessuna parte. Questo hook legge la vista che le unisce
 * tutte e tre, con filtri e paginazione lato server.
 */

export interface AuditUnifiedRow {
  fonte: "central" | "admin" | "flag";
  id: string;
  avvenuto_il: string;
  attore_id: string | null;
  attore_email: string | null;
  attore_ruolo: string | null;
  azienda_id: string | null;
  azienda_nome: string | null;
  azione: string;
  oggetto_tipo: string | null;
  oggetto_id: string | null;
  campi_modificati: string[] | null;
  prima: Record<string, unknown> | null;
  dopo: Record<string, unknown> | null;
  ip: string | null;
  dispositivo: string | null;
  note: string | null;
  in_impersonation: boolean;
  totale: number;
}

export interface AuditFilters {
  from?: string | null;
  to?: string | null;
  companyId?: string | null;
  actorId?: string | null;
  search?: string;
  soloImpersonation?: boolean;
  page?: number;
  pageSize?: number;
}

export function useAuditUnified(filters: AuditFilters) {
  const pageSize = filters.pageSize ?? 50;
  const page = filters.page ?? 0;

  return useQuery({
    queryKey: [
      "admin-audit-unified",
      filters.from ?? null,
      filters.to ?? null,
      filters.companyId ?? null,
      filters.actorId ?? null,
      filters.search ?? "",
      filters.soloImpersonation ?? false,
      page,
      pageSize,
    ],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_audit_search" as never, {
        p_from: filters.from ?? null,
        p_to: filters.to ?? null,
        p_company_id: filters.companyId ?? null,
        p_actor_id: filters.actorId ?? null,
        p_search: filters.search?.trim() || null,
        p_solo_impersonation: filters.soloImpersonation ?? false,
        p_limit: pageSize,
        p_offset: page * pageSize,
      } as never);
      if (error) throw error;
      const rows = (data ?? []) as unknown as AuditUnifiedRow[];
      return { rows, total: rows[0]?.totale ?? 0 };
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}
