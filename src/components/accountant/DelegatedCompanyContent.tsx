import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useCurrentCommercialistaAccessMode } from "@/hooks/accountant/useAccountantPortalData";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function DelegatedCompanyContent({ companyId, effectiveCompanyId, children }: {
  companyId: string | null;
  effectiveCompanyId: string | undefined;
  children: ReactNode;
}) {
  const t = useT();
  const delega = useCurrentCommercialistaAccessMode(companyId, true);
  const { pathname } = useLocation();

  if (delega.isLoading || (delega.data && !delega.isError && effectiveCompanyId !== companyId)) {
    return <p role="status" className="p-6 text-sm text-muted-foreground">{t("Apertura dell’azienda delegata…")}</p>;
  }
  if (!delega.data || delega.isError) {
    return (
      <div className="space-y-3 rounded-lg border bg-card p-6" role="status">
        <h2 className="font-semibold">{delega.isError ? t("Impossibile verificare la delega") : t("Delega non disponibile")}</h2>
        {delega.isError && <Button variant="outline" className="mr-2" onClick={() => void delega.refetch()}>{t("Riprova")}</Button>}
        <Button asChild variant="outline"><Link to="/commercialista">{t("Torna allo studio")}</Link></Button>
      </div>
    );
  }
  const commessa = pathname.match(/^\/azienda\/ordini\/([0-9a-f-]{36})\/?$/i)?.[1];
  const proposta = new URLSearchParams({ azienda: companyId ?? "" });
  if (commessa) proposta.set("commessa", commessa);
  return <>
    {delega.data === "approval_required" && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-2.5 text-sm">
      <span>{t("Accesso con approvazione")}</span>
      <Button asChild size="sm" variant="outline"><Link to={`/commercialista/richieste?${proposta}`}>{t("Proponi modifica")}</Link></Button>
    </div>}
    {children}
  </>;
}
