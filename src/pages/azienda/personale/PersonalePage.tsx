import { lazy, Suspense, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Clock, CalendarDays, FileText, MapPin, CalendarCheck, Network, Receipt, Navigation, FolderOpen, LayoutDashboard, BrainCircuit, UserRoundSearch } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
// 2026-05-27 (perf fix P0): tab lazy-loaded.
// PRIMA: 12 tab import statici → chunk PersonalePage 559KB (talent-profile,
// charts, calendari, GPS, ecc. tutti caricati anche se l'utente apre solo
// "Timbrature"). Stima riduzione chunk iniziale: 559KB → ~80KB + chunk
// on-demand per il tab cliccato.
const TabRegiaHr = lazy(() => import("./tabs/TabRegiaHr").then(m => ({ default: m.TabRegiaHr })));
const TabOrganigramma = lazy(() => import("./tabs/TabOrganigramma").then(m => ({ default: m.TabOrganigramma })));
const TabTimbrature = lazy(() => import("./tabs/TabTimbrature").then(m => ({ default: m.TabTimbrature })));
const TabPresenze = lazy(() => import("./tabs/TabPresenze").then(m => ({ default: m.TabPresenze })));
const TabRichieste = lazy(() => import("./tabs/TabRichieste").then(m => ({ default: m.TabRichieste })));
const TabSedi = lazy(() => import("./tabs/TabSedi").then(m => ({ default: m.TabSedi })));
const TabFestivita = lazy(() => import("./tabs/TabFestivita").then(m => ({ default: m.TabFestivita })));
const TabProfili = lazy(() => import("./tabs/TabProfili").then(m => ({ default: m.TabProfili })));
const TabCedolini = lazy(() => import("./tabs/TabCedolini").then(m => ({ default: m.TabCedolini })));
const TabGpsPercorsi = lazy(() => import("./tabs/TabGpsPercorsi").then(m => ({ default: m.TabGpsPercorsi })));
const TabDocumenti = lazy(() => import("./tabs/TabDocumenti").then(m => ({ default: m.TabDocumenti })));
const TabSelezioni = lazy(() => import("./tabs/TabSelezioni").then(m => ({ default: m.TabSelezioni })));
const TabCandidati = lazy(() => import("./tabs/TabCandidati").then(m => ({ default: m.TabCandidati })));
import { useFleetTrackAccess } from "@/hooks/useFleetTrackAccess";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useIsMobile } from "@/hooks/use-mobile";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";

function TabFallback() {
  return (
    <div className="space-y-3 py-2">
      <Skeleton className="h-9 w-2/3 max-w-xs" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  );
}

export default function PersonalePage() {
  const hasFleetTrack = useFleetTrackAccess();
  const { isScopriPlan } = useSubscriptionLimits();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();

  const availableTabs = useMemo(() => {
    const tabs = [
      "regia",
      "organigramma",
      "profili",
      "timbrature",
      "presenze",
      "richieste",
      "sedi",
      "festivita",
      "cedolini",
      "documenti",
      "candidati",
      "selezioni",
    ];
    if (hasFleetTrack) tabs.push("gps-percorsi");
    return tabs;
  }, [hasFleetTrack]);

  const rawTab = searchParams.get("tab");
  // Su mobile la tab di default è "timbrature" (operativa) invece di "regia"
  // (cruscotto HR-vetrina con 5 query e KPI): si atterra sull'azione utile.
  const defaultTab = isMobile ? "timbrature" : "regia";
  const activeTab = rawTab && availableTabs.includes(rawTab) ? rawTab : defaultTab;

  const handleTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "regia") next.delete("tab");
    else next.set("tab", value);
    setSearchParams(next);
  };

  if (isScopriPlan) return <UpgradeScopriWall type="hr_completo" inline />;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-200">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Personale & HR</h1>
            <p className="text-sm text-slate-600">Gestione presenze, ferie, timbrature e anagrafiche del personale.</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="flex flex-nowrap h-auto gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm w-full justify-start overflow-x-auto scrollbar-none">
          <TabsTrigger value="regia" className="gap-1.5 shrink-0 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <LayoutDashboard className="h-4 w-4" /> Regia HR
          </TabsTrigger>
          <TabsTrigger value="organigramma" className="gap-1.5 shrink-0 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <Network className="h-4 w-4" /> Organigramma
          </TabsTrigger>
          <TabsTrigger value="profili" className="gap-1.5 shrink-0 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <Users className="h-4 w-4" /> Profili
          </TabsTrigger>
          <TabsTrigger value="timbrature" className="gap-1.5 shrink-0 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <Clock className="h-4 w-4" /> Timbrature
          </TabsTrigger>
          <TabsTrigger value="presenze" className="gap-1.5 shrink-0 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <CalendarDays className="h-4 w-4" /> Presenze
          </TabsTrigger>
          <TabsTrigger value="richieste" className="gap-1.5 shrink-0 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <FileText className="h-4 w-4" /> Richieste
          </TabsTrigger>
          <TabsTrigger value="sedi" className="gap-1.5 shrink-0 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <MapPin className="h-4 w-4" /> Sedi
          </TabsTrigger>
          <TabsTrigger value="festivita" className="gap-1.5 shrink-0 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <CalendarCheck className="h-4 w-4" /> Festività
          </TabsTrigger>
          <TabsTrigger value="cedolini" className="gap-1.5 shrink-0 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <Receipt className="h-4 w-4" /> Cedolini
          </TabsTrigger>
          <TabsTrigger value="documenti" className="gap-1.5 shrink-0 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <FolderOpen className="h-4 w-4" /> Documenti
          </TabsTrigger>
          <TabsTrigger value="candidati" className="gap-1.5 shrink-0 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <UserRoundSearch className="h-4 w-4" /> Candidati
          </TabsTrigger>
          <TabsTrigger value="selezioni" className="gap-1.5 shrink-0 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <BrainCircuit className="h-4 w-4" /> Selezioni
          </TabsTrigger>
          {hasFleetTrack && (
            <TabsTrigger value="gps-percorsi" className="gap-1.5 shrink-0 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
              <Navigation className="h-4 w-4" /> GPS Percorsi
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="regia"><Suspense fallback={<TabFallback />}><TabRegiaHr onNavigate={handleTabChange} /></Suspense></TabsContent>
        <TabsContent value="organigramma"><Suspense fallback={<TabFallback />}><TabOrganigramma /></Suspense></TabsContent>
        <TabsContent value="profili"><Suspense fallback={<TabFallback />}><TabProfili /></Suspense></TabsContent>
        <TabsContent value="timbrature"><Suspense fallback={<TabFallback />}><TabTimbrature /></Suspense></TabsContent>
        <TabsContent value="presenze"><Suspense fallback={<TabFallback />}><TabPresenze /></Suspense></TabsContent>
        <TabsContent value="richieste"><Suspense fallback={<TabFallback />}><TabRichieste /></Suspense></TabsContent>
        <TabsContent value="sedi"><Suspense fallback={<TabFallback />}><TabSedi /></Suspense></TabsContent>
        <TabsContent value="festivita"><Suspense fallback={<TabFallback />}><TabFestivita /></Suspense></TabsContent>
        <TabsContent value="cedolini"><Suspense fallback={<TabFallback />}><TabCedolini /></Suspense></TabsContent>
        <TabsContent value="documenti"><Suspense fallback={<TabFallback />}><TabDocumenti /></Suspense></TabsContent>
        <TabsContent value="candidati"><Suspense fallback={<TabFallback />}><TabCandidati /></Suspense></TabsContent>
        <TabsContent value="selezioni"><Suspense fallback={<TabFallback />}><TabSelezioni /></Suspense></TabsContent>
        {hasFleetTrack && (
          <TabsContent value="gps-percorsi"><Suspense fallback={<TabFallback />}><TabGpsPercorsi /></Suspense></TabsContent>
        )}
      </Tabs>
    </div>
  );
}
