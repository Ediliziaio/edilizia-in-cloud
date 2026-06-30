import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, BarChart3, TrendingUp, GitCompareArrows } from "lucide-react";
import {
  useVendorKPI,
  useVendorTrend,
  useVendorFunnel,
  useVendorIntegrationHealth,
  type VendorKPI,
} from "@/hooks/useVendorReport";
import { startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, subYears, startOfDay, endOfDay } from "date-fns";
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
    case "trimestre": return { inizio: startOfMonth(subMonths(now, 3)), fine: endOfMonth(now) };
    case "semestre": return { inizio: startOfMonth(subMonths(now, 6)), fine: endOfMonth(now) };
    case "anno": return { inizio: startOfYear(now), fine: endOfYear(now) };
    case "anno_prec": { const y = subYears(now, 1); return { inizio: startOfYear(y), fine: endOfYear(y) }; }
    case "custom": {
      const f = customFrom ? startOfDay(new Date(customFrom)) : startOfMonth(subMonths(now, 3));
      const t = customTo ? endOfDay(new Date(customTo)) : now;
      return f.getTime() <= t.getTime() ? { inizio: f, fine: t } : { inizio: t, fine: f };
    }
    default: return { inizio: startOfMonth(subMonths(now, 3)), fine: endOfMonth(now) };
  }
}

const EXPORT_COLUMNS = [
  { key: "nome_agente", label: "Agente" },
  { key: "opp_totali", label: "Opportunità Totali" },
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

function aggregateTeamKPI(list: VendorKPI[]): VendorKPI | null {
  if (!list.length) return null;
  const sum = (f: keyof VendorKPI) => list.reduce((a, k) => a + (Number(k[f]) || 0), 0);
  const vinte = sum("opp_vinte");
  const chiuse = vinte + sum("opp_perse");
  const aptFissati = sum("appuntamenti_fissati");
  const aptEff = sum("appuntamenti_effettuati");
  const oppTotali = sum("opp_totali");
  const minVals = list.map(k => k.min_giorni_chiusura).filter(v => v > 0);
  const maxVals = list.map(k => k.max_giorni_chiusura).filter(v => v > 0);
  // Ciclo medio: media SOLO sugli agenti con vendite (>0), altrimenti gli agenti
  // senza vendite (0gg) la trascinano sotto il minimo → "media < min" incoerente.
  const cicloVals = list.map(k => Number(k.avg_giorni_chiusura) || 0).filter(v => v > 0);
  const cicloPerseVals = list.map(k => Number(k.avg_giorni_chiusura_perse) || 0).filter(v => v > 0);

  return {
    agent_id: "team",
    nome_agente: "Team completo",
    email_agente: "",
    opp_totali: oppTotali,
    opp_vinte: vinte,
    opp_perse: sum("opp_perse"),
    opp_aperte: sum("opp_aperte"),
    tasso_chiusura: chiuse > 0 ? Math.round((1000 * vinte) / chiuse) / 10 : null,
    tasso_conversione: oppTotali > 0 ? Math.round((1000 * vinte) / oppTotali) / 10 : null,
    fatturato_generato: sum("fatturato_generato"),
    importo_medio_chiusura: vinte > 0 ? Math.round(sum("fatturato_generato") / vinte) : 0,
    pipeline_valore: sum("pipeline_valore"),
    fatturato_perso: sum("fatturato_perso"),
    appuntamenti_fissati: aptFissati,
    appuntamenti_effettuati: aptEff,
    appuntamenti_no_show: sum("appuntamenti_no_show"),
    tasso_show_up: aptFissati > 0 ? Math.round((1000 * aptEff) / aptFissati) / 10 : null,
    tasso_app_to_opp: aptEff > 0 ? Math.round((1000 * oppTotali) / aptEff) / 10 : null,
    tasso_app_to_close: aptEff > 0 ? Math.round((1000 * vinte) / aptEff) / 10 : null,
    avg_giorni_chiusura: cicloVals.length ? Math.round((cicloVals.reduce((a, b) => a + b, 0) / cicloVals.length) * 10) / 10 : 0,
    avg_giorni_chiusura_perse: cicloPerseVals.length ? Math.round((cicloPerseVals.reduce((a, b) => a + b, 0) / cicloPerseVals.length) * 10) / 10 : 0,
    min_giorni_chiusura: minVals.length ? Math.min(...minVals) : 0,
    max_giorni_chiusura: maxVals.length ? Math.max(...maxVals) : 0,
    nuovi_contatti: sum("nuovi_contatti"),
  };
}

const VenditoriPerformanceReport = () => {
  const [periodKey, setPeriodKey] = useState("trimestre");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [agentId, setAgentId] = useState("tutti");
  const [activeTab, setActiveTab] = useState("overview");

  const { inizio, fine } = useMemo(
    () => resolveVendorRange(periodKey, customFrom, customTo),
    [periodKey, customFrom, customTo],
  );
  const effectiveAgentId = agentId === "tutti" ? undefined : agentId;
  const { data: rawKpiList = [], isLoading } = useVendorKPI(inizio, fine, effectiveAgentId);

  // Il report Venditori deve mostrare i VENDITORI: escludi chi è SOLO call center
  // (gestisce appuntamenti ma non è il venditore che chiude). Stessa definizione
  // del campo "Venditore" delle opportunità. La RPC get_vendor_kpi_per_agent
  // raggruppa per assigned_to SENZA filtrare i ruoli → filtriamo qui.
  // Fallback sicuro: se i ruoli non sono ancora disponibili, NON filtriamo
  // (meglio mostrare tutto che una lista vuota).
  const companyId = useEffectiveCompanyId();
  const { data: allStaff = [] } = useCompanyStaffUsers(companyId, "all");
  const kpiList = useMemo(() => {
    const pureCallCenter = new Set(
      allStaff
        .filter((s) => {
          const roles = s.roles ?? [];
          return (
            roles.includes("call_center") &&
            !roles.some((r) => r === "super_admin" || r === "company_admin" || r === "salesperson")
          );
        })
        .map((s) => s.id),
    );
    return pureCallCenter.size ? rawKpiList.filter((k) => !pureCallCenter.has(k.agent_id)) : rawKpiList;
  }, [rawKpiList, allStaff]);

  // Lazy load trend — only when overview or trend tab is active
  const needsTrend = activeTab === "overview" || activeTab === "trend";
  const { data: trend = [] } = useVendorTrend(
    fine.getFullYear(),
    effectiveAgentId,
    needsTrend
  );
  const { data: funnel = [] } = useVendorFunnel(inizio, fine, effectiveAgentId);
  const { data: integrationHealth = null, isLoading: isIntegrationLoading } =
    useVendorIntegrationHealth(inizio, fine, effectiveAgentId);

  const kpiSelected = agentId !== "tutti"
    ? kpiList.find(k => k.agent_id === agentId) ?? null
    : aggregateTeamKPI(kpiList);

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

      {/* Sub-tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
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
          <KPISection kpi={kpiSelected} isLoading={isLoading} />

          <VendorOperationalDiagnosis
            kpi={kpiSelected}
            integration={integrationHealth}
            isLoading={isLoading || isIntegrationLoading}
          />

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
        </TabsContent>

        <TabsContent value="ranking" className="mt-4">
          <VenditoriRanking kpiList={kpiList} isLoading={isLoading} />
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
