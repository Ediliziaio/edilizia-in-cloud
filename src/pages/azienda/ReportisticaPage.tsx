import { lazy, Suspense, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import FacebookAdsReport from "@/components/reporting/facebook-ads/FacebookAdsReport";
import VenditoriPerformanceReport from "@/components/reporting/venditori/VenditoriPerformanceReport";
import CallCenterReport from "@/components/reporting/callcenter/CallCenterReport";
import GoogleAdsReport from "@/components/reporting/google-ads/GoogleAdsReport";
import { CrmSalesReportPanel } from "@/components/reporting/crm-sales/CrmSalesReportPanel";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { usePermissions } from "@/hooks/usePermissions";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

// «Oggi» è l'ex pagina Sales OS (25/11/2026): due pagine di numeri commerciali con
// regole diverse confondevano. Si carica solo quando la scheda è aperta.
const SalesOSDashboard = lazy(() => import("@/pages/azienda/marketing/SalesOSDashboard"));

// `breve`: etichetta sul telefono. Meta e Google (report di campagna, grafici
// larghi) restano al computer.
// `oggi`: la vede chi ha Sales OS (permesso canViewSalesOs + funzione sales_os);
// le altre chi ha la Reportistica (canViewMarketingReports), come prima.
const TABS = [
  { key: "oggi", label: "Oggi", breve: "Oggi", oggi: true },
  { key: "crm-vendite", label: "CRM e vendite", breve: "CRM" },
  { key: "calls", label: "Call center", breve: "Call center" },
  { key: "venditori", label: "Venditori", breve: "Venditori" },
  { key: "facebook-ads", label: "Meta Business Manager", soloComputer: true },
  { key: "google-ads", label: "Google Ads", soloComputer: true },
] as const;

type SchedaReport = (typeof TABS)[number];

const ReportisticaPage = () => {
  const tr = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const { isScopriPlan } = useSubscriptionLimits();
  const permissions = usePermissions();
  const salesOs = useFeatureAccess("sales_os");

  const puoOggi = permissions.canViewSalesOs && (salesOs.isEnabled || salesOs.isPreview);
  // La rotta lascia entrare con l'uno o con l'altro permesso: le schede dei report si
  // tolgono solo a chi è entrato per Sales OS senza avere la Reportistica (l'area
  // superadmin, che passa da AdminMarketingReportistica, le vede come prima).
  const puoReport = permissions.canViewMarketingReports || !permissions.canViewSalesOs;
  // Il muro del piano Scopri copriva la Reportistica, non Sales OS (che aveva solo la
  // sua funzione di piano): «Oggi» resta visibile anche lì.
  const reportBloccati = isScopriPlan;

  const schede = TABS.filter((tab: SchedaReport) => ("oggi" in tab ? puoOggi : puoReport));
  const defaultTab = schede[0]?.key ?? "crm-vendite";
  const requestedTab = searchParams.get("tab") || defaultTab;
  const schedaRichiesta = schede.find((tab) => tab.key === requestedTab);
  // Finché permessi e piano non sono letti non si riscrive l'indirizzo: un link a
  // «?tab=oggi» tornerebbe a «CRM e vendite» prima di sapere se si può.
  const pronto = !permissions.isLoading && !salesOs.isLoading;
  const isValidRequestedTab = Boolean(schedaRichiesta);
  const activeTab =
    isValidRequestedTab && !(isMobile && schedaRichiesta && "soloComputer" in schedaRichiesta) ? requestedTab : defaultTab;

  useEffect(() => {
    if (pronto && !isValidRequestedTab) {
      setSearchParams({ tab: defaultTab }, { replace: true });
    }
  }, [pronto, isValidRequestedTab, defaultTab, setSearchParams]);

  if (reportBloccati && !puoOggi) return <UpgradeScopriWall type="report" inline />;

  const muro = <UpgradeScopriWall type="report" inline />;

  return (
    <div className="space-y-6 max-sm:space-y-3">
      {/* Solo il titolo, senza riquadro, icona né spiegazione. */}
      <h1 className="text-xl font-bold leading-tight tracking-tight text-foreground max-sm:text-lg">
        {tr("Reportistica")}<span className="max-sm:hidden"> {tr("marketing e vendite")}</span>
      </h1>

      <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v })}>
        <TabsList className="flex flex-wrap h-auto gap-1 rounded-2xl border border-border bg-card p-2 shadow-sm max-sm:w-full max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:rounded-xl max-sm:p-1 max-sm:shadow-none">
          {schede.map((t) => (
            <TabsTrigger
              key={t.key}
              value={t.key}
              className={cn(
                "text-xs data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 sm:text-sm max-sm:flex-1 max-sm:px-2 max-sm:text-[13px]",
                "soloComputer" in t && "max-sm:hidden",
              )}
            >
              {"breve" in t ? (
                <>
                  <span className="max-sm:hidden">{tr(t.label)}</span>
                  <span className="sm:hidden">{tr(t.breve)}</span>
                </>
              ) : (
                tr(t.label)
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {puoOggi && (
          <TabsContent value="oggi" className="mt-6 max-sm:mt-3">
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <SalesOSDashboard incorporata />
            </Suspense>
          </TabsContent>
        )}

        {puoReport && (
          <>
            <TabsContent value="facebook-ads" className="mt-6">
              {reportBloccati ? muro : <FacebookAdsReport />}
            </TabsContent>

            <TabsContent value="google-ads" className="mt-6">
              {reportBloccati ? muro : <GoogleAdsReport />}
            </TabsContent>

            <TabsContent value="crm-vendite" className="mt-6 max-sm:mt-3">
              {reportBloccati ? muro : <CrmSalesReportPanel daysBack={180} />}
            </TabsContent>

            <TabsContent value="venditori" className="mt-6 max-sm:mt-3">
              {reportBloccati ? muro : <VenditoriPerformanceReport />}
            </TabsContent>

            <TabsContent value="calls" className="mt-6 max-sm:mt-3">
              {reportBloccati ? muro : <CallCenterReport />}
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
};

export default ReportisticaPage;
