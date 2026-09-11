import type { ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useSalesVelocity,
  useStalledOpportunities,
  useQuoteRevenue,
  useWeightedPipeline,
} from "@/hooks/useSalesOS";
import { getPeriodRange } from "@/lib/salesOSPeriod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight, Gauge, Receipt, Target, TrendingUp, Users, Zap } from "lucide-react";

/*
 * Tab «Commerciale» della dashboard marketing.
 *
 * Era una seconda copia di Sales OS — velocity, pipeline pesata, forecast,
 * opportunità ferme, confronto venditori, fonti, top lead: 540 righe — con un
 * confronto venditori chiamato con anno e mese al posto di due date. Ora mostra
 * i quattro numeri che contano, dalle STESSE funzioni di Sales OS, e porta alle
 * due pagine che fanno il lavoro: Sales OS (cosa fare oggi) e Reportistica →
 * Venditori (chi vende come). Un numero, un posto dove si calcola.
 */

const fmt = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

function Numero({ icona: Icona, titolo, valore, dettaglio, tono }: {
  icona: ComponentType<{ className?: string }>;
  titolo: string;
  valore: string;
  dettaglio: string;
  tono: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icona className={`h-4 w-4 ${tono}`} />
          {titolo}
        </div>
        <div className="mt-1 text-2xl font-bold">{valore}</div>
        <p className="text-xs text-muted-foreground mt-0.5">{dettaglio}</p>
      </CardContent>
    </Card>
  );
}

export function TabCommerciale() {
  const { effectiveCompany } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();
  const companyId = effectiveCompany?.id ?? null;
  const periodo = getPeriodRange("30d");

  const { data: velocity, isLoading: carVelocity } = useSalesVelocity(companyId, periodo.daysBack);
  const { data: ferme, isLoading: carFerme } = useStalledOpportunities(companyId);
  const { data: preventivi, isLoading: carPreventivi } = useQuoteRevenue(companyId, periodo.dateFrom, periodo.dateTo);
  const { data: fasi, isLoading: carFasi } = useWeightedPipeline(companyId);

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <Target className="h-8 w-8 opacity-40 mb-2" />
        <span className="text-sm">Seleziona un'azienda per le statistiche commerciali.</span>
      </div>
    );
  }

  const critiche = (ferme ?? []).filter((f) => f.days_stalled >= f.stalled_threshold * 2).length;
  const pesato = (fasi ?? []).reduce((s, f) => s + f.weighted_value, 0);
  const attesa = "…";

  return (
    <div className="space-y-4 mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Numero
          icona={AlertTriangle}
          tono="text-destructive"
          titolo="Opportunità ferme"
          valore={carFerme ? attesa : String(ferme?.length ?? 0)}
          dettaglio={critiche > 0 ? `${critiche} critiche, oltre il doppio della soglia` : "Nessuna oltre il doppio della soglia"}
        />
        <Numero
          icona={Receipt}
          tono="text-emerald-600"
          titolo="Firmato, ultimi 30 giorni"
          valore={carPreventivi ? attesa : fmt(preventivi?.actual_revenue)}
          dettaglio={`${preventivi?.signed_quotes_count ?? 0} preventivi firmati · IVA esclusa`}
        />
        <Numero
          icona={TrendingUp}
          tono="text-primary"
          titolo="Pipeline pesata"
          valore={carFasi ? attesa : fmt(pesato)}
          dettaglio="Valore aperto × probabilità"
        />
        <Numero
          icona={Zap}
          tono="text-amber-600"
          titolo="Velocity"
          valore={carVelocity ? attesa : `${fmt(velocity?.sales_velocity)}/giorno`}
          dettaglio={velocity?.sales_velocity == null ? "Serve una vendita chiusa negli ultimi 30 giorni" : "Pipeline aperta × tasso di chiusura ÷ ciclo"}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Il dettaglio sta in due pagine</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {permissions.canViewSalesOs && (
            <Button variant="outline" className="h-auto justify-between py-3 text-left" onClick={() => navigate("/azienda/marketing/sales-os")}>
              <span className="flex items-start gap-3">
                <Gauge className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <span>
                  <span className="block font-medium">Sales OS</span>
                  <span className="block text-xs font-normal text-muted-foreground whitespace-normal">
                    Cosa fare oggi: opportunità ferme, lead caldi, pipeline e forecast.
                  </span>
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Button>
          )}
          {permissions.canViewMarketingReports && (
            <Button variant="outline" className="h-auto justify-between py-3 text-left" onClick={() => navigate("/azienda/marketing/reportistica?tab=venditori")}>
              <span className="flex items-start gap-3">
                <Users className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <span>
                  <span className="block font-medium">Classifica venditori</span>
                  <span className="block text-xs font-normal text-muted-foreground whitespace-normal">
                    Chi vende come: fatturato, tasso di chiusura, appuntamenti, andamento mese per mese.
                  </span>
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
