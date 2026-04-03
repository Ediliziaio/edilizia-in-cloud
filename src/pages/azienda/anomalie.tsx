import { useState } from "react";
import { AlertTriangle, Filter } from "lucide-react";
import { AnomaliesFilterSidebar } from "@/components/AnomaliesFilterSidebar";
import { AnomaliesKPIDashboard } from "@/components/AnomaliesKPIDashboard";
import { AnomaliesChart } from "@/components/AnomaliesChart";
import { AnomaliesTable } from "@/components/AnomaliesTable";
import { useAnomalies } from "@/hooks/useAnomalies";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { INITIAL_ANOMALY_FILTER_STATE } from "@/components/AnomaliesFilterSidebar";

const TABS = [
  { id: "all", label: "Tutte" },
  { id: "dati", label: "Dati" },
  { id: "fatturazione", label: "Fatturazione" },
  { id: "integrazioni", label: "Integrazioni" },
  { id: "workflow", label: "Workflow" },
];

export default function AnomaliePage() {
  const {
    filters,
    setFilters,
    anomalies,
    isLoading,
    anomaliesCount,
    kpiData,
    chartData,
    sortBy,
    sortDirection,
    handleSort,
  } = useAnomalies();

  const [selectedAnomalies, setSelectedAnomalies] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("all");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Tab filter (sovrascrive il filtro type quando cambia tab)
  const tabFilteredAnomalies =
    activeTab === "all"
      ? anomalies
      : anomalies.filter((a) => a.type === activeTab);

  const activeFilterCount = [
    filters.date_from,
    filters.date_to,
    filters.priority !== "all" ? filters.priority : undefined,
    filters.status !== "all" ? filters.status : undefined,
    filters.type !== "all" ? filters.type : undefined,
    filters.order_number,
    filters.impact_min !== undefined ? filters.impact_min : undefined,
    filters.impact_max !== undefined ? filters.impact_max : undefined,
    ...filters.assigned_to_ids,
    ...filters.client_ids,
  ].filter(Boolean).length;

  return (
    <div className="flex h-full bg-gray-50">
      {/* ── Sidebar filtri desktop ────────────────────────────── */}
      <AnomaliesFilterSidebar
        filters={filters}
        onFiltersChange={setFilters}
        teamMembers={[]}
        clienti={[]}
        anomaliesCount={anomaliesCount}
      />

      {/* ── Contenuto principale ────────────────────────���────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-6 py-4 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Anomalie e Errori
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Gestisci e traccia tutte le anomalie su ordini, appuntamenti e fatture
              </p>
            </div>

            {/* Filtri mobile */}
            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="lg:hidden flex items-center gap-1.5 text-xs"
                >
                  <Filter className="h-3.5 w-3.5" />
                  Filtri
                  {activeFilterCount > 0 && (
                    <span className="bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-80">
                <AnomaliesFilterSidebar
                  filters={filters}
                  onFiltersChange={(f) => { setFilters(f); setMobileFiltersOpen(false); }}
                  teamMembers={[]}
                  clienti={[]}
                  anomaliesCount={anomaliesCount}
                />
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* KPI Dashboard */}
          <AnomaliesKPIDashboard data={kpiData} isLoading={isLoading} />

          {/* Chart */}
          <AnomaliesChart data={chartData} isLoading={isLoading} />

          {/* Tabs */}
          <div className="bg-white rounded-lg border border-gray-200">
            {/* Tab bar */}
            <div className="flex gap-1 px-4 pt-3 border-b border-gray-100 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors shrink-0 ${
                    activeTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {tab.label}
                  {tab.id !== "all" && (
                    <span className="ml-1.5 text-xs text-gray-400">
                      ({anomalies.filter((a) => a.type === tab.id).length})
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Bulk actions */}
            {selectedAnomalies.size > 0 && (
              <div className="mx-4 mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200 flex items-center justify-between flex-wrap gap-2">
                <span className="text-sm font-semibold text-blue-900">
                  {selectedAnomalies.size} anomali{selectedAnomalies.size === 1 ? "a" : "e"} selezionat{selectedAnomalies.size === 1 ? "a" : "e"}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedAnomalies(new Set())}
                    className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-xs"
                  >
                    Deseleziona
                  </button>
                  <button className="px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 text-xs font-semibold">
                    Segna come risolte
                  </button>
                  <button className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-xs">
                    Esporta CSV
                  </button>
                </div>
              </div>
            )}

            {/* Tabella */}
            <div className="p-4 pt-3">
              <AnomaliesTable
                anomalies={tabFilteredAnomalies}
                isLoading={isLoading}
                sortBy={sortBy}
                sortDirection={sortDirection}
                onSort={handleSort}
                selectedAnomalies={selectedAnomalies}
                onSelectionChange={setSelectedAnomalies}
                onSelectAnomaly={(id) => {
                  // Apri drawer dettaglio — Sprint 2
                  handleSelectOne(id);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  function handleSelectOne(id: string) {
    setSelectedAnomalies((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
}

// Named export for lazy import compatibility
export { AnomaliePage };
