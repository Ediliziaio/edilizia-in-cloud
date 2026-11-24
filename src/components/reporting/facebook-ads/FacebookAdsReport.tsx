import { useMetaAdsReport } from "@/hooks/useMetaAdsReport";
import { AlertTriangle, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import ReportHeader from "./ReportHeader";
import KPIGrid from "./KPIGrid";
import TrendChart from "./TrendChart";
import CampaignTable from "./CampaignTable";
import CRMFunnelSection from "./CRMFunnelSection";
import { AdsSalesReportPanel } from "@/components/reporting/ads-sales/AdsSalesReportPanel";
import { AdsCallCenterReportPanel } from "@/components/reporting/ads-callcenter/AdsCallCenterReportPanel";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const FacebookAdsReport = () => {
  const t = useT();
  const report = useMetaAdsReport();
  const navigate = useNavigate();
  const daysBack = Math.max(
    7,
    Math.ceil((report.dateRange.to.getTime() - report.dateRange.from.getTime()) / 86_400_000) + 1,
  );

  // Not connected
  if (!report.isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center border rounded-lg bg-card">
        <Link2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-semibold">{t("Collega il tuo account Meta")}</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          {t("Per visualizzare i report di Facebook Ads, collega prima il tuo account Meta dalla sezione Integrazioni.")}
        </p>
        <Button className="mt-4" onClick={() => navigate("/azienda/impostazioni/integrazioni")}>
          {t("Vai a Integrazioni")}
        </Button>
      </div>
    );
  }

  // Token error
  if (report.hasTokenError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center border rounded-lg bg-destructive/5">
        <AlertTriangle className="h-12 w-12 text-destructive/60 mb-4" />
        <h3 className="text-lg font-semibold text-destructive">{t("Connessione Meta da riconnettere")}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t("Il token di accesso è scaduto. Riconnetti il tuo account Meta.")}
        </p>
        <Button variant="destructive" className="mt-4" onClick={() => navigate("/azienda/impostazioni/integrazioni")}>
          {t("Riconnetti")}
        </Button>
      </div>
    );
  }

  // Collegato ma senza un account scelto: il proxy mostra solo gli account
  // indicati dall'azienda, mai quelli degli altri clienti dello stesso utente Meta.
  if (!report.isLoadingAccounts && report.adAccounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center border rounded-lg bg-card">
        <Link2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-semibold">{t("Scegli l'account pubblicitario")}</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          {t("Indica quale account pubblicitario appartiene a questa azienda: il report mostra solo quello.")}
        </p>
        <Button className="mt-4" onClick={() => navigate("/azienda/marketing/pubblicita")}>
          {t("Vai a Pubblicità")}
        </Button>
      </div>
    );
  }

  const ambito = report.level === "ad" && report.drill.adsetId
    ? t("gruppo «{nome}»", { nome: report.drill.adsetName ?? "" })
    : report.level !== "campaign" && report.drill.campaignId
      ? t("campagna «{nome}»", { nome: report.drill.campaignName ?? "" })
      : t("tutto l'account");

  // Prima i numeri e il dettaglio campagne → gruppi → inserzioni (quello che si
  // viene a cercare), poi l'andamento e i pannelli CRM / call center.
  return (
    <div className="space-y-6">
      <ReportHeader report={report} />
      {report.erroreReport && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
          <div>
            <p className="font-medium">{t("Meta non ha restituito i dati")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{report.erroreReport}</p>
          </div>
        </div>
      )}
      {report.avvisi.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{t("Report parziale: Meta non ha restituito alcuni dati")}</p>
            {report.avvisi.map((a) => <p key={a}>{a}</p>)}
          </div>
        </div>
      )}
      <KPIGrid
        kpis={report.kpis}
        kpisPrev={report.kpisPrev}
        dailySeries={report.dailySeries}
        isLoading={report.isLoading}
        isLoadingCrm={report.isLoadingCrm}
        ambito={ambito}
      />
      <CampaignTable report={report} />
      <TrendChart dailySeries={report.dailySeries} isLoading={report.isLoading} />
      <CRMFunnelSection dateRange={report.dateRange} isConnected={report.isConnected} />
      <AdsSalesReportPanel provider="meta" daysBack={daysBack} compact />
      <AdsCallCenterReportPanel provider="meta" daysBack={daysBack} compact />
    </div>
  );
};

export default FacebookAdsReport;
