import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3 } from "lucide-react";
import FacebookAdsReport from "@/components/reporting/facebook-ads/FacebookAdsReport";
import VenditoriPerformanceReport from "@/components/reporting/venditori/VenditoriPerformanceReport";
import CallCenterReport from "@/components/reporting/callcenter/CallCenterReport";
import GoogleAdsReport from "@/components/reporting/google-ads/GoogleAdsReport";
import { CrmSalesReportPanel } from "@/components/reporting/crm-sales/CrmSalesReportPanel";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";

const TABS = [
  { key: "facebook-ads", label: "Meta Business Manager" },
  { key: "google-ads", label: "Google Ads" },
  { key: "crm-vendite", label: "CRM e vendite" },
  { key: "calls", label: "Call center" },
  { key: "venditori", label: "Venditori" },
];

const ReportisticaPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") || "facebook-ads";
  const isValidRequestedTab = TABS.some((tab) => tab.key === requestedTab);
  const activeTab = isValidRequestedTab ? requestedTab : "facebook-ads";
  const { isScopriPlan } = useSubscriptionLimits();

  useEffect(() => {
    if (!isValidRequestedTab) {
      setSearchParams({ tab: "facebook-ads" }, { replace: true });
    }
  }, [isValidRequestedTab, setSearchParams]);

  if (isScopriPlan) return <UpgradeScopriWall type="report" inline />;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/50 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-200">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Reportistica marketing e vendite</h1>
            <p className="text-sm text-slate-600">
              Analizza sponsorizzate Meta, campagne Google, CRM, appuntamenti, vendite e fatturato generato.
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v })}>
        <TabsList className="flex flex-wrap h-auto gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="text-xs data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 sm:text-sm">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="facebook-ads" className="mt-6">
          <FacebookAdsReport />
        </TabsContent>

        <TabsContent value="google-ads" className="mt-6">
          <GoogleAdsReport />
        </TabsContent>

        <TabsContent value="crm-vendite" className="mt-6">
          <CrmSalesReportPanel daysBack={180} />
        </TabsContent>

        <TabsContent value="venditori" className="mt-6">
          <VenditoriPerformanceReport />
        </TabsContent>

        <TabsContent value="calls" className="mt-6">
          <CallCenterReport />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReportisticaPage;
