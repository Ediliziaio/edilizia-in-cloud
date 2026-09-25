import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import FacebookAdsReport from "@/components/reporting/facebook-ads/FacebookAdsReport";
import VenditoriPerformanceReport from "@/components/reporting/venditori/VenditoriPerformanceReport";
import CallCenterReport from "@/components/reporting/callcenter/CallCenterReport";
import GoogleAdsReport from "@/components/reporting/google-ads/GoogleAdsReport";
import { CrmSalesReportPanel } from "@/components/reporting/crm-sales/CrmSalesReportPanel";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

// `breve`: etichetta sul telefono. Meta e Google (report di campagna, grafici
// larghi) restano al computer: sul telefono le schede sono tre.
const TABS = [
  { key: "crm-vendite", label: "CRM e vendite", breve: "CRM" },
  { key: "calls", label: "Call center", breve: "Call center" },
  { key: "venditori", label: "Venditori", breve: "Venditori" },
  { key: "facebook-ads", label: "Meta Business Manager", soloComputer: true },
  { key: "google-ads", label: "Google Ads", soloComputer: true },
];

// Il tab di default è SEMPRE il primo dell'elenco sopra (oggi: CRM e vendite).
const DEFAULT_TAB = TABS[0].key;

const ReportisticaPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") || DEFAULT_TAB;
  const isValidRequestedTab = TABS.some((tab) => tab.key === requestedTab);
  const isMobile = useIsMobile();
  const schedaSoloComputer = TABS.find((tab) => tab.key === requestedTab)?.soloComputer;
  const activeTab = isValidRequestedTab && !(isMobile && schedaSoloComputer) ? requestedTab : DEFAULT_TAB;
  const { isScopriPlan } = useSubscriptionLimits();

  useEffect(() => {
    if (!isValidRequestedTab) {
      setSearchParams({ tab: DEFAULT_TAB }, { replace: true });
    }
  }, [isValidRequestedTab, setSearchParams]);

  if (isScopriPlan) return <UpgradeScopriWall type="report" inline />;

  return (
    <div className="space-y-6 max-sm:space-y-3">
      {/* Solo il titolo, senza riquadro, icona né spiegazione: come sul
          telefono (la spiegazione elencava le linguette subito sotto). */}
      <div>
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 max-sm:text-lg">
              Reportistica<span className="max-sm:hidden"> marketing e vendite</span>
            </h1>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v })}>
        <TabsList className="flex flex-wrap h-auto gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm max-sm:w-full max-sm:flex-nowrap max-sm:rounded-xl max-sm:p-1 max-sm:shadow-none">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.key}
              value={t.key}
              className={cn(
                "text-xs data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 sm:text-sm max-sm:flex-1 max-sm:text-[13px]",
                t.soloComputer && "max-sm:hidden",
              )}
            >
              {t.breve ? (
                <>
                  <span className="max-sm:hidden">{t.label}</span>
                  <span className="sm:hidden">{t.breve}</span>
                </>
              ) : (
                t.label
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="facebook-ads" className="mt-6">
          <FacebookAdsReport />
        </TabsContent>

        <TabsContent value="google-ads" className="mt-6">
          <GoogleAdsReport />
        </TabsContent>

        <TabsContent value="crm-vendite" className="mt-6 max-sm:mt-3">
          <CrmSalesReportPanel daysBack={180} />
        </TabsContent>

        <TabsContent value="venditori" className="mt-6 max-sm:mt-3">
          <VenditoriPerformanceReport />
        </TabsContent>

        <TabsContent value="calls" className="mt-6 max-sm:mt-3">
          <CallCenterReport />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReportisticaPage;
