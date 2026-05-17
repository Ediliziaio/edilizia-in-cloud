// MP-IMP-001 Fase 2 — wrapper minimo.
// Route protetta in companyRoutes.tsx con withCompanyPermission("canViewSettingsCustomization").
import { TagsConfig } from "@/components/settings/TagsConfig";

export default function SettingsTags() {
  return <TagsConfig />;
}
