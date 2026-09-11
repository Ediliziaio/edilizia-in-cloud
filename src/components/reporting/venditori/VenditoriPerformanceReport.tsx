import { useMemo } from "react";
import { useURLFilters } from "@/hooks/useURLFilters";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Users, BarChart3, TrendingUp, GitCompareArrows } from "lucide-react";
import {
  useVendorKPI,
  useVendorTrend,
  useVendorFunnel,
  useVendorIntegrationHealth,
} from "@/hooks/useVendorReport";
import { startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, subYears, startOfDay, endOfDay, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { aggregateTeamKPI, periodoPrecedente } from "@/lib/reporting/venditoriRegole";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { KPISection } from "./KPISection";
import { AppuntamentiScorecard } from "./AppuntamentiScorecard";
import { TempisticheScorecard } from "./TempisticheScorecard";
import { AgentRadarProfile } from "./AgentRadarProfile";
import { VendorOperationalDiagnosis } from "./VendorOperationalDiagnosis";
import { VenditoriFunnel } from "./VenditoriFunnel";
import { VenditoriRanking } from "./VenditoriRanking";
import { VenditoriTrend } from "./VenditoriTrend";
import { VenditoriInsights } from "./VenditoriInsights";
import { VenditoriConfronto } from "./VenditoriConfronto";
import { ReportExportMenu } from "../shared/ReportExportMenu";

const VENDOR_PERIODS: { value: string; label: string }[] = [
  { value: "mese", label: "Questo mese" },
  { value: "mese_prec", label: "Mese scorso" },
  { value: "trimestre", label: "Ultimo trimestre" },
  { value: "semestre", label: "Ultimo semestre" },
  { value: "anno", label: "Anno corrente" },
  { value: "anno_prec", label: "Anno scorso" },
  { value: "custom", label: "Personalizzato…" },
];

// Risolve la fascia temporale scelta (scorciatoia o range custom) in un intervallo date.
function resolveVendorRange(key: string, customFrom: string, customTo: string): { inizio: Date; fine: Date } {
  const now = new Date();
  switch (key) {
    case "mese": return { inizio: startOfMonth(now), fine: endOfMonth(now) };
    case "mese_prec": { const m = subMonths(now, 1); return { inizio: startOfMonth(m), fine: endOfMonth(m) }; }
    // «Ultimo trimestre» = questo mese e i due prima (era startOf(mese − 3): 4 mesi).
    case "trimestre": return { inizio: startOfMonth(subMonths(now, 2)), fine: endOfMonth(now) };
    case "semestre": return { inizio: startOfMonth(subMonths(now, 5)), fine: endOfMonth(now) };
    case "anno": return { inizio: startOfYear(now), fine: endOfYear(now) };
    case "anno_prec": { const y = subYears(now, 1); return { inizio: startOfYear(y), fine: endOfYear(y) }; }
    case "custom": {
      // parseISO legge «2026-08-10» come giorno locale; new Date() lo leggeva in UTC
      const f = customFrom ? startOfDay(parseISO(customFrom)) : startOfMonth(subMonths(now, 2));
      const t = customTo ? endOfDay(parseISO(customTo)) : now;
      return f.getTime() <= t.getTime() ? { inizio: f, fine: t } : { inizio: t, fine: f };
    }
    default: return { inizio: startOfMonth(subMonths(now, 2)), fine: endOfMonth(now) };
  }
}

const EXPORT_COLUMNS = [
  { key: "nome_agente", label: "Agente" },
  { key: "opp_totali", label: "Opportunità create nel periodo" },
  { key: "opp_vinte", label: "Vinte" },
  { key: "opp_perse", label: "Perse" },
  { key: "opp_aperte", label: "Aperte" },
  { key: "tasso_chiusura", label: "Tasso Chiusura %" },
  { key: "tasso_conversione", label: "Tasso Conversione %" },
  { key: "fatturato_generato", label: "Fatturato €" },
  { key: "importo_medio_chiusura", label: "Importo Medio €" },
  { key: "pipeline_valore", label: "Pipeline €" },
  { key: "appuntamenti_fissati", label: "App. Fissati" },
  { key: "appuntamenti_effettuati", label: "App. Effettuati" },
  { key: "tasso_show_up", label: "Show-Up %" },
  { key: "avg_giorni_chiusura", label: "Giorni Chiusura Media" },
  { key: "nuovi_contatti", label: "Nuovi Contatti" },
];

const VISTE = ["overview", "ranking", "trend", "confronto"];

// Mesi di cui arretrare per il confronto; il periodo libero confronta i giorni subito prima.
const MESI_CONFRONTO: Record<string, number | null> = {
  mese: 1, mese_prec: 1, trimestre: 3, semestre: 6, anno: 12, anno_prec: 12, custom: null,
};

const VenditoriPerformanceReport = () => {
  // Periodo, venditore e scheda stanno nell'URL: un link mandato a un collega
  // o un ricarica della pagina mostrano gli stessi numeri.
  const { params: filtri, setParam } = useURLFilters({
    periodKey: { key: "periodo", defaultValue: "trimestre" },
    customFrom: { key: "da", defaultValue: "" },
    customTo: { key: "a", defaultValue: "" },
    agentId: { key: "venditore", defaultValue: "tutti" },
    activeTab: { key: "vista", defaultValue: "overview" },
  });
  const periodKey = VENDOR_PERIODS.some((p) => p.value === filtri.periodKey) ? filtri.periodKey : "trimestre";
  const customFrom = /^\d{4}-\d{2}-\d{2}$/.test(filtri.customFrom) ? filtri.customFrom : "";
  const customTo = /^\d{4}-\d{2}-\d{2}$/.test(filtri.customTo) ? filtri.customTo : "";
  const agentId = filtri.agentId;
  const activeTab = VISTE.includes(filtri.activeTab) ? filtri.activeTab : "overview";
  const setPeriodKey = (v: string) => setParam("periodKey", v);
  const setCustomFrom = (v: string) => setParam("customFrom", v);
  const setCustomTo = (v: string) => setParam("customTo", v);
  const setAgentId = (v: string) => setParam("agentId", v);
  const setActiveTab = (v: string) => setParam("activeTab", v);
  const navigate = useNavigate();

  const { inizio, fine } = useMemo(
    () => resolveVendorRange(periodKey, customFrom, customTo),
    [periodKey, customFrom, customTo],
  );
  const effectiveAgentId = agentId === "tutti" ? undefined : agentId;
  // Sempre la lista completa: il venditore si sceglie qui. Chiedendo alla
  // funzione un venditore solo, la tendina restava con lui solo e il radar
  // (che confronta con il team) non poteva comparire.
  const { data: rawKpiList = [], isLoading, isError: erroreKpi, refetch: riprovaKpi } = useVendorKPI(inizio, fine);
  const precedenteRange = useMemo(
    () => periodoPrecedente(inizio, fine, MESI_CONFRONTO[periodKey] ?? null),
    [inizio, fine, periodKey],
  );
  const { data: rawKpiPrecedente = [] } = useVendorKPI(
    precedenteRange.inizio, precedenteRange.fine, undefined, activeTab === "overview",
  );
  const etichettaPrecedente = `${format(precedenteRange.inizio, "d MMM yyyy", { locale: it })} – ${format(precedenteRange.fine, "d MMM yyyy", { locale: it })}`;

  // Il report Venditori deve mostrare i VENDITORI: escludi chi è SOLO call center
  // (gestisce appuntamenti ma non è il venditore che chiude). Stessa definizione
  // del campo "Venditore" delle opportunità. La RPC get_vendor_kpi_per_agent
  // raggruppa per assigned_to SENZA filtrare i ruoli → filtriamo qui.
  // Fallback sicuro: se i ruoli non sono ancora disponibili, NON filtriamo
  // (meglio mostrare tutto che una lista vuota).
  const companyId = useEffectiveCompanyId();
  const { data: allStaff = [] } = useCompanyStaffUsers(companyId, "all");
  const pureCallCenter = useMemo(() => new Set(
    allStaff
      .filter((s) => {
        const roles = s.roles ?? [];
        return (
          roles.includes("call_center") &&
          !roles.some((r) => r === "super_admin" || r === "company_admin" || r === "salesperson")
        );
      })
      .map((s) => s.id),
  ), [allStaff]);
  const kpiList = useMemo(
    () => (pureCallCenter.size ? rawKpiList.filter((k) => !pureCallCenter.has(k.agent_id)) : rawKpiList),
    [rawKpiList, pureCallCenter],
  );
  const kpiListPrecedente = useMemo(
    () => (pureCallCenter.size ? rawKpiPrecedente.filter((k) => !pureCallCenter.has(k.agent_id)) : rawKpiPrecedente),
    [rawKpiPrecedente, pureCallCenter],
  );

  // Lazy load trend — only when overview or trend tab is active
  const needsTrend = activeTab === "overview" || activeTab === "trend";
  const { data: trend = [], isError: erroreTrend, refetch: riprovaTrend } = useVendorTrend(
    fine.getFullYear(),
    effectiveAgentId,
    needsTrend
  );
  const { data: funnel = [], isError: erroreFunnel, refetch: riprovaFunnel } = useVendorFunnel(inizio, fine, effectiveAgentId);
  const { data: integrationHealth = null, isLoading: isIntegrationLoading, isError: erroreIntegrazione, refetch: riprovaIntegrazione } =
    useVendorIntegrationHealth(inizio, fine, effectiveAgentId);
  // Una lettura fallita non è «nessun dato»: prima le schede dicevano «Nessun
  // dato disponibile per il periodo» e la diagnosi «in controllo».
  const nonArrivati = [
    erroreKpi && "i numeri dei venditori",
    erroreFunnel && "il funnel",
    erroreTrend && "l'andamento mensile",
    erroreIntegrazione && "il controllo del CRM",
  ].filter(Boolean) as string[];
  const riprova = () => {
    if (erroreKpi) void riprovaKpi();
    if (erroreFunnel) void riprovaFunnel();
    if (erroreTrend) void riprovaTrend();
    if (erroreIntegrazione) void riprovaIntegrazione();
  };

  const kpiSelected = agentId !== "tutti"
    ? kpiList.find(k => k.agent_id === agentId) ?? null
    : aggregateTeamKPI(kpiList);
  const kpiPrecedente = agentId !== "tutti"
    ? kpiListPrecedente.find(k => k.agent_id === agentId) ?? null
    : aggregateTeamKPI(kpiListPrecedente);

  const agenti = kpiList.map(k => ({ id: k.agent_id, nome: k.nome_agente }));

  // Export data
  const exportRows = useMemo(() =>
    kpiList.map(k => {
      const row: Record<string, string> = {};
      EXPORT_COLUMNS.forEach(c => { row[c.key] = String((k as any)[c.key] ?? ""); });
      return row;
    }),
    [kpiList]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Performance Venditori
              </CardTitle>
              <CardDescription className="mt-1">
                Analisi KPI da Opportunità, Contatti e Appuntamenti
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <ReportExportMenu
                rows={exportRows}
                columns={EXPORT_COLUMNS}
                filenameBase={`report-venditori-${periodKey}`}
                disabled={isLoading}
              />
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Seleziona agente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tutti">👥 Tutti gli agenti</SelectItem>
                  {agenti.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={periodKey} onValueChange={setPeriodKey}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VENDOR_PERIODS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {periodKey === "custom" && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={customFrom}
                    max={customTo || undefined}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    aria-label="Data inizio"
                    className="h-10 rounded-md border border-slate-200 px-2 text-sm text-slate-700"
                  />
                  <span className="text-slate-400">→</span>
                  <input
                    type="date"
                    value={customTo}
                    min={customFrom || undefined}
                    onChange={(e) => setCustomTo(e.target.value)}
                    aria-label="Data fine"
                    className="h-10 rounded-md border border-slate-200 px-2 text-sm text-slate-700"
                  />
                </div>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {nonArrivati.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>Non sono arrivati {nonArrivati.join(", ")}: quello che manca non è uno zero.</span>
          <Button size="sm" variant="outline" onClick={riprova}>Riprova</Button>
        </div>
      )}

      {/* Sub-tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="h-4 w-4" /> Panoramica
          </TabsTrigger>
          <TabsTrigger value="ranking" className="gap-1.5">
            <Users className="h-4 w-4" /> Ranking Agenti
          </TabsTrigger>
          <TabsTrigger value="trend" className="gap-1.5">
            <TrendingUp className="h-4 w-4" /> Trend Temporale
          </TabsTrigger>
          <TabsTrigger value="confronto" className="gap-1.5">
            <GitCompareArrows className="h-4 w-4" /> Confronto
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          {erroreKpi ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                I numeri dei venditori non sono arrivati: riprova dal pulsante qui sopra.
              </CardContent>
            </Card>
          ) : (
            <>
            <KPISection
              kpi={kpiSelected}
              isLoading={isLoading}
              precedente={kpiPrecedente}
              etichettaPrecedente={etichettaPrecedente}
            />

            {!erroreIntegrazione && (
              <VendorOperationalDiagnosis
                kpi={kpiSelected}
                integration={integrationHealth}
                isLoading={isLoading || isIntegrationLoading}
              />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <AppuntamentiScorecard kpi={kpiSelected} isLoading={isLoading} />
              <TempisticheScorecard kpi={kpiSelected} isLoading={isLoading} />
              {agentId !== "tutti" && kpiList.length > 1 ? (
                <AgentRadarProfile selected={kpiSelected} all={kpiList} />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Profilo Radar</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Seleziona un singolo agente per visualizzare il profilo radar rispetto alla media del team.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>

            <VenditoriFunnel stages={funnel} />

            <VenditoriInsights kpi={kpiSelected} trend={trend} kpiList={kpiList} />
            </>
          )}
        </TabsContent>

        <TabsContent value="ranking" className="mt-4">
          {erroreKpi ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                La classifica non è arrivata: riprova dal pulsante qui sopra.
              </CardContent>
            </Card>
          ) : (
            <VenditoriRanking
              kpiList={kpiList}
              isLoading={isLoading}
              onApriVenditore={(id) => navigate(`/azienda/marketing/opportunita?assigned_to=${id}`)}
            />
          )}
        </TabsContent>

        <TabsContent value="trend" className="mt-4">
          <VenditoriTrend trend={trend} agentId={agentId} />
        </TabsContent>

        <TabsContent value="confronto" className="mt-4">
          <VenditoriConfronto kpiList={kpiList} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default VenditoriPerformanceReport;
