import type { ReactNode } from "react";
import { endOfMonth, format, startOfMonth, subDays, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, BarChart2, CalendarIcon, Info, Link2, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useGoogleAdsReport } from "@/hooks/useGoogleAdsReport";
import { AdsSalesReportPanel } from "@/components/reporting/ads-sales/AdsSalesReportPanel";
import { AdsCallCenterReportPanel } from "@/components/reporting/ads-callcenter/AdsCallCenterReportPanel";
import { DeltaPercentuale as Delta } from "@/components/reporting/shared/DeltaPercentuale";
import TrendChart from "@/components/reporting/facebook-ads/TrendChart";
import GoogleAdsTable from "./GoogleAdsTable";

const fmtNum = (n: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(n);
const fmtDec = (n: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(n);
const fmtEur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);
const fmtPct = (n: number) => new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + "%";

const PRESET = [
  { label: "7gg", range: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { label: "30gg", range: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
  { label: "90gg", range: () => ({ from: subDays(new Date(), 89), to: new Date() }) },
  { label: "Questo mese", range: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  { label: "Mese scorso", range: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
];

function Big({ label, value, delta, sotto, loading }: { label: string; value: string; delta?: ReactNode; sotto?: ReactNode; loading: boolean }) {
  return (
    <Card className="flex flex-col gap-1.5 p-4">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {loading ? <Skeleton className="h-8 w-24" /> : (
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
          {delta}
        </div>
      )}
      {!loading && sotto && <div className="text-xs text-muted-foreground">{sotto}</div>}
    </Card>
  );
}

function Small({ label, value, delta, loading, aiuto }: { label: string; value: string; delta?: ReactNode; loading: boolean; aiuto?: string }) {
  return (
    <Card className="flex flex-col gap-1 p-3" title={aiuto}>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {loading ? <Skeleton className="h-6 w-16" /> : (
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-semibold tabular-nums">{value}</span>
          {delta}
        </div>
      )}
    </Card>
  );
}

export default function GoogleAdsReport() {
  const navigate = useNavigate();
  const report = useGoogleAdsReport();
  const { kpis: k, kpisPrev: p } = report;
  const giorni = Math.max(7, Math.round((report.dateRange.to.getTime() - report.dateRange.from.getTime()) / 86_400_000) + 1);
  const loading = report.isLoading;
  const crmLoading = loading || report.isLoadingCrm;
  const quota = (v: number | null) => (v == null ? "N/D" : fmtPct(v * 100));

  const pannelliCrm = (
    <>
      <section aria-label="Fatturato generato e Costo per vendita Google Ads">
        <AdsSalesReportPanel provider="google" daysBack={giorni} compact />
      </section>
      <section aria-label="Lead ads e chiamate Google Ads">
        <AdsCallCenterReportPanel provider="google" daysBack={giorni} compact />
      </section>
    </>
  );

  // ── Non collegato ──────────────────────────────────────────────────────
  if (!report.isLoadingConn && !report.isConnected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <BarChart2 className="h-6 w-6 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold">Report Google Ads</h2>
            <p className="text-sm text-muted-foreground">Campagne, gruppi di annunci, annunci, parole chiave e ricerche</p>
          </div>
        </div>
        <Alert className="border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" aria-hidden="true" />
          <AlertDescription className="text-sm text-blue-800">
            Collega il tuo account Google Ads per vedere spesa, clic, conversioni, Valore conversioni, ROAS, Quota impr.
            e, per ogni campagna e annuncio, quanti lead sono diventati trattative e contratti nel CRM.
          </AlertDescription>
        </Alert>
        {pannelliCrm}
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16 text-center">
          <Link2 className="mb-4 h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
          <h3 className="text-lg font-semibold">Account Google Ads non collegato</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {report.connessione && !report.connessione.customer_id
              ? "Il collegamento è avviato ma manca la scelta dell'account pubblicitario."
              : "Collega l'account dalla sezione Integrazioni."}
          </p>
          <Button className="mt-4" onClick={() => navigate("/azienda/impostazioni/integrazioni")}>Vai a Integrazioni</Button>
        </div>
      </div>
    );
  }

  const ambito = report.level === "campaign" || (!report.percorso.campaignId && !report.percorso.adGroupId)
    ? "tutto l'account"
    : report.percorso.adGroupId && report.level !== "ad_group"
      ? `gruppo «${report.percorso.adGroupName}»`
      : `campagna «${report.percorso.campaignName}»`;

  return (
    <div className="space-y-6">
      {/* Intestazione */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Report Google Ads</h2>
          <p className="text-xs text-muted-foreground">
            {report.connessione?.customer_descriptive_name ? `Account: ${report.connessione.customer_descriptive_name}` : "Account Google Ads"}
            {report.aggiornatoAlle && ` · dati Google delle ${format(new Date(report.aggiornatoAlle), "HH:mm")}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            {PRESET.map((pr) => {
              const r = pr.range();
              const attivo = format(r.from, "yyyy-MM-dd") === format(report.dateRange.from, "yyyy-MM-dd") && format(r.to, "yyyy-MM-dd") === format(report.dateRange.to, "yyyy-MM-dd");
              return (
                <Button key={pr.label} size="sm" variant={attivo ? "default" : "ghost"} className="h-7 px-2 text-xs" onClick={() => report.setDateRange(r)}>
                  {pr.label}
                </Button>
              );
            })}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 text-xs">
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(report.dateRange.from, "dd MMM", { locale: it })} – {format(report.dateRange.to, "dd MMM yyyy", { locale: it })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{ from: report.dateRange.from, to: report.dateRange.to }}
                onSelect={(r) => r?.from && r?.to && report.setDateRange({ from: r.from, to: r.to })}
                numberOfMonths={2}
                locale={it}
                className="pointer-events-auto p-3"
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={report.aggiorna}
            disabled={report.isFetching}
            aria-label="Aggiorna dati"
            title="Richiede a Google i dati più recenti (altrimenti restano validi 15 minuti)"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", report.isFetching && "animate-spin")} aria-hidden="true" />
            Aggiorna
          </Button>
        </div>
      </div>

      {report.errore && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Google Ads non ha restituito i dati</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{report.errore}</p>
          </div>
        </div>
      )}
      {report.avvisi.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Report parziale: Google non ha restituito alcuni dati</p>
            {report.avvisi.map((a) => <p key={a}>{a}</p>)}
          </div>
        </div>
      )}

      {/* KPI */}
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Stai guardando: <span className="font-medium text-foreground">{ambito}</span>
          {p ? " · le percentuali confrontano con il periodo precedente di pari durata" : ""}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Big label="Spesa" value={fmtEur(k.spend)} delta={<Delta ora={k.spend} prima={p?.spend} meglio="neutro" />} sotto={<>CPC {k.clicks > 0 ? fmtEur(k.cpc) : "—"}</>} loading={loading} />
          <Big
            label="Conversioni Google"
            value={fmtDec(k.conversions)}
            delta={<Delta ora={k.conversions} prima={p?.conversions} meglio="su" />}
            sotto={
              <span className="inline-flex items-center gap-1.5">
                Costo per conversione <span className="font-medium text-foreground">{k.conversions > 0 ? fmtEur(k.cpa) : "—"}</span>
                <Delta ora={k.cpa} prima={p && p.conversions > 0 ? p.cpa : null} meglio="giu" />
              </span>
            }
            loading={loading}
          />
          <Big
            label="Lead nel CRM"
            value={fmtNum(k.lead_crm)}
            sotto={<>{k.lead_crm > 0 ? <>Costo per lead CRM <span className="font-medium text-foreground">{fmtEur(k.costo_lead_crm)}</span> · </> : null}{fmtNum(k.opportunita)} trattative</>}
            loading={crmLoading}
          />
          <Big
            label="Contratti"
            value={fmtNum(k.vinte)}
            sotto={k.vinte > 0 ? <>Costo per contratto <span className="font-medium text-foreground">{fmtEur(k.costo_vinta)}</span>{k.valore_vinto > 0 && <> · valore {fmtEur(k.valore_vinto)}</>}</> : "Nessun contratto ancora dai lead del periodo"}
            loading={crmLoading}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <Small label="Impressioni" value={fmtNum(k.impressions)} delta={<Delta ora={k.impressions} prima={p?.impressions} meglio="neutro" />} loading={loading} />
          <Small label="Clic" value={fmtNum(k.clicks)} delta={<Delta ora={k.clicks} prima={p?.clicks} meglio="su" />} loading={loading} />
          <Small label="CTR" value={k.impressions > 0 ? fmtPct(k.ctr) : "N/D"} delta={<Delta ora={k.ctr} prima={p?.ctr} meglio="su" />} loading={loading} />
          <Small label="Valore conversioni" value={k.conversion_value > 0 ? fmtEur(k.conversion_value) : "—"} loading={loading} />
          <Small label="ROAS" value={k.conversion_value > 0 ? `${fmtDec(k.roas)}x` : "N/D"} aiuto="Valore conversioni registrato da Google diviso la spesa" loading={loading} />
          <Small label="Quota impr." value={quota(k.search_is)} aiuto="Su quante ricerche idonee gli annunci sono comparsi (rete di ricerca)" loading={loading} />
          <Small label="Persa: budget" value={quota(k.lost_budget_is)} aiuto="Ricerche perse perché il budget giornaliero finisce prima" loading={loading} />
          <Small label="Persa: ranking" value={quota(k.lost_rank_is)} aiuto="Ricerche perse per offerta o qualità dell'annuncio troppo basse" loading={loading} />
        </div>
        {!loading && (k.lost_budget_is ?? 0) > 0.2 && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Il {quota(k.lost_budget_is)} delle ricerche in cui potevi comparire è perso per budget: le campagne si fermano
            prima di fine giornata. Vedi la colonna «Persa: budget» per capire quali.
          </p>
        )}
      </div>

      <GoogleAdsTable report={report} />

      <TrendChart
        dailySeries={report.daily}
        isLoading={loading}
        nomeConversioni="Conversioni"
        sottotitolo="Tutto l'account Google Ads, giorno per giorno"
      />

      {pannelliCrm}
    </div>
  );
}
