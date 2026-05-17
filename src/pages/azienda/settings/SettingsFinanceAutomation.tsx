// MP-IMP-001 Fase 2 — wrapper minimo.
// Route protetta in companyRoutes.tsx con withCompanyPermission("canViewCosts").
import { FinanceAutomationSettings } from "@/components/settings/FinanceAutomationSettings";

export default function SettingsFinanceAutomation() {
  return <FinanceAutomationSettings />;
}
