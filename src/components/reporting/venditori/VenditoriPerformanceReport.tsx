import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, BarChart3, TrendingUp } from "lucide-react";
import { useVendorKPI, useVendorTrend, useVendorFunnel, type PeriodoVendor, type VendorKPI } from "@/hooks/useVendorReport";
import { KPISection } from "./KPISection";
import { AppuntamentiScorecard } from "./AppuntamentiScorecard";
import { TempisticheScorecard } from "./TempisticheScorecard";
import { AgentRadarProfile } from "./AgentRadarProfile";
import { VenditoriFunnel } from "./VenditoriFunnel";
import { VenditoriRanking } from "./VenditoriRanking";

const PERIODI: { value: PeriodoVendor; label: string }[] = [
  { value: "mese", label: "Questo mese" },
  { value: "mese_prec", label: "Mese scorso" },
  { value: "trimestre", label: "Ultimo trimestre" },
  { value: "semestre", label: "Ultimo semestre" },
  { value: "anno", label: "Anno corrente" },
];

function aggregateTeamKPI(list: VendorKPI[]): VendorKPI | null {
  if (!list.length) return null;
  const sum = (f: keyof VendorKPI) => list.reduce((a, k) => a + (Number(k[f]) || 0), 0);
  const avg = (f: keyof VendorKPI) => sum(f) / list.length;
  const vinte = sum("opp_vinte");
  const chiuse = vinte + sum("opp_perse");
  const aptFissati = sum("appuntamenti_fissati");
  const aptEff = sum("appuntamenti_effettuati");
  const oppTotali = sum("opp_totali");
  const minVals = list.map(k => k.min_giorni_chiusura).filter(v => v > 0);
  const maxVals = list.map(k => k.max_giorni_chiusura).filter(v => v > 0);

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
    avg_giorni_chiusura: Math.round(avg("avg_giorni_chiusura") * 10) / 10,
    avg_giorni_chiusura_perse: Math.round(avg("avg_giorni_chiusura_perse") * 10) / 10,
    min_giorni_chiusura: minVals.length ? Math.min(...minVals) : 0,
    max_giorni_chiusura: maxVals.length ? Math.max(...maxVals) : 0,
    nuovi_contatti: sum("nuovi_contatti"),
  };
}

const VenditoriPerformanceReport = () => {
  const [periodo, setPeriodo] = useState<PeriodoVendor>("mese");
  const [agentId, setAgentId] = useState("tutti");
  const [activeTab, setActiveTab] = useState("overview");

  const effectiveAgentId = agentId === "tutti" ? undefined : agentId;
  const { data: kpiList = [], isLoading } = useVendorKPI(periodo, effectiveAgentId);
  const { data: trend = [] } = useVendorTrend(new Date().getFullYear(), effectiveAgentId);
  const { data: funnel = [] } = useVendorFunnel(periodo, effectiveAgentId);

  const kpiSelected = agentId !== "tutti"
    ? kpiList.find(k => k.agent_id === agentId) ?? null
    : aggregateTeamKPI(kpiList);

  const agenti = kpiList.map(k => ({ id: k.agent_id, nome: k.nome_agente }));

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
              <Select value={periodo} onValueChange={v => setPeriodo(v as PeriodoVendor)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODI.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <KPISection kpi={kpiSelected} isLoading={isLoading} />

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

        <TabsContent value="ranking" className="mt-4">
          <VenditoriRanking kpiList={kpiList} isLoading={isLoading} />

        <TabsContent value="trend" className="mt-4">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <TrendingUp className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="font-medium text-muted-foreground">Trend Temporale</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">In arrivo con VENDOR-REP-03</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default VenditoriPerformanceReport;
