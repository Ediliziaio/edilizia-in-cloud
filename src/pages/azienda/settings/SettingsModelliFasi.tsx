// src/pages/azienda/settings/SettingsModelliFasi.tsx
// Gating gestito da withCompanyPermission("canViewSettingsOrders") in companyRoutes.tsx
import AvanzamentoCommessaConfig from "@/components/settings/AvanzamentoCommessaConfig";
import ChiSpuntaConfig from "@/components/settings/ChiSpuntaConfig";
import ModelliFasiConfig from "@/components/settings/ModelliFasiConfig";
import NuovaCommessaConfig from "@/components/settings/NuovaCommessaConfig";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";

export default function SettingsModelliFasi() {
  const { role } = useAuth();
  const permissions = usePermissions();
  const puoModificare = !permissions.isLoading && (role === "company_admin" || role === "super_admin" || !!permissions.canEditSettingsOrders);
  return (
    <div className="space-y-6">
      <NuovaCommessaConfig puoModificare={puoModificare} />
      <AvanzamentoCommessaConfig puoModificare={puoModificare} />
      <ChiSpuntaConfig puoModificare={puoModificare} />
      <ModelliFasiConfig />
    </div>
  );
}
