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
  // join
  profile_name: string | null;
}

/** Tipo intermedio per mappare la risposta del join profiles */
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
  profiles: { first_name: string | null; last_name: string | null } | null;
}

/** Mappa una riga grezza in AuditLogEntry */
function mapRow(r: RawAuditRow): AuditLogEntry {
  return {
    id: r.id,
    company_id: r.company_id,
    changed_by: r.changed_by,
    field_name: r.field_name,
    old_value: r.old_value,
    new_value: r.new_value,
    reason: r.reason,
    ip_address: r.ip_address,
    created_at: r.created_at,
    profile_name: r.profiles
      ? [r.profiles.first_name, r.profiles.last_name].filter(Boolean).join(" ") || null
      : null,
  };
}

/** Hook per caricare l'audit log di una singola azienda */
export function useAuditLog(companyId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ["audit-log", companyId],
    queryFn: async (): Promise<AuditLogEntry[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("company_flag_audit_log")
        .select(
          "id, company_id, changed_by, field_name, old_value, new_value, reason, ip_address, created_at, profiles:changed_by(first_name, last_name)"
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error("Impossibile caricare l'audit log: " + error.message);
      return (data as RawAuditRow[] ?? []).map(mapRow);
    },
    enabled: !!companyId,
  });
}

/** Hook per caricare l'audit log globale (tutte le aziende) */
export function useAuditLogGlobal(limit = 100) {
  return useQuery({
    queryKey: ["audit-log-global"],
    queryFn: async (): Promise<AuditLogEntry[]> => {
      const { data, error } = await supabase
        .from("company_flag_audit_log")
        .select(
          "id, company_id, changed_by, field_name, old_value, new_value, reason, ip_address, created_at, profiles:changed_by(first_name, last_name)"
        )
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error("Impossibile caricare l'audit log: " + error.message);
      return (data as RawAuditRow[] ?? []).map(mapRow);
    },
  });
}
