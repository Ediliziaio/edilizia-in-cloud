/**
 * Permessi su costi e margini dell'utente corrente, dai permessi veri
 * dell'app (usePermissions → staff_permissions).
 *
 * Prima (fino al 25/09/2026) si leggevano da un secondo sistema: la tabella
 * `user_permissions` più il ruolo grezzo, come la funzione DB
 * `has_cost_permission`. La tabella era vuota e nessuna policy usava la
 * funzione: lo staff con «Visualizza Margini» o «Costi» vedeva il link ai
 * margini del preventivo e trovava «Accesso riservato» (12 persone su 12), e
 * l'amministratore di un'azienda solo via accesso multi-azienda non era
 * riconosciuto. I dati della pagina li protegge la RLS di quotes, quote_items
 * e tariffe_aziendali.
 *
 * Usato da:
 *   · QuoteMargini.tsx come guardia della pagina
 *   · useMargineBreakdown.ts per non caricare il calcolo a chi non lo vede
 *   · SettingsTariffe.tsx per la sezione costi
 */
import { usePermissions } from "@/hooks/usePermissions";
import type { UserPermissions, PermissionKey } from "@/types/costVariants";

export function useUserPermissions(): { data: UserPermissions; isLoading: boolean } {
  const p = usePermissions();
  const data: UserPermissions = {
    can_view_costs: p.isAdmin || p.canViewCosts,
    can_view_margins: p.isAdmin || p.canViewMargins,
    // Scegliere le varianti di costo e gestire le assegnazioni delle tariffe è
    // configurazione del listino.
    can_choose_variant: p.isAdmin || p.canEditSettingsPricing,
    can_view_assegnazioni: p.isAdmin || p.canViewSettingsPricing,
    can_edit_assegnazioni: p.isAdmin || p.canEditSettingsPricing,
  };
  return { data, isLoading: p.isLoading };
}

export function useHasPermission(permission: PermissionKey): boolean {
  const { data } = useUserPermissions();
  return data[permission];
}
