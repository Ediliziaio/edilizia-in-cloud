import { LayoutDashboard, Download, RefreshCw, AlertCircle, BarChart3, Phone, Users, Radio, TrendingUp, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMarketingDashboard } from "@/hooks/useMarketingDashboard";
import { useDashboardLayout, type DashboardTab } from "@/hooks/useDashboardLayout";
import { SalesTargetsDialog } from "@/components/marketing/dashboard/SalesTargetsDialog";
import { DashboardFilters } from "@/components/marketing/dashboard/DashboardFilters";
import { AlertBanner } from "@/components/marketing/dashboard/AlertBanner";
import { DashboardCustomizePanel } from "@/components/marketing/dashboard/DashboardCustomizePanel";
import { TabPanoramica } from "@/components/marketing/dashboard/tabs/TabPanoramica";
import { TabPipeline } from "@/components/marketing/dashboard/tabs/TabPipeline";
import { TabAttivita } from "@/components/marketing/dashboard/tabs/TabAttivita";
import { TabTeam } from "@/components/marketing/dashboard/tabs/TabTeam";
import { TabFonti } from "@/components/marketing/dashboard/tabs/TabFonti";
import { TabTrend } from "@/components/marketing/dashboard/tabs/TabTrend";
import { TabCommerciale } from "@/components/marketing/dashboard/tabs/TabCommerciale";
import { exportToCSV } from "@/lib/csvExport";
import { useAuth } from "@/contexts/AuthContext";
import { ApiHealthBanner } from "@/components/marketing/ApiHealthBanner";
import { useMetaLeadNotifications } from "@/hooks/useMetaLeadNotifications";
import { SedeFilterBar } from "@/components/sedi/SedeFilterBar";
import { LeadPerSedeChart } from "@/components/sedi/LeadPerSedeChart";
import { useSediList } from "@/hooks/useSediAnalytics";
import { SemaforoMarketing } from "@/components/marketing/dashboard/SemaforoMarketing";
import { SaluteCommerciale } from "@/components/marketing/dashboard/SaluteCommerciale";
import { AzioniCommerciali } from "@/components/marketing/dashboard/AzioniCommerciali";
import { DashboardSelectorBar } from "@/components/dashboard/DashboardSelectorBar";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";

const TAB_ICONS: Record<DashboardTab, React.ElementType> = {
  panoramica: LayoutDashboard,
  pipeline: BarChart3,
  attivita: Phone,
  team: Users,
  fonti: Radio,
  trend: TrendingUp,
  commerciale: Target,
};

// Componente interno: mostra SedeFilterBar + LeadPerSedeChart solo se ci sono sedi
function SedeFilterBarMarketing() {
  const { data: sedi = [] } = useSediList();
  if (sedi.length === 0) return null;
  return (
    <div className="space-y-3 rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm font-semibold text-[#1E3A5F]">Analytics per Sede</span>
        <SedeFilterBar />
      </div>
      <LeadPerSedeChart />
    </div>
  );
}

export default function MarketingDashboard() {
  const { data, isLoading, error, refetch, filters, updateFilters, permissions } = useMarketingDashboard();
  const { activeTab, switchTab, tabs, visibleTabs, toggleTabVisibility } = useDashboardLayout();
  const { effectiveCompany } = useAuth();
  useMetaLeadNotifications();
  const { isScopriPlan } = useSubscriptionLimits();

  if (isScopriPlan) return <UpgradeScopriWall type="crm_pipeline" inline />;

  if (!effectiveCompany?.id) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <LayoutDashboard className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h2 className="text-lg font-semibold text-muted-foreground">Nessuna azienda selezionata</h2>
        <p className="text-sm text-muted-foreground/70 mt-1">Seleziona un'azienda per visualizzare la dashboard</p>
      </div>
    );
  }

  const handleExportKPI = () => {
    if (!data?.kpi) return;
    const kpi = data.kpi;
    const rows = [
      { metrica: "Lead Totali", valore: String(kpi.leads_total) },
      { metrica: "Nuovi Lead", valore: String(kpi.leads_new) },
      { metrica: "Lavorati", valore: String(kpi.contacts_worked) },
      { metrica: "App. Fissati", valore: String(kpi.appointments_set) },
      { metrica: "App. Svolti", valore: String(kpi.appointments_done) },
      { metrica: "Show Rate", valore: `${kpi.show_rate}%` },
      { metrica: "Contratti Vinti", valore: String(kpi.contracts_won) },
      { metrica: "Fatturato", valore: String(kpi.revenue) },
      { metrica: "Ticket Medio", valore: String(kpi.avg_ticket) },
      { metrica: "Tasso Chiusura", valore: `${kpi.close_rate}%` },
    ];
    exportToCSV(rows, [{ key: "metrica", label: "Metrica" }, { key: "valore", label: "Valore" }], "dashboard-marketing-kpi.csv");
  };

  // Ensure activeTab is in visibleTabs
  const effectiveTab = visibleTabs.some(t => t.id === activeTab) ? activeTab : visibleTabs[0]?.id || "panoramica";

  return (
    <div className="space-y-3">
      <DashboardSelectorBar title="Dashboard Marketing" />

      <ApiHealthBanner filter={["meta", "email_marketing"]} />

      {/* Alert Banner */}
      <AlertBanner alerts={data?.alerts} isLoading={isLoading} />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 bg-gradient-to-br from-white via-white to-blue-50/80 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-3 sm:gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg shadow-orange-500/20">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1e3a5f]">Regia commerciale</p>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Vista mese</span>
              </div>
              <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">Marketing & Vendite</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                Lead, pipeline, appuntamenti e conversioni in una vista unica. Prima guarda lo stato commerciale, poi passa alle azioni operative.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {permissions.isAdmin && <SalesTargetsDialog />}
            <DashboardCustomizePanel tabs={tabs} onToggle={toggleTabVisibility} />
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Aggiorna</span>
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleExportKPI} disabled={!data?.kpi}>
              <Download className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Esporta</span>
            </Button>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50/70 p-3 sm:p-4">
          <DashboardFilters filters={filters} onUpdate={updateFilters} hideUserFilter={permissions.onlyAssigned} compact />
        </div>

        {data?.kpi && (
          <div className="border-t border-slate-200 p-3 sm:p-4">
            <SemaforoMarketing
              leadsTotal={data.kpi.leads_total}
              leadsNew={data.kpi.leads_new}
              staleLeads={data.alerts?.stale_leads ?? 0}
              pipelineValue={data.kpi.pipeline_active_value ?? 0}
              pipelineDeclining={data.alerts?.pipeline_declining ?? false}
              showRate={data.kpi.show_rate}
              closeRate={data.kpi.close_rate}
              contractsWon={data.kpi.contracts_won}
            />
          </div>
        )}
      </section>

      {/* ═══ SALUTE COMMERCIALE + AZIONI DA FARE ═══ */}
      {data?.kpi && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4">
          <div className="lg:col-span-2">
            <SaluteCommerciale
              leadsNew={data.kpi.leads_new}
              staleLeads={data.alerts?.stale_leads ?? 0}
              showRate={data.kpi.show_rate}
              closeRate={data.kpi.close_rate}
              pipelineValue={data.kpi.pipeline_active_value ?? 0}
              pipelineDeclining={data.alerts?.pipeline_declining ?? false}
              revenue={data.kpi.revenue}
              contractsWon={data.kpi.contracts_won}
              appointmentsDone={data.kpi.appointments_done}
              appointmentsSet={data.kpi.appointments_set}
              isLoading={isLoading}
            />
          </div>
          <div className="lg:col-span-3">
            <AzioniCommerciali
              staleLeads={data.alerts?.stale_leads ?? 0}
              staleLeads2h={data.alerts?.stale_leads_2h ?? 0}
              showRate={data.kpi.show_rate}
              showRateBelowThreshold={data.alerts?.show_rate_below_threshold ?? false}
              pipelineDeclining={data.alerts?.pipeline_declining ?? false}
              pipelineValue={data.kpi.pipeline_active_value ?? 0}
              pendingAppointments={data.alerts?.pending_appointments ?? 0}
              staleOpportunities={data.alerts?.stale_opportunities ?? 0}
              contractsWon={data.kpi.contracts_won}
              contractsLost={data.kpi.contracts_lost}
              closeRate={data.kpi.close_rate}
            />
          </div>
        </div>
      )}

      {/* ── Filtro Sedi + Lead per Sede ─────────────────────── */}
      <SedeFilterBarMarketing />

      {/* Error State */}
      {error && !isLoading && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-4 py-4">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Errore nel caricamento dei dati</p>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Riprova
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={effectiveTab} onValueChange={(v) => switchTab(v as DashboardTab)}>
        <TabsList className="h-9 w-full overflow-x-auto flex-nowrap justify-start">
          {visibleTabs.map(tab => {
            const Icon = TAB_ICONS[tab.id];
            return (
              <TabsTrigger key={tab.id} value={tab.id} className="text-xs gap-1.5 px-2.5 shrink-0">
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.length > 6 ? tab.label.slice(0, 5) + "." : tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="panoramica">
          <TabPanoramica data={data} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="pipeline">
          <TabPipeline data={data} isLoading={isLoading} filters={filters} onUpdateFilters={updateFilters} />
        </TabsContent>
        <TabsContent value="attivita">
          <TabAttivita data={data} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="team">
          <TabTeam data={data} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="fonti">
          <TabFonti data={data} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="trend">
          <TabTrend data={data} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="commerciale">
          <TabCommerciale />
        </TabsContent>
      </Tabs>
    </div>
  );
}
