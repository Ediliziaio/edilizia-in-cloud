import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Ruoli considerati "staff interno" — cioè utenti che possono essere
 * assegnati come venditori/referenti di appuntamenti/opportunità/task.
 *
 * IMPORTANTE: esclude intenzionalmente:
 *  - "customer" → clienti finali (sono in marketing_contacts, NON devono
 *    apparire come venditori)
 *  - "referrer" → segnalatori esterni (affiliati/promoter, non staff interno)
 *  - "platform_*" → team piattaforma (non appartengono all'azienda cliente)
 *
 * Storicamente la query sul calendario usava solo staff_permissions,
 * senza filtrare per ruolo: risultato → "Acanfora Gennaro" (customer) appariva
 * come venditore. Questo helper è il fix centralizzato.
 */
export const STAFF_ROLES = [
  "super_admin",
  "company_admin",
  "company_staff",
  "employee",
  "salesperson",
  "call_center",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export interface StaffUser {
  id: string;
  first_name: string | null;
  last_name: string | null;
  roles?: StaffRole[];
}

export const companyStaffUsersKeys = {
  byCompany: (companyId: string | null | undefined) =>
    ["company-staff-users", companyId] as const,
};

/**
 * Ritorna gli utenti staff della company, escludendo clienti/referrer/piattaforma.
 *
 * Strategy:
 * 1. Prendi user_id da staff_permissions per la company
 * 2. Filtra per user_roles WHERE role IN (STAFF_ROLES)
 * 3. Enrich con profiles.first_name / last_name
 */
export function useCompanyStaffUsers(companyId: string | null | undefined) {
  return useQuery({
    queryKey: companyStaffUsersKeys.byCompany(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async (): Promise<StaffUser[]> => {
      if (!companyId) return [];

      // 1. user_id con staff_permissions per la company
      const { data: perms } = await supabase
        .from("staff_permissions")
        .select("user_id")
        .eq("company_id", companyId);

      const permUserIds = Array.from(
        new Set((perms || []).map((p) => p.user_id).filter(Boolean))
      );
      if (permUserIds.length === 0) return [];

      // 2. filtra quelli che hanno ruoli staff validi
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", permUserIds)
        .in("role", STAFF_ROLES as unknown as string[]);

      const staffRolesMap = new Map<string, StaffRole[]>();
      (roles || []).forEach((r) => {
        const arr = staffRolesMap.get(r.user_id) ?? [];
        arr.push(r.role as StaffRole);
        staffRolesMap.set(r.user_id, arr);
      });

      const staffUserIds = Array.from(staffRolesMap.keys());
      if (staffUserIds.length === 0) return [];

      // 3. profili
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", staffUserIds)
        .order("last_name");

      return (profiles || [])
        .filter((p) => p.first_name || p.last_name)
        .map((p) => ({
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          roles: staffRolesMap.get(p.id),
        }));
    },
  });
}
