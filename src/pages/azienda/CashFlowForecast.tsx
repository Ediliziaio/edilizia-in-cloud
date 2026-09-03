import { format } from "date-fns";
import { Download, Printer, CalendarClock, BookOpen, Landmark, TrendingUp, TrendingDown, Sparkles } from "lucide-react";
import { exportToCSV } from "@/lib/csvExport";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCashFlowData } from "@/hooks/useCashFlowData";
import { CollectedTab } from "@/components/forecast/CollectedTab";
import { CostsForecastTab } from "@/components/forecast/CostsForecastTab";
import { CashForecastTab } from "@/components/forecast/CashForecastTab";
import { MarginTab } from "@/components/forecast/MarginTab";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCashFlowRealData } from "@/hooks/useCashFlowRealData";
import { CashFlowProjectionChart } from "@/components/forecast/CashFlowProjectionChart";
import { NavyStatCard } from "@/components/costi/KpiCard";
import { SilvioCashflowForecast } from "@/components/silvio/SilvioCashflowForecast";
import { TrediciSettimaneTab } from "@/components/forecast/TrediciSettimaneTab";


export default function CashFlowForecast() {
  const navigate = useNavigate();

  const {
    isLoading,
    isError,
    orders,
    expectedPayments,
    expectedExpenses,
    expectedCommissions,
    expectedSupplierPayments,
    expectedCompanyCosts,
    stats,
    companyId,
    scadenzeForForecast,
    primaNotaSaldo,
    dataTruncated,
    activeEmployees,
  } = useCashFlowData();

  // Proiezione 90 giorni con dati reali banking + fatture
  const { data: realData, isError: realDataError } = useCashFlowRealData(companyId);

  // Dati bancari reali: saldo attuale + entrate/uscite previste
  const { data: bankingSummary, isError: bankingSummaryError, refetch: refetchBanking } = useQuery({
    queryKey: ["banking-summary-forecast", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const [accountsRes, unpaidInvoicesRes, openPurchaseOrdersRes] = await Promise.all([
        supabase
          .from("bank_accounts")
          .select("current_balance")
          .eq("company_id", companyId!)
          .eq("is_active", true),
        supabase
          .from("invoices")
          .select("total, paid_amount, due_date")
          .eq("company_id", companyId!)
          .not("status", "in", '("paid","cancelled","draft")'),
        supabase
          .from("purchase_orders")
          .select("total, expected_delivery_date")
          .eq("company_id", companyId!)
          .not("status", "in", '("ricevuto","annullato")'),
      ]);

      const bankBalance = (accountsRes.data || []).reduce((s: number, a: any) => s + (a.current_balance || 0), 0);
      const pendingIncome = (unpaidInvoicesRes.data || []).reduce(
        (s: number, inv: any) => s + Math.max(0, (inv.total || 0) - (inv.paid_amount || 0)),
        0
      );
      const pendingExpenses = (openPurchaseOrdersRes.data || []).reduce(
        (s: number, po: any) => s + (po.total || 0),
        0
      );

      // "Forecast 30gg" DEVE guardare solo i prossimi 30 giorni: prima sommava
      // TUTTE le fatture/PO aperti senza bound temporale, quindi il numero non
      // corrispondeva all'etichetta. Date locali (en-CA) per il confine giorno.
      const todayStr = new Date().toLocaleDateString("en-CA");
      const in30 = new Date();
      in30.setDate(in30.getDate() + 30);
      const in30Str = in30.toLocaleDateString("en-CA");

      const income30 = (unpaidInvoicesRes.data || [])
        .filter((inv: any) => inv.due_date && inv.due_date >= todayStr && inv.due_date <= in30Str)
        .reduce((s: number, inv: any) => s + Math.max(0, (inv.total || 0) - (inv.paid_amount || 0)), 0);
      const expenses30 = (openPurchaseOrdersRes.data || [])
        .filter((po: any) => po.expected_delivery_date && po.expected_delivery_date >= todayStr && po.expected_delivery_date <= in30Str)
        .reduce((s: number, po: any) => s + (po.total || 0), 0);

      return {
        bankBalance,
        pendingIncome,
        pendingExpenses,
        forecast30: bankBalance + income30 - expenses30,
      };
    },
    staleTime: 300_000,
  });

  // Export CSV
  const exportCSV = () => {
    interface CsvTransaction {
      expectedDate: Date | null;
      amount: number;
      direction: "in" | "out";
      type: string;
      label: string;
      orderCode: string | null;
    }

    const allTransactions: CsvTransaction[] = [
      ...expectedPayments.map((p) => ({ expectedDate: p.expectedDate, amount: p.amount, direction: "in" as const, type: p.type, label: p.customerName, orderCode: p.orderCode })),
      ...expectedExpenses.map((e) => ({ expectedDate: e.expectedDate, amount: e.amount, direction: "out" as const, type: "Squadra Esterna", label: e.teamName, orderCode: e.orderCode })),
      ...expectedCommissions.map((c) => ({ expectedDate: c.expectedDate, amount: c.amount, direction: "out" as const, type: "Provvigione", label: c.salespersonName, orderCode: c.orderCode })),
      ...expectedCompanyCosts.map((c) => ({ expectedDate: c.expectedDate, amount: c.amount, direction: "out" as const, type: c.type, label: c.name, orderCode: null as string | null })),
      ...expectedSupplierPayments.filter(p => !p.isPaid).map((s) => ({ expectedDate: s.expectedDate, amount: s.amount, direction: "out" as const, type: s.type, label: s.supplierName, orderCode: s.orderCode })),
      ...scadenzeForForecast.map((s: any) => ({ expectedDate: s.due_date ? new Date(s.due_date) : null, amount: Number(s.amount) - Number(s.paid_amount || 0), direction: (s.direction === "entrata" ? "in" : "out") as "in" | "out", type: "Scadenza", label: s.description, orderCode: null as string | null })),
    ];

    const columns = [
      { key: "data", label: "Data" },
      { key: "tipo", label: "Tipo" },
      { key: "descrizione", label: "Descrizione" },
      { key: "ordine", label: "Ordine" },
      { key: "direzione", label: "Direzione" },
      { key: "importo", label: "Importo" },
    ];

    const rows = allTransactions.map((t) => ({
      data: t.expectedDate ? format(t.expectedDate, "dd/MM/yyyy") : "",
      tipo: t.type,
      descrizione: t.label,
      ordine: t.orderCode || "",
      direzione: t.direction === "in" ? "Entrata" : "Uscita",
      importo: String(t.amount),
    }));

    exportToCSV(rows, columns, `previsionale-cassa-${format(new Date(), "yyyy-MM-dd")}.csv`);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-16 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Stato d'errore reale sui dati core. Prima era `!orders` (sempre falso:
  // orders default []), quindi questo blocco non compariva MAI e un errore
  // di caricamento lasciava la pagina vuota senza spiegazione.
  if (isError && !isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Previsionale Cassa</h1>
          <p className="text-muted-foreground">
            Analizza entrate, uscite e flusso di cassa previsto
          </p>
        </div>
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-muted-foreground pt-8 pb-4">
              Errore nel caricamento dei dati. Riprova tra qualche istante.
            </p>
            <div className="flex justify-center pb-4">
              <Button variant="outline" onClick={() => window.location.reload()}>
                Riprova
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 py-5 shadow-sm sm:px-6 print:mb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">Previsionale Cassa</h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Analizza entrate, uscite e flusso di cassa previsto.
              </p>
            </div>
          </div>
        <div className="flex items-center gap-2 print:hidden flex-wrap">
          <Button variant="outline" size="sm" onClick={() => navigate("/azienda/tesoreria")} className="gap-1">
            <Landmark className="h-4 w-4" />
            <span className="hidden sm:inline">Tesoreria</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/azienda/scadenzario")} className="gap-1">
            <CalendarClock className="h-4 w-4" />
            <span className="hidden sm:inline">Scadenzario</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/azienda/prima-nota")} className="gap-1">
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Prima Nota</span>
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Esporta CSV</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1 hidden sm:flex">
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Stampa PDF</span>
          </Button>
        </div>
        </div>
      </div>

      {/* Saldo bancario reale */}
      {dataTruncated && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Sono stati caricati i primi 1.000 movimenti per tipologia: con volumi cosi' alti la
          proiezione potrebbe essere parziale.
        </div>
      )}
      {bankingSummaryError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Errore nel caricamento di saldo banca e KPI di cassa: i numeri in pagina potrebbero essere
            incompleti. Riprova prima di prendere decisioni.
          </span>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 border-red-300 text-red-700 hover:bg-red-100"
            onClick={() => refetchBanking()}
          >
            Riprova
          </Button>
        </div>
      )}
      {bankingSummary && (
        // Testata navy di famiglia. Formato euro standard it-IT ("52.942 €",
        // non "€52.942"): come nel resto del gestionale.
        <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
          <div className="bg-[#173b67] p-4 text-white sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)] sm:h-11 sm:w-11">
                <CalendarClock className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-100 sm:text-xs">Previsionale</p>
                <h2 className="mt-0.5 text-base font-semibold text-white sm:text-xl">La cassa che verrà</h2>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3 xl:grid-cols-4">
              {[
                { label: "Saldo banca", value: bankingSummary.bankBalance, icon: Landmark, tone: "text-blue-100", hint: "saldo reale conti" },
                { label: "Entrate attese", value: bankingSummary.pendingIncome, icon: TrendingUp, tone: "text-emerald-200", hint: "incassi aperti" },
                { label: "Uscite attese", value: bankingSummary.pendingExpenses, icon: TrendingDown, tone: "text-rose-300", hint: "pagamenti previsti" },
                { label: "Forecast 30gg", value: bankingSummary.forecast30, icon: CalendarClock, tone: bankingSummary.forecast30 >= 0 ? "text-emerald-200" : "text-rose-300", hint: "saldo stimato" },
              ].map((kpi) => (
                <NavyStatCard
                  key={kpi.label}
                  icon={kpi.icon}
                  label={kpi.label}
                  value={new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(kpi.value)}
                  sub={kpi.hint}
                  tone={kpi.tone}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Proiezione 90 giorni — su errore lo diciamo, prima falliva in silenzio
          e l'utente credeva che il grafico predittivo semplicemente non esistesse. */}
      {realDataError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          La proiezione a 90 giorni non è stata caricata per un errore. Ricarica la pagina; se
          persiste, il resto del previsionale sotto è comunque valido.
        </div>
      )}
      {realData && (
        <CashFlowProjectionChart
          projection={realData.projection}
          currentBalance={realData.currentBalance}
          hasBanking={realData.hasBanking}
        />
      )}

      {/* Tabs */}
      <Tabs defaultValue="incassato" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 w-full justify-start">
          <TabsTrigger value="incassato">Incassato</TabsTrigger>
          <TabsTrigger value="marginalita">Marginalità</TabsTrigger>
          <TabsTrigger value="costi">Previsionale Costi</TabsTrigger>
          <TabsTrigger value="cassa">Previsione di Cassa</TabsTrigger>
          <TabsTrigger value="settimane">13 settimane</TabsTrigger>
        </TabsList>

        <TabsContent value="incassato" className="mt-6">
          <CollectedTab orders={orders} expectedPayments={expectedPayments} />
        </TabsContent>

        <TabsContent value="marginalita" className="mt-6">
          <div>
            <MarginTab />
          </div>
        </TabsContent>

        <TabsContent value="costi" className="mt-6">
          <CostsForecastTab
            expectedExpenses={expectedExpenses}
            expectedCommissions={expectedCommissions}
            expectedSupplierPayments={expectedSupplierPayments}
            expectedCompanyCosts={expectedCompanyCosts}
          />
        </TabsContent>

        <TabsContent value="cassa" className="mt-6 space-y-6">
          <CashForecastTab
            companyId={companyId}
            stats={stats}
            expectedPayments={expectedPayments}
            expectedExpenses={expectedExpenses}
            expectedCommissions={expectedCommissions}
            expectedSupplierPayments={expectedSupplierPayments}
            expectedCompanyCosts={expectedCompanyCosts}
            scadenzeForForecast={scadenzeForForecast}
            primaNotaSaldo={primaNotaSaldo}
            bankBalance={bankingSummary?.bankBalance ?? null}
          />
          {/* AI Forecast unificato qui (prima era una tab a sé, ridondante con
              la previsione di cassa e col grafico in alto): la stima predittiva
              a 13 settimane vive accanto alla previsione manuale nella stessa
              vista. */}
          <div className="border-t pt-6">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <Sparkles className="h-4 w-4 text-orange-500" />
              Previsione AI (13 settimane)
            </h3>
            <SilvioCashflowForecast weeks={13} applyDelay={true} />
          </div>
        </TabsContent>

        <TabsContent value="settimane" className="mt-6">
          <TrediciSettimaneTab
            companyId={companyId}
            expectedPayments={expectedPayments}
            scadenzeForForecast={scadenzeForForecast}
            expectedCompanyCosts={expectedCompanyCosts}
            expectedExpenses={expectedExpenses}
            expectedCommissions={expectedCommissions}
            expectedSupplierPayments={expectedSupplierPayments}
            activeEmployees={activeEmployees}
            primaNotaSaldo={primaNotaSaldo}
            bankBalance={bankingSummary?.bankBalance ?? null}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
