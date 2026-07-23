import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Ruoli considerati "staff interno" — tutti gli utenti aziendali
 * (admin, venditori, operai, call-center).
 *
 * ESCLUDE sempre:
 *  - "customer" → clienti finali (sono in marketing_contacts, NON devono
 *    apparire come assegnatari)
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
  "worker",
  "subcontractor",
  "salesperson",
  "call_center",
] as const;

/**
 * Sottoinsieme "commerciale/vendita" — solo utenti che hanno senso come
 * assegnatari nel CRM (appuntamenti, opportunità, preventivi).
 *
 * Esclude operai/dipendenti non commerciali.
 */
export const SALES_ROLES = [
  "super_admin",
  "company_admin",
  "salesperson",
  "call_center",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
export type UserScope = "all" | "sales";

export interface StaffUser {
  id: string;
  first_name: string | null;
  last_name: string | null;
  roles?: StaffRole[];
}

interface RpcCompanyPerson {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
  avatar_url?: string | null;
  roles?: StaffRole[] | string[] | null;
}

type RpcResult = {
  data: unknown;
  error: { message?: string } | null;
};

export const companyStaffUsersKeys = {
  byCompany: (companyId: string | null | undefined, scope: UserScope = "all") =>
    ["company-staff-users", companyId, scope] as const,
};

/**
 * Ritorna gli utenti staff della company, escludendo clienti/referrer/piattaforma.
 *
 * @param scope "all" (default) per tutti gli staff · "sales" per soli ruoli
 *              commerciali (super_admin/company_admin/salesperson/call_center)
 *
 * Strategy:
 * 1. RPC SECURITY DEFINER `get_internal_chat_profiles`, che può leggere
 *    `user_roles` lato database senza esporre ruoli di altri utenti al browser.
 * 2. Fallback su staff_permissions + employees + subappaltatori, evitando
 *    `user_roles` dal client perché le RLS lo rendono incompleto.
 */
export function useCompanyStaffUsers(
  companyId: string | null | undefined,
  scope: UserScope = "all"
) {
  return useQuery({
    queryKey: companyStaffUsersKeys.byCompany(companyId, scope),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async (): Promise<StaffUser[]> => {
      if (!companyId) return [];

      const rolesFilter = new Set<string>(scope === "sales" ? SALES_ROLES : STAFF_ROLES);
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: string,
        args: Record<string, string>
      ) => Promise<RpcResult>;
      const { data: rpcUsers, error: rpcError } = await rpc.call(
        supabase,
        "get_internal_chat_profiles",
        { p_company_id: companyId },
      );

      if (!rpcError && Array.isArray(rpcUsers)) {
        if (rpcUsers.length === 0) return [];

        const hasRolePayload = (rpcUsers as RpcCompanyPerson[]).some((p) => Array.isArray(p.roles));
        const filteredUsers = hasRolePayload
          ? (rpcUsers as RpcCompanyPerson[]).filter((p) => {
              const roles = Array.isArray(p.roles) ? p.roles : [];
              return scope === "all" || roles.some((role) => rolesFilter.has(role));
            })
          : scope === "all"
            ? (rpcUsers as RpcCompanyPerson[])
            : [];

        if (filteredUsers.length > 0 || hasRolePayload) {
          return filteredUsers
            .filter((p) => p.first_name || p.last_name || p.email)
            .map((p) => ({
              id: p.id,
              first_name: p.first_name,
              last_name: p.last_name,
              roles: Array.isArray(p.roles) ? (p.roles as StaffRole[]) : undefined,
            }));
        }
      }

      const [permsRes, employeesRes, subcontractorsRes] = await Promise.all([
        supabase.from("staff_permissions").select("user_id").eq("company_id", companyId),
        supabase.from("employees").select("user_id, area").eq("company_id", companyId).not("user_id", "is", null),
        supabase.from("subappaltatori").select("user_id").eq("company_id", companyId).not("user_id", "is", null),
      ]);

      const staffRolesMap = new Map<string, StaffRole[]>();
      const addRole = (id: string | null | undefined, role: StaffRole) => {
        if (!id) return;
        const arr = staffRolesMap.get(id) ?? [];
        if (!arr.includes(role)) arr.push(role);
        staffRolesMap.set(id, arr);
      };

      if (scope === "all") {
        (permsRes.data || []).forEach((p) => addRole(p.user_id, "company_staff"));
      }
      (employeesRes.data || []).forEach((e) => {
        if (scope === "sales" && e.area !== "commerciale") return;
        addRole(e.user_id, e.area === "commerciale" ? "salesperson" : "employee");
      });
      if (scope === "all") {
        (subcontractorsRes.data || []).forEach((s) => addRole(s.user_id, "subcontractor"));
      }

      const staffUserIds = Array.from(staffRolesMap.keys());
      if (staffUserIds.length === 0) return [];

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
