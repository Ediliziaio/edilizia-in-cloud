// src/pages/azienda/settings/SettingsModelliFasi.tsx
// Gating gestito da withCompanyPermission("canViewSettingsOrders") in companyRoutes.tsx
// Il titolo e la frase della pagina li mette già il layout delle Impostazioni.
//
// Tre sezioni, nell'ordine in cui servono: i modelli di fasi (la cosa principale), con quali fasi parte una commessa nuova,
// le due regole che valgono per tutte le commesse (si toccano una volta). Ogni sezione ha il suo indirizzo con l'àncora
// (`…/modelli-fasi#modelli`, `#nuova-commessa`, `#regole`): lo usano la ricerca delle impostazioni e i rimandi dalle altre pagine.
import AvanzamentoCommessaConfig from "@/components/settings/AvanzamentoCommessaConfig";
import ChiSpuntaConfig from "@/components/settings/ChiSpuntaConfig";
import ModelliFasiConfig from "@/components/settings/ModelliFasiConfig";
import NuovaCommessaConfig from "@/components/settings/NuovaCommessaConfig";
import { AvvisoSolaLetturaImpostazioni } from "@/components/impostazioni/AvvisoSolaLetturaImpostazioni";
import { AmbitoImpostazione, IndiceSezioni, SezioneImpostazione, type VoceIndice } from "@/components/impostazioni/SezioneImpostazione";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useVaiASezione } from "@/hooks/useVaiASezione";

const SEZIONI: VoceIndice[] = [
  { id: "modelli", etichetta: "Modelli" },
  { id: "nuova-commessa", etichetta: "Nuova commessa" },
  { id: "regole", etichetta: "Regole" },
];

export default function SettingsModelliFasi() {
  const { role } = useAuth();
  const permissions = usePermissions();
  const puoModificare = !permissions.isLoading && (role === "company_admin" || role === "super_admin" || !!permissions.canEditSettingsOrders);
  const { evidenziata, vai } = useVaiASezione(true);
  return (
    <div className="max-w-3xl space-y-4">
      {!permissions.isLoading && !puoModificare && <AvvisoSolaLetturaImpostazioni permesso="Configurazione Ordini" />}
      <IndiceSezioni voci={SEZIONI} onVai={vai} />
      <ModelliFasiConfig evidenziata={evidenziata === "modelli"} />
      <NuovaCommessaConfig
        puoModificare={puoModificare}
        evidenziata={evidenziata === "nuova-commessa"}
        onVaiAiModelli={() => vai("modelli")}
      />
      <SezioneImpostazione
        id="regole"
        titolo="Regole per tutte le commesse"
        descrizione="Valgono per ogni commessa dell'azienda, anche per quelle già aperte."
        ambito={<AmbitoImpostazione>Tutte le commesse</AmbitoImpostazione>}
        azione={<span>Si salvano subito</span>}
        evidenziata={evidenziata === "regole"}
      >
        <AvanzamentoCommessaConfig puoModificare={puoModificare} />
        <ChiSpuntaConfig puoModificare={puoModificare} />
      </SezioneImpostazione>
    </div>
  );
}
