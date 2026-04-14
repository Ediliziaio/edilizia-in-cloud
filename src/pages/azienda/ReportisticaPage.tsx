import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3 } from "lucide-react";
import FacebookAdsReport from "@/components/reporting/facebook-ads/FacebookAdsReport";
import AttributionReport from "@/components/reporting/attribution/AttributionReport";
import VenditoriPerformanceReport from "@/components/reporting/venditori/VenditoriPerformanceReport";
import CallCenterReport from "@/components/reporting/callcenter/CallCenterReport";
import CantiereDashboard from "@/components/reporting/cantieri/CantiereDashboard";
import GoogleAdsReport from "@/components/reporting/google-ads/GoogleAdsReport";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";

const TABS = [
  { key: "cantieri", label: "Dashboard Cantieri" },
  { key: "facebook-ads", label: "Report di Facebook Ads" },
  { key: "google-ads", label: "Report di Google Ads" },
  { key: "attribution", label: "Rapporto di attribuzione" },
  { key: "calls", label: "Report sulle chiamate" },
  { key: "venditori", label: "Performance Venditori" },
];

const IMPLEMENTED_TABS = ["cantieri", "facebook-ads", "google-ads", "attribution", "venditori", "calls"];

const ReportisticaPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "cantieri";
  const { isScopriPlan } = useSubscriptionLimits();

  if (isScopriPlan) return <UpgradeScopriWall type="report" inline />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Reportistica</h1>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v })}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="text-xs sm:text-sm">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="cantieri" className="mt-6">
          <CantiereDashboard />
        </TabsContent>

        <TabsContent value="facebook-ads" className="mt-6">
          <FacebookAdsReport />
        </TabsContent>

        <TabsContent value="google-ads" className="mt-6">
          <GoogleAdsReport />
        </TabsContent>

        <TabsContent value="attribution" className="mt-6">
          <AttributionReport />
        </TabsContent>

        <TabsContent value="venditori" className="mt-6">
          <VenditoriPerformanceReport />
        </TabsContent>

        <TabsContent value="calls" className="mt-6">
          <CallCenterReport />
        </TabsContent>

        {TABS.filter((t) => !IMPLEMENTED_TABS.includes(t.key)).map((t) => (
          <TabsContent key={t.key} value={t.key} className="mt-6">
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <BarChart3 className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">{t.label}</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">Coming soon</p>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default ReportisticaPage;
