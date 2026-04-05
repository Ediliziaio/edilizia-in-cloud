/**
 * Pagina principale Google Ads.
 * Struttura:
 * 1. Header con titolo + filtro date
 * 2. Stato errore (se presente)
 * 3. Banner se nessun dato nel DB
 * 4. KPI Overview + Grafico + Tabella campagne
 */
import { AlertCircle, RefreshCw, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useGoogleAdsStats } from "@/hooks/useGoogleAdsStats";
import { GoogleAdsOverview } from "./components/GoogleAdsOverview";
import { GoogleAdsChart } from "./components/GoogleAdsChart";
import { GoogleAdsCampaignsTable } from "./components/GoogleAdsCampaignsTable";
import { GoogleAdsConnectBanner } from "./components/GoogleAdsConnectBanner";
import { GoogleAdsDateRangePicker } from "./components/GoogleAdsDateRangePicker";

export default function GoogleAdsPage() {
  const { stats, kpis, campaigns, isLoading, error, refetch, dateRange, setDateRange } =
    useGoogleAdsStats();

  const hasData = stats.length > 0;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Google Ads</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <GoogleAdsDateRangePicker
            dateRange={dateRange}
            onChangeRange={setDateRange}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={isLoading}
            onClick={refetch}
            title="Aggiorna dati"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Errore */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={refetch}>
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Nessun dato: mostra banner */}
      {!isLoading && !error && !hasData ? (
        <GoogleAdsConnectBanner
          title="Nessun dato Google Ads disponibile"
          description="Non sono ancora presenti statistiche per il periodo selezionato. Verifica la sincronizzazione oppure modifica il filtro date."
          showImportHint
        />
      ) : (
        <>
          {/* KPI cards */}
          <GoogleAdsOverview kpis={kpis} isLoading={isLoading} />

          {/* Grafico trend */}
          <GoogleAdsChart stats={stats} isLoading={isLoading} />

          {/* Tabella campagne */}
          <GoogleAdsCampaignsTable campaigns={campaigns} isLoading={isLoading} />
        </>
      )}
    </div>
  );
}
