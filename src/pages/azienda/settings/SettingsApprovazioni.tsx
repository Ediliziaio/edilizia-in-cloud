import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { GovernanceThresholdsCard } from "@/components/settings/GovernanceThresholdsCard";

/**
 * Approvazioni e avvisi: scheda di «Modelli di preventivo».
 * Prima era la linguetta «Regole e approvazioni» dentro la pagina Margini, una
 * seconda fila di linguette sotto quella del gruppo, che nessuno apriva.
 */
export default function SettingsApprovazioni() {
  const { effectiveCompany, role } = useAuth();
  const permissions = usePermissions();
  const companyId = effectiveCompany?.id;
  // Come nella pagina Prezzo e margini: modifica chi amministra o può cambiare il listino.
  const isAdmin = role === "company_admin" || role === "super_admin" || permissions.canEditSettingsPricing;
  if (!companyId) return null;
  return <GovernanceThresholdsCard companyId={companyId} isAdmin={isAdmin} />;
}
