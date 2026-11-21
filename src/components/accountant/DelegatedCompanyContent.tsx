import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useCurrentCommercialistaAccessMode } from "@/hooks/accountant/useAccountantPortalData";

export function DelegatedCompanyContent({ companyId, effectiveCompanyId, children }: {
  companyId: string | null;
  effectiveCompanyId: string | undefined;
  children: ReactNode;
}) {
  const delega = useCurrentCommercialistaAccessMode(companyId, true);

  if (delega.isLoading || (delega.data && !delega.isError && effectiveCompanyId !== companyId)) {
    return <p role="status" className="p-6 text-sm text-muted-foreground">Apertura dell’azienda delegata…</p>;
  }
  if (!delega.data || delega.isError) {
    return (
      <div className="space-y-3 rounded-lg border bg-card p-6" role="status">
        <h2 className="font-semibold">{delega.isError ? "Impossibile verificare la delega" : "Delega non disponibile"}</h2>
        {delega.isError && <Button variant="outline" className="mr-2" onClick={() => void delega.refetch()}>Riprova</Button>}
        <Button asChild variant="outline"><Link to="/commercialista">Torna allo studio</Link></Button>
      </div>
    );
  }
  return <>{children}</>;
}
