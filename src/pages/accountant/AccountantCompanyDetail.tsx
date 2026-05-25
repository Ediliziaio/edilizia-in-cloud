/**
 * /commercialista/aziende/:companyId — redirect smart verso l'area aziendale.
 *
 * Il commercialista NON ha più un hub intermedio: cliccando su un'azienda
 * dalla lista entra DIRETTAMENTE in /azienda/cruscotto?commercialistaMode=1&...
 * con la sidebar filtrata (no Marketing & Vendita, no Automazioni & AI).
 *
 * Questa pagina esiste solo come fallback se:
 *  - l'accesso è "invited" (deve accettare l'invito) → punta a inbox
 *  - l'accesso è "suspended" → messaggio chiaro
 *  - l'azienda non è trovata o policy revocata → torna alla lista
 * Per gli "active" si fa subito redirect.
 */

import { Link, Navigate, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, Clock, Loader2, Pause } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/hooks/useSEO";
import { useAccountantCompanyAccess } from "@/hooks/accountant/useAccountantPortalData";
import { buildCommercialistaCompanyUrl } from "@/lib/commercialistaImpersonation";

export default function AccountantCompanyDetail() {
  const { companyId } = useParams<{ companyId: string }>();
  const { data: access, isLoading } = useAccountantCompanyAccess(companyId);

  useSEO({
    title: access?.company?.name
      ? `${access.company.name} — Studio`
      : "Azienda — Studio",
    noindex: true,
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Accesso non trovato
  if (!access) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
          <AlertCircle className="h-12 w-12 text-amber-500" />
          <div>
            <h2 className="text-lg font-semibold">Azienda non trovata</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Non hai accesso a questa azienda oppure l'accesso è stato revocato.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/commercialista/aziende">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Torna alla lista
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ACCESSO ATTIVO → redirect immediato all'area aziendale (impersonation)
  if (access.status === "active" && access.company) {
    const targetUrl = buildCommercialistaCompanyUrl({
      companyId: access.company_id,
      companyName: access.company.name,
    });
    return <Navigate to={targetUrl} replace />;
  }

  // INVITATO → manda all'inbox per accettare
  if (access.status === "invited") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
          <Clock className="h-12 w-12 text-amber-500" />
          <div>
            <h2 className="text-lg font-semibold">
              Invito da {access.company?.name ?? "questa azienda"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Per accedere ai dati di questa azienda devi prima accettare l'invito
              dall'Inbox.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/commercialista/aziende">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Tutte le aziende
              </Link>
            </Button>
            <Button asChild>
              <Link to="/commercialista/inbox">Apri Inbox</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // SOSPESO → messaggio chiaro
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
        <Pause className="h-12 w-12 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold">
            Accesso sospeso da {access.company?.name ?? "questa azienda"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            L'azienda ha temporaneamente sospeso il tuo accesso. Contatta il
            cliente per riattivarlo.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/commercialista/aziende">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Torna alla lista
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
