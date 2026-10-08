// src/pages/azienda/settings/SettingsModelliPagamento.tsx
// Gating gestito da withCompanyPermission("canViewSettingsOrders") in companyRoutes.tsx
import ModelliPagamentoConfig from "@/components/settings/ModelliPagamentoConfig";
import SalMaturaConfig from "@/components/settings/SalMaturaConfig";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";

export default function SettingsModelliPagamento() {
  const { role } = useAuth();
  const permissions = usePermissions();
  const puoModificare = role === "company_admin" || role === "super_admin" || !!permissions.canEditSettingsOrders;
  return (
    <div className="space-y-6">
      <ModelliPagamentoConfig />
      <SalMaturaConfig puoModificare={puoModificare} />
    </div>
  );
}
