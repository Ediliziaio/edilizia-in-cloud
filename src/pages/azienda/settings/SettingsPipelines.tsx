// MP-IMP-001 Fase 2 — wrapper minimo.
// Route protetta in companyRoutes.tsx con withCompanyPermission("canViewSettingsCustomization").
import { PipelinesConfig } from "@/components/settings/PipelinesConfig";

export default function SettingsPipelines() {
  return <PipelinesConfig />;
}
