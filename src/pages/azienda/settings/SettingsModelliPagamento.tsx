// src/pages/azienda/settings/SettingsModelliPagamento.tsx
// Gating gestito da withCompanyPermission("canViewSettingsOrders") in companyRoutes.tsx
// Il titolo e la frase della pagina li mette già il layout delle Impostazioni.
//
// Due sezioni, ognuna con il suo indirizzo con l'àncora (`…/modelli-pagamento#modelli`, `#sal`): lo usano la ricerca delle
// impostazioni e i rimandi dalle altre pagine.
import ModelliPagamentoConfig from "@/components/settings/ModelliPagamentoConfig";
import SalMaturaConfig from "@/components/settings/SalMaturaConfig";
import { AvvisoSolaLetturaImpostazioni } from "@/components/impostazioni/AvvisoSolaLetturaImpostazioni";
import { IndiceSezioni, type VoceIndice } from "@/components/impostazioni/SezioneImpostazione";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useVaiASezione } from "@/hooks/useVaiASezione";

const SEZIONI: VoceIndice[] = [
  { id: "modelli", etichetta: "Come si paga" },
  { id: "sal", etichetta: "Quando matura un SAL" },
];

export default function SettingsModelliPagamento() {
  const { role } = useAuth();
  const permissions = usePermissions();
  const puoModificare = !permissions.isLoading && (role === "company_admin" || role === "super_admin" || !!permissions.canEditSettingsOrders);
  const { evidenziata, vai } = useVaiASezione(true);
  return (
    <div className="max-w-3xl space-y-4">
      {!permissions.isLoading && !puoModificare && <AvvisoSolaLetturaImpostazioni permesso="Configurazione Ordini" />}
      <IndiceSezioni voci={SEZIONI} onVai={vai} />
      <ModelliPagamentoConfig evidenziata={evidenziata === "modelli"} />
      <SalMaturaConfig puoModificare={puoModificare} evidenziata={evidenziata === "sal"} />
    </div>
  );
}
