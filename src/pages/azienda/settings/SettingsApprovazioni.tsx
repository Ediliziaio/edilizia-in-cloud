import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { GovernanceThresholdsCard } from "@/components/settings/GovernanceThresholdsCard";
import { CollegamentoAutomaticoCard } from "@/components/settings/CollegamentoAutomaticoCard";

/**
 * Approvazioni e avvisi: scheda di «Modelli preventivi e contratti».
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
  return (
    <div className="space-y-6">
      <GovernanceThresholdsCard companyId={companyId} isAdmin={isAdmin} />
      {/* La scrittura è riservata all'amministratore dalla policy cgs_write: chi può cambiare il listino la vede soltanto. */}
      <CollegamentoAutomaticoCard companyId={companyId} puoModificare={role === "company_admin" || role === "super_admin"} />
    </div>
  );
}
