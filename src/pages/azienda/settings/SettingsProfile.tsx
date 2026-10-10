import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVaiASezione } from "@/hooks/useVaiASezione";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AmbitoImpostazione,
  IndiceSezioni,
  SezioneImpostazione,
  type VoceIndice,
} from "@/components/impostazioni/SezioneImpostazione";
import { LogoUploader } from "@/components/settings/LogoUploader";
import { CompanyProfileForm } from "@/components/settings/CompanyProfileForm";
import { CustomerPortalToggle } from "@/components/settings/CustomerPortalToggle";
import { BonusFiscaliToggles } from "@/components/settings/BonusFiscaliToggles";
import { RecensioniOnlineForm } from "@/components/settings/RecensioniOnlineForm";

/**
 * Profilo aziendale: i dati dell'azienda che compaiono su preventivi, fatture e documenti.
 *
 * 09/10/2026, come «Prezzo e margini»: una sezione per argomento con il suo titolo e il suo indirizzo (`…/profilo#recensioni`),
 * un indice in cima e il «Salva dati aziendali» che resta in vista mentre si scorre. Prima le funzioni che si cercano
 * (voto su Google nei preventivi, numero delle commesse, bonus edilizi, portale clienti) stavano in fondo a una pila di
 * riquadri uguali, senza titolo né indirizzo, e da telefono sparivano. Il riquadro «Note interne» non c'è più (vedi
 * CompanyProfileForm).
 */
const SEZIONI_UFFICIO: VoceIndice[] = [
  { id: "dati-azienda", etichetta: "Dati" },
  { id: "logo", etichetta: "Logo" },
  { id: "recensioni", etichetta: "Recensioni" },
  { id: "portale-clienti", etichetta: "Portale" },
  { id: "bonus", etichetta: "Bonus" },
];

export default function SettingsProfile() {
  const { effectiveCompany, refreshAuth } = useAuth();
  const permissions = usePermissions();
  const isMobile = useIsMobile();
  const { evidenziata, vai } = useVaiASezione(true);
  // Il punto della barra in cui il modulo dei dati porta «Salva dati aziendali» e il suo stato.
  const [azioni, setAzioni] = useState<HTMLElement | null>(null);

  // Onora i permessi granulari. Prima la pagina era gated SOLO su isAdmin: uno
  // staff con "Profilo Aziendale" concesso passava il route-guard ma vedeva una
  // pagina VUOTA (permesso di fatto morto). Ora: view = mostra i dati,
  // edit = consenti la modifica.
  const canView = permissions.isAdmin || permissions.canViewSettingsProfile;
  const canEdit = permissions.isAdmin || permissions.canEditSettingsProfile;

  // La route è già protetta da canViewSettingsProfile; guardia difensiva.
  if (!canView) return null;

  // Da telefono restano i dati e il logo: voto, portale e bonus si impostano una volta, al computer.
  const voci = SEZIONI_UFFICIO.filter((voce) => canEdit || !["logo", "portale-clienti", "bonus"].includes(voce.id));

  return (
    <div className="max-w-3xl space-y-4 max-sm:space-y-3">
      {!canEdit && (
        <Alert>
          <AlertDescription>
            Stai consultando i dati: li cambia chi ha il permesso «Profilo aziendale» in modifica.
          </AlertDescription>
        </Alert>
      )}

      {/* disabled su un fieldset spegne ogni campo e pulsante che contiene (solo lettura onesta). */}
      <fieldset disabled={!canEdit} className="m-0 min-w-0 space-y-4 border-0 p-0 max-sm:space-y-3">
        {/* Indice e «Salva» restano in vista mentre si scorre: prima il pulsante stava in fondo a un modulo da sei sezioni. */}
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
          {!isMobile && <IndiceSezioni voci={voci} onVai={vai} />}
          <div ref={setAzioni} className="ml-auto flex shrink-0 items-center gap-3" />
        </div>

        <SezioneImpostazione
          id="dati-azienda"
          titolo="Dati dell'azienda"
          descrizione={
            <>
              Dati fiscali, contatti e sede legale. Le altre sedi (showroom, magazzini, uffici) sono in{" "}
              <Link to="/azienda/impostazioni/sedi" className="font-medium underline">Sedi</Link>; la fatturazione elettronica in{" "}
              <Link to="/azienda/impostazioni/fatturazione" className="font-medium underline">Fatturazione</Link>.
            </>
          }
          ambito={<AmbitoImpostazione>Tutta l'azienda</AmbitoImpostazione>}
          evidenziata={evidenziata === "dati-azienda"}
        >
          <CompanyProfileForm canEdit={canEdit} azioniSlot={azioni} evidenziata={evidenziata} />
        </SezioneImpostazione>

        {canEdit && (
          <SezioneImpostazione
            id="logo"
            titolo="Logo"
            descrizione={
              <>
                Il logo compare su preventivi, email e portale clienti. Colori e nome della piattaforma si cambiano in{" "}
                <Link to="/azienda/impostazioni/branding" className="font-medium underline">White-Label</Link>.
              </>
            }
            ambito={<AmbitoImpostazione>Tutta l'azienda</AmbitoImpostazione>}
            azione={<span>Si salva subito</span>}
            evidenziata={evidenziata === "logo"}
          >
            <div className="px-4 py-4 max-sm:px-3">
              <LogoUploader company={effectiveCompany} onLogoUpdated={refreshAuth} />
            </div>
          </SezioneImpostazione>
        )}

        {/* Il voto su Google, Trustpilot…: una volta qui, vale per tutti i preventivi.
            Mobile no, come portale clienti e bonus: si impostano una volta, al computer. */}
        <div className="max-sm:hidden">
          <SezioneImpostazione
            id="recensioni"
            titolo="Recensioni online"
            descrizione="Il tuo voto su Google, Trustpilot o altre piattaforme: nei preventivi esce nella pagina «Dicono di noi», accanto alle parole dei clienti scritte nei modelli."
            ambito={<AmbitoImpostazione>Preventivi</AmbitoImpostazione>}
            evidenziata={evidenziata === "recensioni"}
          >
            <div className="px-4 py-4">
              <RecensioniOnlineForm canEdit={canEdit} />
            </div>
          </SezioneImpostazione>
        </div>

        {canEdit && (
          <div className="max-sm:hidden">
            <SezioneImpostazione
              id="portale-clienti"
              titolo="Portale clienti"
              descrizione="L'area privata dove i tuoi clienti entrano con email e password."
              ambito={<AmbitoImpostazione>Clienti</AmbitoImpostazione>}
              evidenziata={evidenziata === "portale-clienti"}
            >
              <div className="px-4 py-4">
                <CustomerPortalToggle />
              </div>
            </SezioneImpostazione>
          </div>
        )}

        {canEdit && (
          <div className="max-sm:hidden">
            <SezioneImpostazione
              id="bonus"
              titolo="Bonus edilizi e blocca prezzo"
              descrizione="Per chi lavora con le detrazioni edilizie: attivali solo se ti servono. Si salvano subito."
              ambito={<AmbitoImpostazione>Commesse</AmbitoImpostazione>}
              evidenziata={evidenziata === "bonus"}
            >
              <BonusFiscaliToggles />
            </SezioneImpostazione>
          </div>
        )}
      </fieldset>
    </div>
  );
}
