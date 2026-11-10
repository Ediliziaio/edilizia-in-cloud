// src/pages/azienda/settings/SettingsAcquistiMateriali.tsx
// Gating gestito da withCompanyPermission("canViewSettingsOrders") in companyRoutes.tsx
// Il titolo e la frase della pagina li mette già il layout delle Impostazioni.
import AcquistiMaterialiConfig from "@/components/settings/AcquistiMaterialiConfig";
import NumerazioneOrdiniConfig from "@/components/settings/NumerazioneOrdiniConfig";
import { AvvisoSolaLetturaImpostazioni } from "@/components/impostazioni/AvvisoSolaLetturaImpostazioni";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";

export default function SettingsAcquistiMateriali() {
  const { role } = useAuth();
  const permissions = usePermissions();
  const puoModificare = !permissions.isLoading && (role === "company_admin" || role === "super_admin" || !!permissions.canEditSettingsOrders);
  return (
    <div className="space-y-4">
      {!permissions.isLoading && !puoModificare && <AvvisoSolaLetturaImpostazioni permesso="Configurazione Ordini" />}
      <AcquistiMaterialiConfig puoModificare={puoModificare} />
      <NumerazioneOrdiniConfig puoModificare={puoModificare} />
    </div>
  );
}
