// src/pages/azienda/settings/SettingsCommesseGenerali.tsx
// Gating gestito da withCompanyPermission("canViewSettingsOrders") in companyRoutes.tsx
// Il titolo e la frase della pagina li mette già il layout delle Impostazioni.
import CommesseGeneraliConfig from "@/components/settings/CommesseGeneraliConfig";
import { AvvisoSolaLetturaImpostazioni } from "@/components/impostazioni/AvvisoSolaLetturaImpostazioni";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useVaiASezione } from "@/hooks/useVaiASezione";

export default function SettingsCommesseGenerali() {
  const { role } = useAuth();
  const permissions = usePermissions();
  const puoModificare = !permissions.isLoading && (role === "company_admin" || role === "super_admin" || !!permissions.canEditSettingsOrders);
  const { evidenziata } = useVaiASezione(true);
  return (
    <div className="max-w-3xl space-y-4">
      {!permissions.isLoading && !puoModificare && <AvvisoSolaLetturaImpostazioni permesso="Configurazione Ordini" />}
      <CommesseGeneraliConfig puoModificare={puoModificare} evidenziata={evidenziata === "tipi"} />
    </div>
  );
}
