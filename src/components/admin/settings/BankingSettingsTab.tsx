import { Landmark } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import CompanyTesoreriaCard from "./banking/CompanyTesoreriaCard";

/**
 * Scheda «Collegamento» di Banking (admin): come si collegano i conti (Salt Edge) e per quali aziende
 * la Tesoreria è davvero accesa (sola lettura, si cambia da Funzionalità).
 *
 * Il collegamento Salt Edge AIS beta è configurato nei segreti del backend, non da questa schermata.
 */
export default function BankingSettingsTab() {
  return (
    <div className="space-y-4">
      <Alert>
        <Landmark className="h-4 w-4" />
        <AlertDescription>
          I conti correnti si collegano con <strong>Salt Edge</strong> (Open Banking PSD2, beta). Le credenziali stanno nei
          segreti del progetto, non da qui. Le aziende collegano i loro conti da <em>Impostazioni → Integrazioni</em>, se hanno
          la Tesoreria accesa.
        </AlertDescription>
      </Alert>

      <CompanyTesoreriaCard />
    </div>
  );
}
