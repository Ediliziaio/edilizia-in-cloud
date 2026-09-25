/**
 * Controllo di Gestione — pagina principale del modulo MP-CG-05.
 *
 * Tab principali (dashboard-first):
 *  - Dashboard sintetica (KPI + alert)
 *  - CE riclassificato + BEP
 *  - Stato Patrimoniale riclassificato
 *  - Cash Flow Mensile Prospettico
 *  - PFN & Debiti (mutui MLT + aging)
 *  - Commesse (marginalità per cantiere)
 *  - Budget vs Consuntivo + Forecast
 *  - Indici Avanzati (DSO/DPO/DSI + Altman + DSCR + IRES/IRAP)
 *  - Health-check Dati + Riconciliazione commercialista
 *  - Piano industriale (proiezioni 3/5/7 anni)
 *  - Rating bancario
 *  - Pacchetto banca (export PDF)
 *  - Configurazione (classificazione voci + note + aliquote)
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
import { TabCashFlow } from "@/components/controllo-gestione/tabs/TabCashFlow";
import { TabPFNDebiti } from "@/components/controllo-gestione/tabs/TabPFNDebiti";
import { TabCommesse } from "@/components/controllo-gestione/tabs/TabCommesse";
import { TabProdotti } from "@/components/controllo-gestione/tabs/TabProdotti";
import { TabBudget } from "@/components/controllo-gestione/tabs/TabBudget";
import { TabIndiciAvanzati } from "@/components/controllo-gestione/tabs/TabIndiciAvanzati";
import { TabDashboard } from "@/components/controllo-gestione/tabs/TabDashboard";
import { TabHealthCheck } from "@/components/controllo-gestione/tabs/TabHealthCheck";
import { useIsMobile } from "@/hooks/use-mobile";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Su telefono tre schede su quattordici: il riepilogo, la cassa e le commesse
 * si leggono a colpo d'occhio; bilanci riclassificati, indici, rating, piano
 * industriale, pacchetto per la banca (un PDF) e configurazione sono lavoro
 * da scrivania. Un indirizzo diretto a un'altra scheda apre il riepilogo.
 */
const TAB_MOBILE: CGTab[] = ["dash", "cashflow", "commesse"];

type CGTab =
  | "dash" | "ce" | "sp" | "cashflow" | "pfn" | "commesse" | "prodotti"
  | "budget" | "indici" | "health" | "piano" | "rating" | "pdf" | "config";

// Mappa segmento URL → tab. Usata per il deep-link dalla sidebar
// (es. /azienda/controllo-gestione/rating → tab "rating").
const URL_TO_TAB: Record<string, CGTab> = {
  dashboard: "dash",
  ce: "ce",
  sp: "sp",
  "cash-flow": "cashflow",
  "pfn-debiti": "pfn",
  commesse: "commesse",
  prodotti: "prodotti",
  budget: "budget",
  indici: "indici",
  health: "health",
  piano: "piano",
  rating: "rating",
  "pacchetto-banca": "pdf",
  configurazione: "config",
};
/**
 * Da tablet le schede sono quattordici e a 1440 uscivano dalla riga
 * («Health-check» tagliata, le ultime cinque solo scorrendo di lato). Quelle
 * che non ci stanno finiscono in «Altro». `vis` dice da che larghezza la
 * scheda sta nella riga; "menu" = sempre in «Altro».
 */
type VisScheda = "sempre" | "xl" | "2xl" | "menu";
const SCHEDE_DESKTOP: { tab: CGTab; label: string; vis: VisScheda }[] = [
  { tab: "dash", label: "Dashboard", vis: "sempre" },
  { tab: "ce", label: "CE riclassificato", vis: "sempre" },
  { tab: "sp", label: "Stato patrimoniale", vis: "xl" },
  { tab: "cashflow", label: "Cash Flow", vis: "sempre" },
  { tab: "pfn", label: "PFN & Debiti", vis: "2xl" },
  { tab: "commesse", label: "Commesse", vis: "sempre" },
  { tab: "prodotti", label: "Prodotti & Categorie", vis: "menu" },
  { tab: "budget", label: "Budget", vis: "xl" },
  { tab: "indici", label: "Indici avanzati", vis: "menu" },
  { tab: "health", label: "Health-check", vis: "menu" },
  { tab: "piano", label: "Piano industriale", vis: "menu" },
  { tab: "rating", label: "Rating bancario", vis: "menu" },
  { tab: "pdf", label: "Pacchetto banca", vis: "menu" },
  { tab: "config", label: "Configurazione", vis: "menu" },
];
const CLASSE_SCHEDA: Record<VisScheda, string> = { sempre: "", xl: "hidden xl:inline-flex", "2xl": "hidden 2xl:inline-flex", menu: "hidden" };
const CLASSE_VOCE_ALTRO: Record<VisScheda, string> = { sempre: "hidden", xl: "xl:hidden", "2xl": "2xl:hidden", menu: "" };

const TAB_TO_URL: Record<CGTab, string> = {
  dash: "dashboard",
  ce: "ce",
  sp: "sp",
  cashflow: "cash-flow",
  pfn: "pfn-debiti",
  commesse: "commesse",
  prodotti: "prodotti",
  budget: "budget",
  indici: "indici",
  health: "health",
  piano: "piano",
  rating: "rating",
  pdf: "pacchetto-banca",
  config: "configurazione",
};

export default function ControlloGestione() {
  const permissions = usePermissions();
  const { isFeatureEnabled, isLoading: flagsLoading } = useFeatureFlags();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Tab attiva derivata dall'URL (deep-link friendly)
  const tabFromUrl: CGTab = useMemo(() => {
    const seg = location.pathname.split("/").filter(Boolean).pop();
    if (!seg || seg === "controllo-gestione") return "dash";
    return URL_TO_TAB[seg] ?? "dash";
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

  const tabVisibile: CGTab = isMobile && !TAB_MOBILE.includes(activeTab) ? "dash" : activeTab;
  const anniDisponibili = [0, 1, 2, 3].map((d) => new Date().getFullYear() - 2 + d);
  // «Altro» si accende (e prende il nome della scheda) quando la scheda aperta
  // è fra quelle che a questa larghezza stanno nel menu.
  const schedaAttiva = SCHEDE_DESKTOP.find((s) => s.tab === tabVisibile);
  const fasciaAttiva: VisScheda = schedaAttiva?.vis ?? "sempre";

  return (
    <div className="flex flex-col h-full">
      {isMobile ? (
      <DashboardSelectorBar
        title="Controllo gestione"
        // Mobile: l'anno sta sulla riga del titolo invece di una riga sua.
        actions={
          <Select value={String(filters.anno)} onValueChange={(v) => setFilters({ ...filters, anno: Number(v) })}>
            <SelectTrigger className="h-8 w-[84px] text-xs" aria-label="Anno"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anniDisponibili.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />
      ) : (
        // Da tablet: titolo vero come nelle altre pagine e filtri sulla stessa
        // riga, invece di tre fasce una sotto l'altra (barra, filtri, schede).
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-3">
          <DashboardSelectorBar title="Controllo di Gestione" soloSelettore />
          {/* mr-auto e non flex-1+truncate: se i filtri non ci stanno vanno a
              capo loro, il titolo non si taglia («Controllo di Ges…»). */}
          <h1 className="mr-auto whitespace-nowrap text-2xl font-bold tracking-tight text-slate-900">Controllo di Gestione</h1>
          <FilterBar
            value={filters}
            onChange={setFilters}
            showScenario={activeTab === "piano"}
            // Periodo/Mese oggi li consuma solo il CE riclassificato: altrove erano
            // controlli morti. Li mostriamo solo dove filtrano davvero.
            showPeriodo={activeTab === "ce"}
          />
        </div>
      )}

      <Tabs
        value={tabVisibile}
        onValueChange={handleTabChange}
        className="flex-1 overflow-y-auto"
      >
        <div className={isMobile ? "px-3 sm:px-4 pt-3 sticky top-0 z-10 bg-background border-b" : "pb-4"}>
          {/* Mobile: scroll orizzontale con min-w sui trigger per evitare
              overlap del testo. Desktop: layout flex naturale. */}
          {isMobile ? (
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="dash">Riepilogo</TabsTrigger>
              <TabsTrigger value="cashflow">Cassa</TabsTrigger>
              <TabsTrigger value="commesse">Commesse</TabsTrigger>
            </TabsList>
          ) : (
          <TabsList className="max-w-full justify-start gap-1">
            {SCHEDE_DESKTOP.filter((s) => s.vis !== "menu").map((s) => (
              <TabsTrigger key={s.tab} value={s.tab} className={CLASSE_SCHEDA[s.vis]}>{s.label}</TabsTrigger>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    fasciaAttiva === "menu" && "bg-background text-foreground shadow-sm",
                    fasciaAttiva === "xl" && "max-xl:bg-background max-xl:text-foreground max-xl:shadow-sm",
                    fasciaAttiva === "2xl" && "max-2xl:bg-background max-2xl:text-foreground max-2xl:shadow-sm",
                  )}
                >
                  {fasciaAttiva === "menu" ? schedaAttiva?.label
                    : fasciaAttiva === "xl" ? (<><span className="xl:hidden">{schedaAttiva?.label}</span><span className="hidden xl:inline">Altro</span></>)
                    : fasciaAttiva === "2xl" ? (<><span className="2xl:hidden">{schedaAttiva?.label}</span><span className="hidden 2xl:inline">Altro</span></>)
                    : "Altro"}
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[200px]">
                {SCHEDE_DESKTOP.filter((s) => s.vis !== "sempre").map((s) => (
                  <DropdownMenuItem
                    key={s.tab}
                    className={cn(CLASSE_VOCE_ALTRO[s.vis], s.tab === tabVisibile && "font-semibold text-foreground")}
                    onSelect={() => handleTabChange(s.tab)}
                  >
                    {s.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </TabsList>
          )}
        </div>

        {/* Da tablet il margine lo dà il layout: niente p-4 in più. */}
        <div className={isMobile ? "p-3 sm:p-4" : undefined}>
          <TabsContent value="dash" className="mt-0">
            <TabDashboard anno={filters.anno} />
          </TabsContent>
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
          <TabsContent value="cashflow" className="mt-0">
            <TabCashFlow anno={filters.anno} />
          </TabsContent>
          <TabsContent value="pfn" className="mt-0">
            <TabPFNDebiti anno={filters.anno} />
          </TabsContent>
          <TabsContent value="commesse" className="mt-0">
            <TabCommesse anno={filters.anno} />
          </TabsContent>
          <TabsContent value="prodotti" className="mt-0">
            <TabProdotti anno={filters.anno} />
          </TabsContent>
          <TabsContent value="budget" className="mt-0">
            <TabBudget anno={filters.anno} />
          </TabsContent>
          <TabsContent value="indici" className="mt-0">
            <TabIndiciAvanzati anno={filters.anno} />
          </TabsContent>
          <TabsContent value="health" className="mt-0">
            <TabHealthCheck anno={filters.anno} />
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
            <TabConfigurazione anno={filters.anno} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
