import { LayoutDashboard, Download, RefreshCw, AlertCircle, BarChart3, Phone, Users, Radio, TrendingUp } from "lucide-react";
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
import { exportToCSV } from "@/lib/csvExport";
import { useAuth } from "@/contexts/AuthContext";
import { ApiHealthBanner } from "@/components/marketing/ApiHealthBanner";
import { useMetaLeadNotifications } from "@/hooks/useMetaLeadNotifications";

const TAB_ICONS: Record<DashboardTab, React.ElementType> = {
  panoramica: LayoutDashboard,
  pipeline: BarChart3,
  attivita: Phone,
  team: Users,
  fonti: Radio,
  trend: TrendingUp,
};

export default function MarketingDashboard() {
  const { data, isLoading, error, refetch, filters, updateFilters, permissions } = useMarketingDashboard();
  const { activeTab, switchTab, tabs, visibleTabs, toggleTabVisibility } = useDashboardLayout();
  const { effectiveCompany } = useAuth();
  useMetaLeadNotifications();

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
      <ApiHealthBanner filter={["meta", "email"]} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5" />
            Dashboard Marketing & Vendite
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {permissions.isAdmin && <SalesTargetsDialog />}
          <DashboardCustomizePanel tabs={tabs} onToggle={toggleTabVisibility} />
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Aggiorna
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleExportKPI} disabled={!data?.kpi}>
            <Download className="h-3.5 w-3.5 mr-1" />
            Esporta
          </Button>
        </div>
      </div>

      {/* Alert Banner */}
      <AlertBanner alerts={data?.alerts} isLoading={isLoading} />

      {/* Filters */}
      <DashboardFilters filters={filters} onUpdate={updateFilters} hideUserFilter={permissions.onlyAssigned} compact />

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
        <TabsList className="h-9">
          {visibleTabs.map(tab => {
            const Icon = TAB_ICONS[tab.id];
            return (
              <TabsTrigger key={tab.id} value={tab.id} className="text-xs gap-1.5 px-3">
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
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
      </Tabs>
    </div>
  );
}
