/**
 * A quale azienda si collega Facebook (19/09/2026).
 *
 * Il wizard Meta (OAuth → pagine → moduli → mappatura → attivazione) leggeva
 * l'azienda solo da `effectiveCompany`: nell'area del superadmin quella non
 * c'è, e i lead delle sponsorizzate dei brand della piattaforma finivano su
 * un'azienda qualsiasi a cui la pagina era rimasta agganciata. Con questo
 * contesto lo stesso wizard lavora per un'azienda indicata da chi lo apre —
 * nel superadmin, il CRM della piattaforma. Senza provider tutto resta com'era.
 */
import { createContext, useContext, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";

const MetaCompanyContext = createContext<string | null>(null);

export function MetaCompanyProvider({ companyId, children }: { companyId: string; children: ReactNode }) {
  return <MetaCompanyContext.Provider value={companyId}>{children}</MetaCompanyContext.Provider>;
}

/** L'azienda del collegamento Meta: quella del provider, altrimenti quella in cui si sta lavorando. */
export function useMetaCompanyId(): string | undefined {
  const indicata = useContext(MetaCompanyContext);
  const { effectiveCompany } = useAuth();
  return indicata ?? ((effectiveCompany as { id?: string } | null)?.id ?? undefined);
}
