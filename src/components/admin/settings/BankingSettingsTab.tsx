import { Building2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Landmark } from "lucide-react";
import CompanyTesoreriaCard from "./banking/CompanyTesoreriaCard";

/**
 * Tab Banking (admin): gestione globale del modulo Tesoreria per le aziende.
 *
 * NB: il collegamento dei conti correnti usa **Enable Banking** (Open Banking
 * PSD2/AIS), configurato via secret Supabase (ENABLE_BANKING_APP_ID /
 * ENABLE_BANKING_PRIVATE_KEY), non da questa schermata. La vecchia integrazione
 * GoCardless è stata rimossa (provider dismesso: signup chiusi da lug-2025).
 */
export default function BankingSettingsTab() {
  return (
    <div className="space-y-6">
      <Alert>
        <Landmark className="h-4 w-4" />
        <AlertDescription>
          Il collegamento dei conti correnti usa <strong>Enable Banking</strong> (Open Banking PSD2):
          le credenziali sono configurate nei secret del progetto, non da qui. Le aziende collegano i
          conti da <em>Impostazioni → Integrazioni</em>.
        </AlertDescription>
      </Alert>

      <CompanyTesoreriaCard />
    </div>
  );
}

// Re-export dell'icona Building2 per compat (alcuni import esterni potrebbero esistere)
export { Building2 };
