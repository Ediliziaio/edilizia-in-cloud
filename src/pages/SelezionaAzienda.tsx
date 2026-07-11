/**
 * SelezionaAzienda — selettore d'ingresso multi-azienda (stile GoHighLevel).
 *
 * Pagina a tutto schermo mostrata SUBITO DOPO il login quando l'utente ha accesso
 * a più aziende: sceglie in quale entrare. NON mostra dati sensibili (fatturato,
 * ordini) delle aziende — solo nome e ruolo. Dopo la scelta entra nell'app di
 * quell'azienda (switchMultiCompany → /azienda/attivita).
 *
 * Auto-risolve: se l'utente ha ≤1 azienda accessibile o sta impersonando, va
 * dritto in Attività senza mostrare nulla.
 */

import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getCompanyAccessRoleLabel } from "@/lib/auth/multiCompany";
import { Loader2, Building2, ArrowRight } from "lucide-react";

export default function SelezionaAzienda() {
  const navigate = useNavigate();
  const {
    isLoading,
    multiCompanyAccesses,
    multiCompanyLoaded,
    switchMultiCompany,
    isImpersonating,
    profile,
    user,
  } = useAuth();
  const [entering, setEntering] = useState<string | null>(null);

  if (!isLoading && !user) return <Navigate to="/login" replace />;

  // Aspetta il caricamento degli accessi prima di decidere.
  if (isLoading || !multiCompanyLoaded) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Caricamento aziende…</p>
      </div>
    );
  }

  // Un solo accesso (o impersonation) → nessuna scelta da fare: entra subito.
  if (isImpersonating || (multiCompanyAccesses?.length ?? 0) <= 1) {
    return <Navigate to="/azienda/attivita" replace />;
  }

  const primaryId = profile?.company_id ?? null;

  const enter = async (companyId: string) => {
    if (entering) return;
    setEntering(companyId);
    try {
      await switchMultiCompany(companyId);
    } finally {
      navigate("/azienda/attivita", { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-muted/40 to-background">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold">Scegli l'azienda</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Hai accesso a più aziende. Seleziona quella con cui vuoi lavorare adesso.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {multiCompanyAccesses.map((a) => {
            const name = a.company?.name ?? "Azienda";
            const isPrimary = primaryId && a.company_id === primaryId;
            const busy = entering === a.company_id;
            return (
              <button
                key={a.id}
                onClick={() => enter(a.company_id)}
                disabled={!!entering}
                className="group text-left rounded-xl border bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/50 transition-all disabled:opacity-60 flex items-center gap-3"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary font-semibold">
                  {name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {getCompanyAccessRoleLabel(a.access_role)}
                    {isPrimary ? " · Azienda principale" : ""}
                  </p>
                </div>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                ) : (
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Potrai cambiare azienda in qualsiasi momento dal selettore in alto a sinistra.
        </p>
      </div>
    </div>
  );
}
