import { Link } from "react-router-dom";
import { useAuthCompany, useAuthUser } from "@/contexts/AuthContext";
import { consentiSimulazionePreventivoAi } from "@/lib/preventivi/localSimulation";
import Simulazione from "@/components/quotes/dev/QuoteAiSimulation";

export default function QuoteAiSimulationPage() {
  const { effectiveCompany } = useAuthCompany();
  const { user } = useAuthUser();
  if (!consentiSimulazionePreventivoAi(import.meta.env.DEV, window.location.hostname, effectiveCompany?.id)) {
    return <div className="p-6"><h1 className="text-lg font-semibold">Simulazione disponibile solo in Demo Azienda 2, in locale</h1><p className="mt-2 text-sm text-muted-foreground">Seleziona Demo Azienda 2 dal menu aziende. Nessun dato è stato generato o salvato.</p><Link className="mt-4 inline-block underline" to="/azienda/marketing/preventivi">Torna ai preventivi</Link></div>;
  }
  return <><div className="px-6 pt-4"><Link to="/azienda/marketing/preventivi" className="text-sm text-muted-foreground underline">Torna ai preventivi</Link></div><Simulazione key={`${user?.id}:${effectiveCompany.id}`} ownerId={user?.id} companyId={effectiveCompany.id} companyName={effectiveCompany.name} /></>;
}
