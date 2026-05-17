// MP-IMP-001 Fase 2 — wrapper minimo.
// Route protetta in companyRoutes.tsx con withCompanyPermission("canViewSettingsCustomization").
import { CustomFieldsConfig } from "@/components/settings/CustomFieldsConfig";

export default function SettingsCustomFields() {
  return <CustomFieldsConfig />;
}
