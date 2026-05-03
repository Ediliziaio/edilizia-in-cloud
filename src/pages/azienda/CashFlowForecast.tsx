import { format } from "date-fns";
import { Download, Printer, CalendarClock, BookOpen, Landmark, TrendingUp, TrendingDown } from "lucide-react";
import { exportToCSV } from "@/lib/csvExport";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCashFlowData } from "@/hooks/useCashFlowData";
import { CollectedTab } from "@/components/forecast/CollectedTab";
import { CostsForecastTab } from "@/components/forecast/CostsForecastTab";
import { CashForecastTab } from "@/components/forecast/CashForecastTab";
import { TreasuryTab } from "@/components/forecast/TreasuryTab";
import { MarginTab } from "@/components/forecast/MarginTab";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCashFlowRealData } from "@/hooks/useCashFlowRealData";
import { CashFlowProjectionChart } from "@/components/forecast/CashFlowProjectionChart";
import { OperationalKpiCard } from "@/components/orders/OperationalKpiCard";


export default function CashFlowForecast() {
  const navigate = useNavigate();

  const {
    isLoading,
    orders,
    expectedPayments,
    expectedExpenses,
    expectedCommissions,
    expectedSupplierPayments,
    expectedCompanyCosts,
    stats,
    paidCompanyCosts,
    paidExternalTeams,
    paidCommissions,
    paidSupplierItems,
    activeEmployees,
    treasuryCategories,
    companyId,
    scadenzeForForecast,
    primaNotaSaldo,
  } = useCashFlowData();

  // Proiezione 90 giorni con dati reali banking + fatture
  const { data: realData } = useCashFlowRealData(companyId);

  // Dati bancari reali: saldo attuale + entrate/uscite previste
  const { data: bankingSummary } = useQuery({
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
          .select("total, paid_amount")
          .eq("company_id", companyId!)
          .not("status", "in", '("paid","cancelled","draft")'),
        supabase
          .from("purchase_orders")
          .select("total")
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

      return {
        bankBalance,
        pendingIncome,
        pendingExpenses,
        forecast30: bankBalance + pendingIncome - pendingExpenses,
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

  if (!orders && !isLoading) {
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
            <p className="text-center text-muted-foreground py-8">
              Errore nel caricamento dei dati. Riprova aggiornando la pagina.
            </p>
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
      {bankingSummary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Saldo Banca", value: bankingSummary.bankBalance, icon: Landmark, tone: "blue" as const, hint: "saldo reale conti" },
            { label: "Entrate Attese", value: bankingSummary.pendingIncome, icon: TrendingUp, tone: "green" as const, hint: "incassi aperti" },
            { label: "Uscite Attese", value: bankingSummary.pendingExpenses, icon: TrendingDown, tone: "red" as const, hint: "pagamenti previsti" },
            { label: "Forecast 30gg", value: bankingSummary.forecast30, icon: CalendarClock, tone: bankingSummary.forecast30 >= 0 ? "green" as const : "red" as const, hint: "saldo stimato" },
          ].map((kpi) => (
            <OperationalKpiCard
              key={kpi.label}
              icon={kpi.icon}
              label={kpi.label}
              value={`€${kpi.value.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
              hint={kpi.hint}
              tone={kpi.tone}
            />
          ))}
        </div>
      )}

      {/* Proiezione 90 giorni */}
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
          <TabsTrigger value="tesoreria">Tesoreria</TabsTrigger>
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

        <TabsContent value="cassa" className="mt-6">
          <CashForecastTab
            stats={stats}
            expectedPayments={expectedPayments}
            expectedExpenses={expectedExpenses}
            expectedCommissions={expectedCommissions}
            expectedSupplierPayments={expectedSupplierPayments}
            expectedCompanyCosts={expectedCompanyCosts}
            scadenzeForForecast={scadenzeForForecast}
            primaNotaSaldo={primaNotaSaldo}
          />
        </TabsContent>

        <TabsContent value="tesoreria" className="mt-6">
          <TreasuryTab
            orders={orders}
            paidCompanyCosts={paidCompanyCosts}
            paidExternalTeams={paidExternalTeams}
            paidCommissions={paidCommissions}
            paidSupplierItems={paidSupplierItems}
            activeEmployees={activeEmployees}
            treasuryCategories={treasuryCategories}
            companyId={companyId}
            expectedPayments={expectedPayments}
            expectedExpenses={expectedExpenses}
            expectedCommissions={expectedCommissions}
            expectedSupplierPayments={expectedSupplierPayments}
            expectedCompanyCosts={expectedCompanyCosts}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
