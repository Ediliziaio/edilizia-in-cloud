/**
 * AgencyOverview — "console agenzia" stile GoHighLevel.
 *
 * Mostra una card di sintesi per ogni azienda a cui l'utente ha accesso (primaria,
 * collegate via multi_company_access, rivenditori figli) con KPI essenziali e un
 * pulsante "Entra" che cambia contesto azienda tramite lo switcher. Alimentata
 * dall'RPC sicura agency_companies_overview (aggrega solo aziende autorizzate).
 */

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, ArrowRight, Check } from "lucide-react";

interface OverviewRow {
  company_id: string;
  company_name: string;
  is_primary: boolean;
  access_role: string;
  relation: string;
  open_orders_count: number;
  month_revenue: number;
}

const eur = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);

const relationLabel: Record<string, string> = {
  primaria: "Azienda primaria",
  collegata: "Collegata",
  rivenditore: "Rivenditore",
};

export default function AgencyOverview() {
  const navigate = useNavigate();
  const { effectiveCompany, switchMultiCompany, multiCompanyAccesses } = useAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["agency-companies-overview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("agency_companies_overview");
      if (error) throw error;
      return (data ?? []) as OverviewRow[];
    },
  });

  const rows = data ?? [];
  const canSwitchTo = (companyId: string) =>
    (multiCompanyAccesses ?? []).some((a) => a.company_id === companyId);

  const enter = (row: OverviewRow) => {
    if (row.company_id === effectiveCompany?.id) {
      navigate("/azienda/attivita");
      return;
    }
    if (canSwitchTo(row.company_id)) {
      void switchMultiCompany(row.company_id);
      navigate("/azienda/attivita");
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Building2 className="h-5 w-5" /> Le mie aziende
        </h1>
        <p className="text-sm text-muted-foreground">
          Tutte le aziende a cui hai accesso, con un colpo d'occhio su ordini aperti e fatturato del mese.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Caricamento aziende…
        </div>
      ) : isError ? (
        <p className="py-10 text-sm text-destructive">Errore nel caricamento delle aziende.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => {
            const isCurrent = row.company_id === effectiveCompany?.id;
            const reachable = isCurrent || canSwitchTo(row.company_id);
            return (
              <Card key={row.company_id} className={isCurrent ? "border-primary/50" : undefined}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-snug truncate">{row.company_name}</CardTitle>
                    {isCurrent && (
                      <Badge variant="outline" className="shrink-0 text-primary border-primary/40 gap-1">
                        <Check className="h-3 w-3" /> Attiva
                      </Badge>
                    )}
                  </div>
                  <Badge variant="secondary" className="w-fit text-xs">
                    {relationLabel[row.relation] ?? row.relation}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-muted/50 p-2">
                      <p className="text-lg font-semibold">{row.open_orders_count}</p>
                      <p className="text-xs text-muted-foreground">Ordini aperti</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <p className="text-lg font-semibold">{eur(Number(row.month_revenue))}</p>
                      <p className="text-xs text-muted-foreground">Fatturato mese</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isCurrent ? "secondary" : "default"}
                    className="w-full"
                    disabled={!reachable}
                    onClick={() => enter(row)}
                  >
                    {isCurrent ? "Vai" : "Entra"} <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
