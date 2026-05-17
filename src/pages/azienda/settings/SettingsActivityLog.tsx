// MP-IMP-001 Fase 2 — wrapper minimo.
// File legacy: il SettingsSecurityHub include gia' la tab Activity Log.
// Mantenuto solo per compatibilita' import fra moduli che lo referenziano.
// Route attive in companyRoutes.tsx sono protette da withCompanyPermission.
import CompanyActivityLogTab from "@/components/settings/CompanyActivityLogTab";

export default function SettingsActivityLog() {
  return <CompanyActivityLogTab />;
}
