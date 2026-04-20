/**
 * Hook che risolve i permessi granulari dell'utente corrente.
 *
 * Ordine di risoluzione (identico alla function DB `has_cost_permission`):
 *   1. override esplicito in `user_permissions` (granted: bool)
 *   2. default role-based: i ruoli `super_admin` / `company_admin` hanno
 *      TUTTI i permessi cost/margin/variant abilitati
 *   3. altri ruoli → false
 *
 * Usato da:
 *   · QuoteBuilder.tsx per mostrare/nascondere la badge "Margini & Pianificazione"
 *   · QuoteMargini.tsx come route guard
 *   · TariffaVariantiEditor per disabilitare CUD
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { UserPermissions, PermissionKey } from "@/types/costVariants";

const PERMISSION_KEYS: PermissionKey[] = [
  "can_view_costs",
  "can_view_margins",
  "can_choose_variant",
  "can_view_assegnazioni",
  "can_edit_assegnazioni",
];

const ALL_FALSE: UserPermissions = {
  can_view_costs: false,
  can_view_margins: false,
  can_choose_variant: false,
  can_view_assegnazioni: false,
  can_edit_assegnazioni: false,
};

const ALL_TRUE: UserPermissions = {
  can_view_costs: true,
  can_view_margins: true,
  can_choose_variant: true,
  can_view_assegnazioni: true,
  can_edit_assegnazioni: true,
};

interface UserPermissionRow {
  permission: string;
  granted: boolean;
}

export function useUserPermissions() {
  const { user, role } = useAuth();

  return useQuery<UserPermissions>({
    queryKey: ["user-permissions", user?.id, role],
    enabled: !!user,
    queryFn: async () => {
      const isAdmin = role === "company_admin" || role === "super_admin";
      const base: UserPermissions = isAdmin ? { ...ALL_TRUE } : { ...ALL_FALSE };

      // Override da user_permissions (se presenti). I non-admin potrebbero
      // avere granted=true per specifici permessi (es. commerciale senior
      // a cui è stato assegnato can_view_margins eccezionalmente).
      const { data, error } = await supabase
        .from("user_permissions")
        .select("permission, granted")
        .eq("user_id", user!.id);

      if (error) {
        // Se l'utente non ha ancora la tabella nel set di permission reader
        // (es. salesperson puro) restituiamo il default role-based senza crash.
        return base;
      }

      for (const row of (data ?? []) as UserPermissionRow[]) {
        if ((PERMISSION_KEYS as string[]).includes(row.permission)) {
          base[row.permission as PermissionKey] = row.granted;
        }
      }
      return base;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useHasPermission(permission: PermissionKey): boolean {
  const { data } = useUserPermissions();
  return data?.[permission] ?? false;
}
