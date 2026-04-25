import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AuditLogEntry {
  id: string;
  company_id: string;
  changed_by: string;
  field_name: string;
  old_value: unknown;
  new_value: unknown;
  reason: string | null;
  ip_address: string | null;
  created_at: string;
  // join client-side
  profile_name: string | null;
}

interface RawAuditRow {
  id: string;
  company_id: string;
  changed_by: string;
  field_name: string;
  old_value: unknown;
  new_value: unknown;
  reason: string | null;
  ip_address: string | null;
  created_at: string;
}

/**
 * FIX SCHEMA: prima il SELECT usava `profiles:changed_by(first_name, last_name)`
 * che si aspetta una FK formale tra `company_flag_audit_log.changed_by` e
 * `profiles.id`. Tale FK NON esiste nello schema attuale, quindi PostgREST
 * rifiutava la query con:
 *   "Could not find a relationship between 'company_flag_audit_log' and
 *    'changed_by' in the schema cache".
 *
 * Soluzione: query in 2 step (manual join client-side).
 *  1) Carico i record audit grezzi
 *  2) Estraggo gli user_id unici e fetcho i nomi da `profiles` separatamente
 *  3) Mappo profile_name nel risultato finale
 *
 * Non perde performance (1 query in più, batched via .in()) e funziona
 * anche se aggiungono/tolgono FK in futuro.
 */
async function loadAuditWithProfiles(rows: RawAuditRow[]): Promise<AuditLogEntry[]> {
  const userIds = Array.from(
    new Set(rows.map((r) => r.changed_by).filter(Boolean)),
  );
  let nameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", userIds);
    if (profiles) {
      nameMap = new Map(
        profiles.map((p) => [
          p.id,
          [p.first_name, p.last_name].filter(Boolean).join(" ") || p.id,
        ]),
      );
    }
  }
  return rows.map((r) => ({
    id: r.id,
    company_id: r.company_id,
    changed_by: r.changed_by,
    field_name: r.field_name,
    old_value: r.old_value,
    new_value: r.new_value,
    reason: r.reason,
    ip_address: r.ip_address,
    created_at: r.created_at,
    profile_name: nameMap.get(r.changed_by) ?? null,
  }));
}

/** Hook per caricare l'audit log di una singola azienda */
export function useAuditLog(companyId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ["audit-log", companyId, limit],
    queryFn: async (): Promise<AuditLogEntry[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("company_flag_audit_log")
        .select(
          "id, company_id, changed_by, field_name, old_value, new_value, reason, ip_address, created_at",
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error)
        throw new Error("Impossibile caricare l'audit log: " + error.message);
      return loadAuditWithProfiles((data ?? []) as RawAuditRow[]);
    },
    enabled: !!companyId,
  });
}

/** Hook per caricare l'audit log globale (tutte le aziende) */
export function useAuditLogGlobal(limit = 100) {
  return useQuery({
    queryKey: ["audit-log-global", limit],
    queryFn: async (): Promise<AuditLogEntry[]> => {
      const { data, error } = await supabase
        .from("company_flag_audit_log")
        .select(
          "id, company_id, changed_by, field_name, old_value, new_value, reason, ip_address, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error)
        throw new Error("Impossibile caricare l'audit log: " + error.message);
      return loadAuditWithProfiles((data ?? []) as RawAuditRow[]);
    },
  });
}
