import { useSearchParams, useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3 } from "lucide-react";
import FacebookAdsReport from "@/components/reporting/facebook-ads/FacebookAdsReport";

const TABS = [
  { key: "facebook-ads", label: "Report di Facebook Ads" },
  { key: "google-ads", label: "Report di Google Ads" },
  { key: "custom", label: "Report personalizzati" },
  { key: "attribution", label: "Rapporto di attribuzione" },
  { key: "calls", label: "Report sulle chiamate" },
  { key: "agents", label: "Report sugli agenti" },
  { key: "appointments", label: "Report sugli appuntamenti" },
  { key: "audit", label: "Audit marketing locale" },
];

const ReportisticaPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "facebook-ads";

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

        <TabsContent value="facebook-ads" className="mt-6">
          <FacebookAdsReport />
        </TabsContent>

        {TABS.filter((t) => t.key !== "facebook-ads").map((t) => (
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
