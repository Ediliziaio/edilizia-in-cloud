/**
 * Hook: ritorna true se l'utente loggato può gestire l'azienda
 * (company_admin del proprio tenant OPPURE super_admin globale).
 *
 * Usato per:
 * - Mostrare la vista admin company-wide dei calendari nella pagina /azienda/impostazioni/integrazioni
 * - Future viste di amministrazione (es. utenti, billing, white-label)
 */
import { useAuth } from "@/contexts/AuthContext";
import type { AppRole } from "@/types/auth";

const COMPANY_ADMIN_ROLES: AppRole[] = ["company_admin", "super_admin"];

export function useIsCompanyAdmin(): boolean {
  const { role } = useAuth();
  return role !== null && COMPANY_ADMIN_ROLES.includes(role);
}
