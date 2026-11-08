import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCruscottoData } from "@/hooks/useCruscottoData";
import { useForecastLedger } from "@/hooks/useForecastLedger";
import { incassiScaduti, scadutoPerEtaDaIncassi } from "@/lib/finance/incassiScaduti";
import { ComeStiamoAndandoVista } from "@/pages/azienda/ComeStiamoAndando";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { CruscottoFilters } from "@/components/cruscotto/CruscottoFilters";
import { ScadutoPerEtaWidget } from "@/components/cruscotto/ScadutoPerEtaWidget";
import { CashFlowForecast } from "@/components/cruscotto/CashFlowForecast";
import { FinanzaCashFlow } from "@/components/cruscotto/FinanzaCashFlow";
import { EmptyStateGuide } from "@/components/cruscotto/EmptyStateGuide";
import { SectionErrorBoundary } from "@/components/cruscotto/SectionErrorBoundary";
import { DrilldownDrawer, type DrilldownType } from "@/components/cruscotto/DrilldownDrawer";
import { PuntoDiPareggio } from "@/components/cruscotto/PuntoDiPareggio";
import { TargetProgressBar } from "@/components/cruscotto/TargetProgressBar";
import { MarginalitaWidget } from "@/components/cruscotto/MarginalitaWidget";
import { SedeFilterBar } from "@/components/sedi/SedeFilterBar";
import { SedeIncidenzaTable } from "@/components/sedi/SedeIncidenzaTable";
import { useSediAnalytics } from "@/hooks/useSediAnalytics";
import { useSedeFilter } from "@/store/sedeFilterStore";
import { IndicatoriGuida } from "@/components/cruscotto/IndicatoriGuida";
import { CommesseGeneraliCruscotto } from "@/components/cruscotto/generali/CommesseGeneraliCruscotto";
import { DashboardSelectorBar } from "@/components/dashboard/DashboardSelectorBar";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { AlertCircle, Download, LayoutDashboard, RefreshCw } from "lucide-react";
import { RiquadroNumero, type TonoNumero } from "@/components/dashboard/RiquadroNumero";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDashboardBillingKPI } from "@/hooks/billing/useDashboardBillingKPI";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrencyCompact } from "@/lib/formatters";
import { safeNumber } from "@/lib/numberUtils";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendTooltip, type TrendTooltipSeries } from "@/components/charts/TrendTooltip";


// I colori del grafico: due linee e la barra della cassa (verde sopra lo zero,
// rossa sotto). Gli stessi nella legenda.
const COLORE_VENDUTO = "hsl(var(--chart-1))";
const COLORE_INCASSATO = "hsl(var(--chart-3))";
const COLORE_CASSA_POS = "hsl(var(--chart-2))";
const COLORE_CASSA_NEG = "hsl(var(--chart-5))";

/** Il periodo del filtro in parole, scritto sotto i numeri che lo seguono. */
function periodoInParole(f: { datePreset: string; dateFrom: Date; dateTo: Date }): string {
  const parole: Record<string, string> = {
    today: "Oggi", yesterday: "Ieri", last7: "Ultimi 7 giorni", last30: "Ultimi 30 giorni",
    month: "Questo mese", quarter: "Ultimi 90 giorni",
  };
  if (parole[f.datePreset]) return parole[f.datePreset];
  const g = (d: Date) => d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  return `${g(f.dateFrom)} – ${g(f.dateTo)}`;
}

function eur(value: number) {
  return formatCurrencyCompact(safeNumber(value));
}

export default function CruscottoAziendale() {
  const perms = usePermissions();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const cruscotto = useCruscottoData();
  const {
    marketing, finance, workOrders, companyTargets, cashFlowForecast,
    isLoading, error, financeError, filters, updateFilters,
  } = cruscotto;
  const [drilldown, setDrilldown] = useState<DrilldownType>(null);
  // P3.3 — persistenza tab attiva tra navigazioni (sessione corrente).
  const [cruscottoTab, setCruscottoTab] = useState<string>(() => {
    if (typeof window === "undefined") return "incassi";
    return window.sessionStorage.getItem("cruscotto-aziendale-tab") || "incassi";
  });
  const handleTabChange = useCallback((value: string) => {
    setCruscottoTab(value);
    if (typeof window !== "undefined") window.sessionStorage.setItem("cruscotto-aziendale-tab", value);
  }, []);
  // Due schede dall'08/11/2026: una scheda salvata di prima (sintesi, finanza,
  // operations, vendite) torna a «Incassi e cassa».
  const schedaVisibile = ["incassi", "commesse"].includes(cruscottoTab) ? cruscottoTab : "incassi";
  const { isNative } = useBillingMode();
  const effectiveCompanyId = useEffectiveCompanyId();
  const { data: billingKPI } = useDashboardBillingKPI(effectiveCompanyId, isNative);

  const { data: executiveTrend = [] } = useQuery({
    queryKey: ["cruscotto-executive-trend-12m", effectiveCompanyId],
    queryFn: async () => {
      if (!effectiveCompanyId) return [];
      // Aggregazione SERVER-SIDE (RPC cruscotto_trend_12m): prima scaricavamo
      // le righe grezze di orders/installments/costs e sommavamo in JS — il
      // cap righe PostgREST (~1000) troncava silenziosamente i totali sulle
      // aziende grandi. La RPC fa GROUP BY mensile in Postgres (bucket
      // Europe/Rome, stessa logica del vecchio client): numeri esatti e
      // payload di 12 righe invece di migliaia.
      const { data, error } = await supabase.rpc("cruscotto_trend_12m" as never, {
        p_company_id: effectiveCompanyId,
      } as never);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{
        mese_key: string; venduto: number; incassato: number; cassa: number;
      }>;
      const byKey = new Map(rows.map((r) => [r.mese_key, r]));
      // Le etichette mese ("gen '26") restano generate client-side: stesso
      // formato e stesso ordine di prima.
      return Array.from({ length: 12 }, (_, index) => {
        // dal primo del mese: a fine mese (29-31) setMonth saltava un mese e ne ripeteva un altro
        const oggi = new Date();
        const date = new Date(oggi.getFullYear(), oggi.getMonth() - (11 - index), 1);
        date.setHours(0, 0, 0, 0);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const monthLabel = date.toLocaleDateString("it-IT", { month: "short" }).replace(".", "");
        const row = byKey.get(key);
        return {
          key,
          mese: `${monthLabel} '${String(date.getFullYear()).slice(-2)}`,
          venduto: safeNumber(row?.venduto),
          incassato: safeNumber(row?.incassato),
          cassa: safeNumber(row?.cassa),
        };
      });
    },
    enabled: !!effectiveCompanyId,
    staleTime: 5 * 60 * 1000,
  });

  const navigate = useNavigate();

  // Lo scaduto da incassare con la regola del Previsionale (08/11/2026): stessa funzione
  // della sua pagina, quindi stesso numero. In cima, in «Da guardare oggi» e per età.
  const previsionale = useForecastLedger();
  const scadutoTesoreria = useMemo(() => {
    const d = previsionale.data;
    if (!d) return null;
    return scadutoPerEtaDaIncassi(incassiScaduti(d.movements, d.today), d.today);
  }, [previsionale.data]);

  const trendIsEmpty = useMemo(
    () =>
      executiveTrend.length > 0 &&
      executiveTrend.every(
        (m) => safeNumber(m.venduto) === 0 && safeNumber(m.incassato) === 0 && safeNumber(m.cassa) === 0,
      ),
    [executiveTrend],
  );

  const trendTooltipSeries = useMemo<TrendTooltipSeries[]>(() => {
    const eur = (v: number) =>
      v.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: true });
    return [
      { key: "venduto", label: "Venduto (IVA escl.)", color: "hsl(var(--chart-1))", formatter: eur },
      { key: "incassato", label: "Incassato (IVA incl.)", color: "hsl(var(--chart-3))", formatter: eur },
      {
        key: "cassa",
        label: "Cassa netta",
        color: (v) => (v < 0 ? "hsl(var(--chart-5))" : "hsl(var(--chart-2))"),
        formatter: eur,
        valueColor: (v) => (v < 0 ? "hsl(var(--chart-5))" : "hsl(var(--chart-2))"),
      },
    ];
  }, []);

  const hasOrders = workOrders.length > 0 || finance.revenueThisMonth > 0;
  const hasLeads = (marketing?.kpi?.leads_total ?? 0) > 0;
  const hasCosts = finance.supplierDebt > 0 || finance.thisMonthOutflow > 0;
  const isDataEmpty = !hasOrders && !hasLeads && !hasCosts && finance.pendingRevenue === 0 && !(finance.collectedThisMonth ?? 0) && !billingKPI?.fatture_emesse_mese;

  // Il riepilogo direzionale a una voce sola e' stato rimosso con il blocco che
  // lo mostrava: ripeteva il primo punto di "Da guardare oggi", che ora apre la
  // pagina e ne elenca quattro in ordine di quanto costa non farli.

  // Gli ultimi sei mesi dello storico, per la mini-linea dei due numeri del periodo.
  const ultimiSei = useMemo(() => executiveTrend.slice(-6), [executiveTrend]);

  // P4 — il venduto apre il `DrilldownDrawer` con le righe che lo fanno.
  const executiveKpis = useMemo(() => [
    {
      label: "Venduto periodo (IVA escl.)",
      etichetta: "Venduto",
      value: eur(finance.revenueThisMonth),
      hint: `${eur(finance.revenuePrevMonth)} nel periodo precedente · IVA esclusa`,
      tone: (finance.revenueThisMonth >= finance.revenuePrevMonth ? "buono" : "attenzione") as TonoNumero,
      tendenza: ultimiSei.map((m) => m.venduto),
      drilldown: "revenue" as DrilldownType,
    },
    {
      // Qui stava «Saldo scadenze mese»: fisso sul mese in un riquadro che si
      // chiama «Numeri del periodo», e già per intero in Finanza. Al suo posto
      // l'incassato del periodo scelto, accanto al venduto dello stesso periodo.
      label: "Incassato periodo (IVA incl.)",
      etichetta: "Incassato",
      value: eur(finance.collectedInPeriod ?? 0),
      hint: `${eur(finance.collectedPrevPeriod ?? 0)} nel periodo precedente · IVA inclusa`,
      tone: ((finance.collectedInPeriod ?? 0) >= (finance.collectedPrevPeriod ?? 0) ? "buono" : "attenzione") as TonoNumero,
      tendenza: ultimiSei.map((m) => m.incassato),
      drilldown: null as DrilldownType,
    },
  ], [finance, ultimiSei]);

  const { sediSelezionate, periodo } = useSedeFilter();
  const { data: sediData } = useSediAnalytics({ da: periodo.da, a: periodo.a });
  const sediVisibili = (sediData?.sedi ?? []).filter(
    (s) => sediSelezionate.length === 0 || sediSelezionate.includes(s.sede_id)
  );

  // ── Sezioni visibili in base ai permessi ──────────────────────────
  // Admin vede tutto, staff vede solo le sezioni per cui ha i permessi
  const showFinanza     = perms.isAdmin || perms.canViewPrimaNota || perms.canViewBilling || perms.canViewCosts || perms.canViewTesoreria;
  const showOperazioni  = perms.isAdmin || perms.canViewDashboard || perms.canViewOrders;

  const todayStr = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const todayCap = todayStr.charAt(0).toUpperCase() + todayStr.slice(1);

  return (
    <div className="space-y-3">
      {/* Su telefono la barra col nome e il selettore delle dashboard. Da
          tablet il selettore sta accanto al titolo della testata: la barra
          sopra ripeteva il nome una riga prima del titolo. */}
      <div className="sm:hidden">
        <DashboardSelectorBar title="Cruscotto Economico" />
      </div>

      <DashboardPageHeader
        title="Cruscotto Economico"
        subtitle={todayCap}
        icon={LayoutDashboard}
        leftAccessory={<DashboardSelectorBar title="Cruscotto Economico" soloSelettore />}
        compactTitle
        density="compact"
        toolbar={<CruscottoFilters filters={filters} onUpdate={updateFilters} compact />}
        actions={
          <Button
            variant="outline"
            size="sm"
            className="hidden h-8 gap-1.5 text-xs sm:inline-flex"
            onClick={() => window.print()}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Stampa / PDF</span>
          </Button>
        }
        className="print:mb-4"
      />

      {/* La risposta alla prima domanda apre il cruscotto invece di vivere in
          una pagina accanto: i suoi riquadri (incassato, margine, da incassare)
          erano gli stessi che si leggono piu' sotto, e due schermate che dicono
          la stessa cosa insegnano a non fidarsi di nessuna delle due. Qui sopra
          cosa guardare oggi, sotto l'approfondimento per periodo. */}
      <ComeStiamoAndandoVista
        comeSezione
        dati={cruscotto}
        tendenzaIncassato={ultimiSei.map((m) => m.incassato)}
        scaduto={{
          totale: scadutoTesoreria?.totale ?? 0,
          quanti: scadutoTesoreria?.rate ?? 0,
          caricando: previsionale.isLoading,
          fontiMancanti: previsionale.data?.issues ?? [],
          // il Previsionale ha il suo permesso: senza, il numero resta ma non porta da nessuna parte
          url: perms.isAdmin || perms.canViewForecast ? "/azienda/previsionale" : undefined,
        }}
      />

      {/* Error banner */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <span>Errore nel caricamento dei dati. Riprova tra qualche secondo.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start sm:self-auto gap-1.5 border-destructive/30 bg-background text-destructive hover:bg-destructive/10"
                onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.cruscotto.all })}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Riprova
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Empty State Guide */}
      {!isLoading && isDataEmpty && (
        <EmptyStateGuide hasOrders={hasOrders} hasLeads={hasLeads} hasCosts={hasCosts} />
      )}

      {!isDataEmpty && (
        <SectionErrorBoundary sectionName="Executive Summary">
          {/* Telefono: bastano i quattro numeri in cima e «Da guardare oggi»; il
              periodo e l'andamento sono lettura da scrivania.
              08/11/2026: via il pannello blu notte con le cifre in bianco. I due
              numeri del periodo sono riquadri come quelli in cima, con il periodo
              scritto e la tendenza; il grafico accanto ha due linee e una barra. */}
          <section className="grid gap-3 max-sm:hidden xl:grid-cols-[260px_minmax(0,1fr)]">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-1 xl:content-start">
              {executiveKpis.map((item) => (
                <RiquadroNumero
                  key={item.label}
                  etichetta={item.etichetta}
                  periodo={periodoInParole(filters)}
                  valore={isLoading ? "…" : item.value}
                  tono={isLoading ? "neutro" : item.tone}
                  contesto={item.hint}
                  tendenza={item.tendenza}
                  etichettaTendenza={`${item.etichetta} degli ultimi sei mesi`}
                  onClick={item.drilldown ? () => setDrilldown(item.drilldown) : undefined}
                />
              ))}
            </div>

            {isMobile ? null : (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Venduto, incassato e cassa</h3>
                    <p className="mt-0.5 text-[11px] font-medium text-slate-400">Ultimi 12 mesi · non segue il filtro del periodo</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ backgroundColor: COLORE_VENDUTO }} /> Venduto <span className="text-slate-400">IVA escl.</span></span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ backgroundColor: COLORE_INCASSATO }} /> Incassato <span className="text-slate-400">IVA incl.</span></span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: `linear-gradient(90deg, ${COLORE_CASSA_POS} 50%, ${COLORE_CASSA_NEG} 50%)` }} /> Cassa netta</span>
                  </div>
                </div>

                <div className="mt-3 h-[220px]">
                  {trendIsEmpty ? (
                    <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
                      <p className="text-sm font-medium text-slate-500">Ancora nessun movimento negli ultimi 12 mesi</p>
                      <p className="text-xs text-slate-400">Registra il primo incasso o crea una commessa per vedere l'andamento.</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={executiveTrend}
                        margin={{ top: 8, right: 4, left: -10, bottom: 0 }}
                        className="cursor-pointer"
                        onClick={(state) => {
                          // Drill-down: click sul mese -> commesse del periodo
                          const index = state?.activeTooltipIndex;
                          const key = index == null ? undefined : executiveTrend[Number(index)]?.key;
                          if (!key) return;
                          const [anno, mese] = key.split("-");
                          navigate(`/azienda/ordini?anno=${anno}&mese=${Number(mese) - 1}`);
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                        <XAxis dataKey="mese" tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" tickMargin={8} />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          fontSize={10}
                          stroke="#94a3b8"
                          tickMargin={6}
                          tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                        />
                        <ReferenceLine y={0} stroke="#cbd5e1" />
                        <RechartsTooltip
                          cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
                          content={<TrendTooltip data={executiveTrend} xKey="mese" series={trendTooltipSeries} />}
                        />
                        {/* La cassa è la differenza del mese: una barra, verde sopra lo
                            zero e rossa sotto. Venduto e incassato sono due linee, così
                            le barre non si coprono a vicenda. */}
                        <Bar dataKey="cassa" maxBarSize={18} radius={[3, 3, 3, 3]}>
                          {executiveTrend.map((m) => (
                            <Cell key={m.key} fill={safeNumber(m.cassa) < 0 ? COLORE_CASSA_NEG : COLORE_CASSA_POS} fillOpacity={0.55} />
                          ))}
                        </Bar>
                        <Line type="monotone" dataKey="venduto" stroke={COLORE_VENDUTO} strokeWidth={2.25} dot={false} activeDot={{ r: 4 }} />
                        <Line type="monotone" dataKey="incassato" stroke={COLORE_INCASSATO} strokeWidth={2.25} dot={false} activeDot={{ r: 4 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>
                {!trendIsEmpty && (
                  <p className="mt-2 text-right text-[10px] text-slate-400">Clicca su un mese per aprire le commesse del periodo</p>
                )}
              </div>
            )}
          </section>
        </SectionErrorBoundary>
      )}

      {/* «I numeri che comandano» e l'obiettivo del mese: stavano nella scheda
          Sintesi. Restano sopra le schede, sempre visibili. */}
      {!isDataEmpty && (
        <div className="space-y-3">
          <SectionErrorBoundary sectionName="I numeri che comandano">
            <IndicatoriGuida />
          </SectionErrorBoundary>
          {companyTargets?.monthly_revenue_target && !isMobile && (
            <SectionErrorBoundary sectionName="Target Mensile">
              <TargetProgressBar
                current={cashFlowForecast?.monthRevenue ?? 0}
                target={companyTargets.monthly_revenue_target}
                label="Target venduto · mese corrente"
              />
            </SectionErrorBoundary>
          )}
        </div>
      )}

      {!perms.isLoading && (showFinanza || showOperazioni) && (
        // Due schede (08/11/2026). Erano quattro: Sintesi, Finanza, Operazioni,
        // Vendite. «Operazioni» ripeteva la Dashboard Operativa (agenda, ritardi,
        // ticket, rate scadute), «Vendite» la Dashboard Marketing. In Finanza
        // c'erano fatturazione, prima nota, primi clienti e una torta per sede:
        // gli stessi incassi, scaduti e crediti già scritti sopra con altri
        // nomi. Il Cruscotto Economico parla di soldi, una volta per numero.
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm print:border-slate-200 max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none">
          <Tabs value={schedaVisibile} onValueChange={handleTabChange} className="w-full">
            <TabsList className="sticky top-0 z-10 grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:static">
              <TabsTrigger value="incassi" className="rounded-lg" disabled={!showFinanza}>Incassi e cassa</TabsTrigger>
              <TabsTrigger value="commesse" className="rounded-lg">Commesse e margini</TabsTrigger>
            </TabsList>

            <TabsContent value="incassi" className="mt-3 space-y-3">
              {showFinanza && (
                <SectionErrorBoundary sectionName="Incassi e cassa">
                  <div className="space-y-3">
                    <CashFlowForecast cashFlowForecast={cashFlowForecast} isLoading={isLoading} />
                    <ScadutoPerEtaWidget scaduto={scadutoTesoreria ?? { fasce: [], totale: 0, rate: 0, ritardoMedio: null }} isLoading={previsionale.isLoading} />
                    <FinanzaCashFlow finance={finance} isLoading={isLoading} dataError={financeError} />
                  </div>
                </SectionErrorBoundary>
              )}
            </TabsContent>

            <TabsContent value="commesse" className="mt-3 space-y-3">
              {showOperazioni && (
                <>
                  <SectionErrorBoundary sectionName="Marginalità Cantieri">
                    <MarginalitaWidget />
                  </SectionErrorBoundary>
                  {/* Appalti e operazioni immobiliari: solo per chi ha acceso le commesse generali */}
                  <SectionErrorBoundary sectionName="Commesse generali">
                    <CommesseGeneraliCruscotto />
                  </SectionErrorBoundary>
                </>
              )}
              {showFinanza && (
                <>
                  <SectionErrorBoundary sectionName="Punto di Pareggio">
                    <PuntoDiPareggio />
                  </SectionErrorBoundary>
                  {/* Il conto per sede, solo per chi ne ha più d'una. La torta
                      accanto ripeteva in percentuale la colonna «Inc. Ricavi». */}
                  {(sediData?.sedi?.length ?? 0) > 1 && sediVisibili.length > 0 && (
                    <SectionErrorBoundary sectionName="Analytics per Sede">
                      <div className="space-y-3 rounded-lg border bg-white p-3 max-sm:hidden">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h2 className="text-lg font-semibold text-eic-navy">P&amp;L per Sede</h2>
                          <SedeFilterBar />
                        </div>
                        <SedeIncidenzaTable />
                      </div>
                    </SectionErrorBoundary>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </section>
      )}

      {/* Drill-down Drawer */}
      <DrilldownDrawer
        type={drilldown}
        onClose={() => setDrilldown(null)}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
      />
    </div>
  );
}
