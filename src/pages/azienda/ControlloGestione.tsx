/**
 * Controllo di Gestione — pagina principale del modulo MP-CG-05.
 *
 * Tab principali:
 *  - CE riclassificato + BEP
 *  - Stato Patrimoniale riclassificato
 *  - Piano industriale (proiezioni 3/5/7 anni)
 *  - Rating bancario
 *  - Pacchetto banca (export PDF)
 *
 * Gating:
 *  - permessi: canViewControlloGestione
 *  - feature flag: controllo_gestione_v1
 */
import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardSelectorBar } from "@/components/dashboard/DashboardSelectorBar";
import { usePermissions } from "@/hooks/usePermissions";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { FilterBar, type CGFilters } from "@/components/controllo-gestione/FilterBar";
import { AddonNotActivePlaceholder } from "@/components/controllo-gestione/AddonNotActivePlaceholder";
import { TabCERiclassificato } from "@/components/controllo-gestione/tabs/TabCERiclassificato";
import { TabStatoPatrimoniale } from "@/components/controllo-gestione/tabs/TabStatoPatrimoniale";
import { TabPianoIndustriale } from "@/components/controllo-gestione/tabs/TabPianoIndustriale";
import { TabRatingBancario } from "@/components/controllo-gestione/tabs/TabRatingBancario";
import { TabPacchettoBanca } from "@/components/controllo-gestione/tabs/TabPacchettoBanca";
import { TabConfigurazione } from "@/components/controllo-gestione/tabs/TabConfigurazione";

type CGTab = "ce" | "sp" | "piano" | "rating" | "pdf" | "config";

// Mappa segmento URL → tab. Usata per il deep-link dalla sidebar
// (es. /azienda/controllo-gestione/rating → tab "rating").
const URL_TO_TAB: Record<string, CGTab> = {
  ce: "ce",
  sp: "sp",
  piano: "piano",
  rating: "rating",
  "pacchetto-banca": "pdf",
  configurazione: "config",
};
const TAB_TO_URL: Record<CGTab, string> = {
  ce: "ce", sp: "sp", piano: "piano", rating: "rating", pdf: "pacchetto-banca", config: "configurazione",
};

export default function ControlloGestione() {
  const permissions = usePermissions();
  const { isFeatureEnabled, isLoading: flagsLoading } = useFeatureFlags();
  const location = useLocation();
  const navigate = useNavigate();

  // Tab attiva derivata dall'URL (deep-link friendly)
  const tabFromUrl: CGTab = useMemo(() => {
    const seg = location.pathname.split("/").filter(Boolean).pop();
    if (!seg || seg === "controllo-gestione") return "ce";
    return URL_TO_TAB[seg] ?? "ce";
  }, [location.pathname]);
  const [activeTab, setActiveTab] = useState<CGTab>(tabFromUrl);
  // Sincronizza tab attivo con URL (back/forward o deep-link da sidebar).
  // P1.2 — era useMemo, anti-pattern: setState dentro useMemo causa loop e
  // tab attivo "saltellante" nel DOM. useEffect è il posto giusto.
  useEffect(() => {
    if (tabFromUrl !== activeTab) setActiveTab(tabFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFromUrl]);
  const handleTabChange = (v: string) => {
    const tab = v as CGTab;
    setActiveTab(tab);
    navigate(`/azienda/controllo-gestione/${TAB_TO_URL[tab]}`);
  };

  const [filters, setFilters] = useState<CGFilters>(() => {
    const oggi = new Date();
    return {
      anno: oggi.getFullYear(),
      periodo: "annuale",
      mese: oggi.getMonth() + 1,
      scenarioId: null,
    };
  });

  const periodoRange = useMemo(() => {
    if (filters.periodo === "annuale") return { meseDa: 1, meseA: 12 };
    if (filters.periodo === "ytd") return { meseDa: 1, meseA: filters.mese };
    return { meseDa: filters.mese, meseA: filters.mese };
  }, [filters.periodo, filters.mese]);

  if (permissions.isLoading) return null;
  if (!permissions.canViewControlloGestione) {
    return <Navigate to="/azienda" replace />;
  }

  if (flagsLoading) return null;
  if (!isFeatureEnabled("controllo_gestione_v1")) {
    return (
      <div className="flex flex-col h-full">
        <DashboardSelectorBar title="Controllo di Gestione" />
        <AddonNotActivePlaceholder />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <DashboardSelectorBar title="Controllo di Gestione" />
      <FilterBar
        value={filters}
        onChange={setFilters}
        showScenario={activeTab === "piano"}
      />

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex-1 overflow-y-auto"
      >
        <div className="px-3 sm:px-4 pt-3 sticky top-0 z-10 bg-background border-b">
          {/* Mobile: scroll orizzontale con min-w sui trigger per evitare
              overlap del testo. Desktop: layout flex naturale. */}
          <TabsList className="w-full sm:w-auto overflow-x-auto flex-nowrap justify-start gap-1 [&>button]:min-w-[8rem] sm:[&>button]:min-w-0 [&>button]:shrink-0">
            <TabsTrigger value="ce">CE riclassificato</TabsTrigger>
            <TabsTrigger value="sp">Stato patrimoniale</TabsTrigger>
            <TabsTrigger value="piano">Piano industriale</TabsTrigger>
            <TabsTrigger value="rating">Rating bancario</TabsTrigger>
            <TabsTrigger value="pdf">Pacchetto banca</TabsTrigger>
            <TabsTrigger value="config">Configurazione</TabsTrigger>
          </TabsList>
        </div>

        <div className="p-3 sm:p-4">
          <TabsContent value="ce" className="mt-0">
            <TabCERiclassificato
              anno={filters.anno}
              meseDa={periodoRange.meseDa}
              meseA={periodoRange.meseA}
            />
          </TabsContent>
          <TabsContent value="sp" className="mt-0">
            <TabStatoPatrimoniale anno={filters.anno} />
          </TabsContent>
          <TabsContent value="piano" className="mt-0">
            <TabPianoIndustriale scenarioId={filters.scenarioId} />
          </TabsContent>
          <TabsContent value="rating" className="mt-0">
            <TabRatingBancario anno={filters.anno} />
          </TabsContent>
          <TabsContent value="pdf" className="mt-0">
            <TabPacchettoBanca anno={filters.anno} />
          </TabsContent>
          <TabsContent value="config" className="mt-0">
            <TabConfigurazione />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
