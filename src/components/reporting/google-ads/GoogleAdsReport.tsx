import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGoogleAdsStats } from "@/hooks/useGoogleAdsStats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart2,
  TrendingUp,
  MousePointerClick,
  Eye,
  Euro,
  Target,
  RefreshCw,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Link2,
  Info,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatPercent,
  formatNumber,
} from "@/lib/google-ads/formatters";
import type { GoogleAdsCampaign } from "@/types/google-ads";

// ─── Preset di date ──────────────────────────────────────────────────────────

type DatePreset = "7" | "30" | "90";

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "7", label: "Ultimi 7 giorni" },
  { key: "30", label: "Ultimi 30 giorni" },
  { key: "90", label: "Ultimi 90 giorni" },
];

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  sub,
  colorClass = "",
  isLoading,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  sub?: string;
  colorClass?: string;
  isLoading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-28 rounded-xl" />;
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              {label}
            </p>
            <p className={cn("text-2xl font-bold mt-1", colorClass)}>{value}</p>
            {sub && (
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            )}
          </div>
          <div className="bg-primary/10 rounded-lg p-2">
            <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Colonne ordinabili ───────────────────────────────────────────────────────

type SortField = keyof Pick<
  GoogleAdsCampaign,
  "campaign_name" | "impressions" | "clicks" | "ctr" | "spend" | "conversions" | "cpc"
>;
type SortDir = "asc" | "desc";

function SortIcon({
  field,
  sortField,
  sortDir,
}: {
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
}) {
  if (field !== sortField) return <ChevronsUpDown className="h-3 w-3 ml-1 opacity-40" />;
  return sortDir === "asc" ? (
    <ChevronUp className="h-3 w-3 ml-1" />
  ) : (
    <ChevronDown className="h-3 w-3 ml-1" />
  );
}

function SortableTh({
  field,
  sortField,
  sortDir,
  onSort,
  children,
  className,
}: {
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TableHead
      className={cn("cursor-pointer select-none", className)}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center">
        {children}
        <SortIcon field={field} sortField={sortField} sortDir={sortDir} />
      </span>
    </TableHead>
  );
}

// ─── Componente principale ────────────────────────────────────────────────────

export default function GoogleAdsReport() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const navigate = useNavigate();

  // Preset selezionato (default: 30 giorni)
  const [preset, setPreset] = useState<DatePreset>("30");

  // Sort tabella campagne
  const [sortField, setSortField] = useState<SortField>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Hook dati Google Ads
  const {
    kpis,
    campaigns,
    isLoading: statsLoading,
    error,
    refetch,
    setDateRange,
  } = useGoogleAdsStats();

  // Check integrazione Google Ads
  const { data: integration, isLoading: integrationLoading } = useQuery({
    queryKey: ["google-ads-integration", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("integrations")
        .select("id, status, meta_data")
        .eq("company_id", companyId)
        .eq("provider", "google_ads")
        .maybeSingle();
      return data;
    },
    enabled: !!companyId,
  });

  const isLoading = integrationLoading || statsLoading;

  // Aggiorna dateRange in base al preset
  function handlePreset(key: DatePreset) {
    setPreset(key);
    const days = parseInt(key, 10);
    setDateRange({ from: subDays(new Date(), days - 1), to: new Date() });
  }

  // Sort handler
  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  // Campagne ordinate
  const sortedCampaigns = useMemo(() => {
    return [...campaigns].sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc"
          ? av.localeCompare(bv, "it")
          : bv.localeCompare(av, "it");
      }
      const an = av as number;
      const bn = bv as number;
      return sortDir === "asc" ? an - bn : bn - an;
    });
  }, [campaigns, sortField, sortDir]);

  // Totali riga in fondo
  const totals = useMemo(
    () => ({
      impressions: campaigns.reduce((s, c) => s + c.impressions, 0),
      clicks: campaigns.reduce((s, c) => s + c.clicks, 0),
      spend: campaigns.reduce((s, c) => s + c.spend, 0),
      conversions: campaigns.reduce((s, c) => s + c.conversions, 0),
      ctr:
        campaigns.reduce((s, c) => s + c.impressions, 0) > 0
          ? (campaigns.reduce((s, c) => s + c.clicks, 0) /
              campaigns.reduce((s, c) => s + c.impressions, 0)) *
            100
          : 0,
      cpc:
        campaigns.reduce((s, c) => s + c.clicks, 0) > 0
          ? campaigns.reduce((s, c) => s + c.spend, 0) /
            campaigns.reduce((s, c) => s + c.clicks, 0)
          : 0,
    }),
    [campaigns]
  );

  // ── Stato: non connesso ──────────────────────────────────────────────────
  if (!integrationLoading && !integration) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <BarChart2 className="h-6 w-6 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold">Report Google Ads</h2>
            <p className="text-sm text-muted-foreground">
              Monitora le performance delle tue campagne Google
            </p>
          </div>
        </div>

        <Alert className="border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" aria-hidden="true" />
          <AlertDescription className="text-blue-800 text-sm">
            Collega il tuo account Google Ads per visualizzare impressioni, click, costi e
            conversioni in tempo reale.
          </AlertDescription>
        </Alert>

        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-xl bg-card">
          <Link2 className="h-12 w-12 text-muted-foreground/40 mb-4" aria-hidden="true" />
          <h3 className="text-lg font-semibold">Account Google Ads non collegato</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Per visualizzare i report di Google Ads, collega prima il tuo account dalla sezione
            Integrazioni.
          </p>
          <Button
            className="mt-4"
            onClick={() => navigate("/azienda/impostazioni/integrazioni")}
          >
            Vai a Integrazioni
          </Button>
        </div>
      </div>
    );
  }

  // ── Stato: errore ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={refetch}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // ── Render principale ────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BarChart2 className="h-6 w-6 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold">Report Google Ads</h2>
            <p className="text-sm text-muted-foreground">
              Performance campagne pubblicitarie Google
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {integration && (
            <Badge
              className={cn(
                "text-xs",
                integration.status === "active"
                  ? "bg-green-100 text-green-800"
                  : "bg-yellow-100 text-yellow-800"
              )}
            >
              {integration.status === "active" ? "Connesso" : "In attesa"}
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={refetch}
            disabled={isLoading}
            aria-label="Aggiorna dati"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5 mr-1.5", isLoading && "animate-spin")}
              aria-hidden="true"
            />
            Aggiorna
          </Button>
        </div>
      </div>

      {/* Filtro date range */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">Periodo:</span>
        {DATE_PRESETS.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={preset === p.key ? "default" : "outline"}
            className="text-xs h-7 px-3"
            onClick={() => handlePreset(p.key)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* KPI card */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard
          label="Spesa totale"
          value={isLoading ? "—" : formatCurrency(kpis.totalSpend)}
          icon={Euro}
          colorClass="text-amber-600"
          isLoading={isLoading}
        />
        <KpiCard
          label="Impressioni"
          value={isLoading ? "—" : formatNumber(kpis.totalImpressions)}
          icon={Eye}
          isLoading={isLoading}
        />
        <KpiCard
          label="Click"
          value={isLoading ? "—" : formatNumber(kpis.totalClicks)}
          icon={MousePointerClick}
          colorClass="text-primary"
          isLoading={isLoading}
        />
        <KpiCard
          label="CTR medio"
          value={isLoading ? "—" : formatPercent(kpis.avgCTR)}
          icon={BarChart2}
          isLoading={isLoading}
        />
        <KpiCard
          label="Conversioni"
          value={isLoading ? "—" : formatNumber(kpis.totalConversions)}
          icon={Target}
          colorClass="text-green-600"
          isLoading={isLoading}
        />
        <KpiCard
          label="CPC medio"
          value={isLoading ? "—" : formatCurrency(kpis.avgCPC)}
          icon={TrendingUp}
          isLoading={isLoading}
        />
      </div>

      {/* Tabella campagne */}
      {isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart2 className="h-12 w-12 text-gray-300 mb-4" aria-hidden="true" />
          <h3 className="text-lg font-medium text-gray-900">Nessun dato disponibile</h3>
          <p className="text-sm text-gray-500 mt-1">
            Non ci sono campagne nel periodo selezionato. Prova a modificare il periodo.
          </p>
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Performance per campagna
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTh
                      field="campaign_name"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    >
                      Campagna
                    </SortableTh>
                    <SortableTh
                      field="impressions"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="text-right"
                    >
                      Impressioni
                    </SortableTh>
                    <SortableTh
                      field="clicks"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="text-right"
                    >
                      Click
                    </SortableTh>
                    <SortableTh
                      field="ctr"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="text-right"
                    >
                      CTR
                    </SortableTh>
                    <SortableTh
                      field="spend"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="text-right"
                    >
                      Spesa (€)
                    </SortableTh>
                    <SortableTh
                      field="conversions"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="text-right"
                    >
                      Conversioni
                    </SortableTh>
                    <SortableTh
                      field="cpc"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="text-right"
                    >
                      CPC
                    </SortableTh>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCampaigns.map((c) => (
                    <TableRow
                      key={c.campaign_id ?? c.campaign_name}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell
                        className="font-medium max-w-[220px] truncate"
                        title={c.campaign_name}
                      >
                        {c.campaign_name}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(c.impressions)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(c.clicks)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatPercent(c.ctr)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(c.spend)}
                      </TableCell>
                      <TableCell className="text-right text-green-600 font-semibold">
                        {formatNumber(c.conversions)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(c.cpc)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Riga totali */}
                  <TableRow className="border-t-2 bg-muted/20">
                    <TableCell className="font-semibold">Totale</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatNumber(totals.impressions)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatNumber(totals.clicks)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatPercent(totals.ctr)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(totals.spend)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-green-600">
                      {formatNumber(totals.conversions)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(totals.cpc)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
