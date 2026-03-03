import { useMetaAdsReport } from "@/hooks/useMetaAdsReport";
import { AlertTriangle, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import ReportHeader from "./ReportHeader";
import KPIGrid from "./KPIGrid";
import TrendChart from "./TrendChart";
import CampaignTable from "./CampaignTable";

const FacebookAdsReport = () => {
  const report = useMetaAdsReport();
  const navigate = useNavigate();

  // Not connected
  if (!report.isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center border rounded-lg bg-card">
        <Link2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-semibold">Collega il tuo account Meta</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          Per visualizzare i report di Facebook Ads, collega prima il tuo account Meta dalla sezione Integrazioni.
        </p>
        <Button className="mt-4" onClick={() => navigate("/azienda/impostazioni/integrazioni")}>
          Vai a Integrazioni
        </Button>
      </div>
    );
  }

  // Token error
  if (report.hasTokenError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center border rounded-lg bg-destructive/5">
        <AlertTriangle className="h-12 w-12 text-destructive/60 mb-4" />
        <h3 className="text-lg font-semibold text-destructive">Connessione Meta da riconnettere</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Il token di accesso è scaduto. Riconnetti il tuo account Meta.
        </p>
        <Button variant="destructive" className="mt-4" onClick={() => navigate("/azienda/impostazioni/integrazioni")}>
          Riconnetti
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ReportHeader report={report} />
      <KPIGrid kpis={report.kpis} dailySeries={report.dailySeries} isLoading={report.isLoading} />
      <TrendChart dailySeries={report.dailySeries} isLoading={report.isLoading} />
      <CampaignTable report={report} />
    </div>
  );
};

export default FacebookAdsReport;
