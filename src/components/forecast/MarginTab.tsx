import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useTableSort } from "@/hooks/useTableSort";
import {
  TrendingUp, TrendingDown, AlertTriangle, Target, Building2,
  Calculator, Lightbulb, BarChart3, ArrowUpRight, ArrowDownRight,
  CircleDot, Gauge,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { useMarginData, type OrderMargin } from "@/hooks/useMarginData";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

function getMarginStatus(percent: number, threshold: number) {
  if (percent < 10) return { label: "Critico", color: "bg-red-500", textColor: "text-red-600", icon: "🔴" };
  if (percent < threshold) return { label: "Minimo", color: "bg-amber-500", textColor: "text-amber-600", icon: "🟡" };
  return { label: "Sano", color: "bg-emerald-500", textColor: "text-emerald-600", icon: "🟢" };
}

export function MarginTab() {
  const navigate = useNavigate();
  const data = useMarginData();
  const {
    isLoading, orders, avgMarginEur, avgMarginPercent,
    minMarginOrder, maxMarginOrder, stdDeviation,
    fixedCosts, totalFixedCostsMonthly, salariesMonthly,
    breakEvenRevenue, currentMonthlyRevenue, breakEvenDelta,
    companyId,
  } = data;

  // Threshold from localStorage
  const storageKey = companyId ? `margin-threshold-${companyId}` : "margin-threshold";
  const [threshold, setThreshold] = useState<number>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? Number(saved) : 30;
  });

  const handleThresholdChange = (val: string) => {
    const num = Math.max(0, Math.min(100, Number(val) || 0));
    setThreshold(num);
    localStorage.setItem(storageKey, String(num));
  };

  // Simulator state
  const [simMarginTarget, setSimMarginTarget] = useState<number>(0);
  const [simRevenueTarget, setSimRevenueTarget] = useState<number>(0);
  const [simFixedDelta, setSimFixedDelta] = useState<number>(0);
  const [simVarDelta, setSimVarDelta] = useState<number>(0);

  // Initialize simulator defaults when data loads
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!isLoading && avgMarginPercent > 0 && !initializedRef.current) {
      initializedRef.current = true;
      setSimMarginTarget(Math.round(avgMarginPercent));
      setSimRevenueTarget(Math.round(currentMonthlyRevenue));
    }
  }, [isLoading, avgMarginPercent, currentMonthlyRevenue]);

  // Alerts
  const alerts = useMemo(() => {
    if (isLoading || orders.length === 0) return [];
    const list: { icon: React.ReactNode; text: string; action: string; severity: "error" | "warn" }[] = [];

    if (avgMarginPercent < threshold) {
      list.push({
        icon: <AlertTriangle className="h-5 w-5" />,
        text: `Margine medio (${avgMarginPercent.toFixed(1)}%) sotto la soglia del ${threshold}%`,
        action: "Rivedi i prezzi di vendita o riduci i costi variabili",
        severity: "error",
      });
    }

    const lossOrders = orders.filter(o => o.grossMargin < 0);
    if (lossOrders.length > 0) {
      list.push({
        icon: <TrendingDown className="h-5 w-5" />,
        text: `${lossOrders.length} commess${lossOrders.length === 1 ? "a" : "e"} in perdita`,
        action: "Blocca nuove vendite sotto costo e rinegozia i contratti in essere",
        severity: "error",
      });
    }

    const highCostOrders = orders.filter(o => o.totalAmount > 0 && (o.totalVariableCosts / o.totalAmount) > 0.7);
    if (highCostOrders.length > 0) {
      list.push({
        icon: <Gauge className="h-5 w-5" />,
        text: `${highCostOrders.length} commess${highCostOrders.length === 1 ? "a" : "e"} con costi variabili > 70%`,
        action: "Rinegozia fornitori o riduci provvigioni",
        severity: "warn",
      });
    }

    if (breakEvenDelta < 0) {
      list.push({
        icon: <Target className="h-5 w-5" />,
        text: `Break even non coperto: mancano ${formatCurrency(Math.abs(breakEvenDelta))}/mese`,
        action: "Aumenta il volume vendite o riduci i costi fissi",
        severity: "error",
      });
    }

    const highRevLowMargin = orders.filter(o => o.totalAmount > 100000 && o.marginPercent < 15);
    if (highRevLowMargin.length > 0) {
      list.push({
        icon: <Lightbulb className="h-5 w-5" />,
        text: `${highRevLowMargin.length} commess${highRevLowMargin.length === 1 ? "a" : "e"} con fatturato alto ma margine < 15%`,
        action: "Verifica se il prezzo copre i costi reali e riallinea i listini",
        severity: "warn",
      });
    }

    return list;
  }, [orders, avgMarginPercent, threshold, breakEvenDelta, isLoading]);

  // Simulator calculations
  const simNewFixedCosts = totalFixedCostsMonthly + simFixedDelta;
  const simNewMargin = simMarginTarget + simVarDelta;
  const simNewBreakEven = simNewMargin > 0 ? simNewFixedCosts / (simNewMargin / 100) : 0;
  const simNewProfit = simRevenueTarget * (simNewMargin / 100) - simNewFixedCosts;
  const simCashFlowDelta = simNewProfit - (currentMonthlyRevenue * (avgMarginPercent / 100) - totalFixedCostsMonthly);

  const marginAccessors = useMemo(() => ({
    customerName: (o: OrderMargin) => o.customerName,
    orderCode: (o: OrderMargin) => o.orderCode || o.description || "",
    totalAmount: (o: OrderMargin) => o.totalAmount,
    totalVariableCosts: (o: OrderMargin) => o.totalVariableCosts,
    grossMargin: (o: OrderMargin) => o.grossMargin,
    marginPercent: (o: OrderMargin) => o.marginPercent,
    status: (o: OrderMargin) => getMarginStatus(o.marginPercent, threshold).label,
  }), [threshold]);

  const { sortConfig: marginSort, toggleSort: toggleMarginSort, sortedItems: sortedOrders } = useTableSort(orders, marginAccessors);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-20" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-6"><Skeleton className="h-64" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* === SECTION 1: KPI Cards === */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Margine Lordo Medio Aziendale
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Margine Medio €</p>
              <p className={`text-3xl font-bold mt-1 ${avgMarginEur >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {formatCurrency(avgMarginEur)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">per commessa</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Margine Medio %</p>
              <p className={`text-3xl font-bold mt-1 ${avgMarginPercent >= threshold ? "text-emerald-600" : avgMarginPercent >= 10 ? "text-amber-600" : "text-red-600"}`}>
                {avgMarginPercent.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">soglia: {threshold}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Margine Minimo</p>
              <p className="text-3xl font-bold mt-1 text-red-600">
                {minMarginOrder ? `${minMarginOrder.marginPercent.toFixed(1)}%` : "N/D"}
              </p>
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {minMarginOrder?.orderCode || minMarginOrder?.customerName || ""}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Margine Massimo</p>
              <p className="text-3xl font-bold mt-1 text-emerald-600">
                {maxMarginOrder ? `${maxMarginOrder.marginPercent.toFixed(1)}%` : "N/D"}
              </p>
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {maxMarginOrder?.orderCode || maxMarginOrder?.customerName || ""}
              </p>
            </CardContent>
          </Card>
        </div>
        {/* Std Deviation */}
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <CircleDot className="h-4 w-4" />
          Deviazione standard: <span className="font-medium">{stdDeviation.toFixed(1)}%</span>
          {" — "}
          {stdDeviation < 10
            ? <span className="text-emerald-600">Vendite coerenti tra loro</span>
            : stdDeviation < 20
            ? <span className="text-amber-600">Margini moderatamente variabili</span>
            : <span className="text-red-600">Margini inconsistenti: attenzione!</span>}
        </div>
      </div>

      {/* === SECTION 2: Order Table === */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Marginalità per Commessa
          </h2>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Soglia margine sano:</span>
            <Input
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => handleThresholdChange(e.target.value)}
              className="w-20 h-8 text-center"
            />
            <span className="text-muted-foreground">%</span>
          </div>
        </div>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead column="customerName" label="Cliente" sortConfig={marginSort} onSort={toggleMarginSort} />
                <SortableTableHead column="orderCode" label="Commessa" sortConfig={marginSort} onSort={toggleMarginSort} />
                <SortableTableHead column="totalAmount" label="Fatt. Imp." sortConfig={marginSort} onSort={toggleMarginSort} className="text-right" />
                <SortableTableHead column="totalVariableCosts" label="Costi Var." sortConfig={marginSort} onSort={toggleMarginSort} className="text-right" />
                <SortableTableHead column="grossMargin" label="Margine €" sortConfig={marginSort} onSort={toggleMarginSort} className="text-right" />
                <SortableTableHead column="marginPercent" label="Margine %" sortConfig={marginSort} onSort={toggleMarginSort} className="text-right" />
                <SortableTableHead column="status" label="Stato" sortConfig={marginSort} onSort={toggleMarginSort} className="text-center" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nessuna commessa trovata
                  </TableCell>
                </TableRow>
              ) : (
                sortedOrders.map((order) => {
                  const status = getMarginStatus(order.marginPercent, threshold);
                  return (
                    <TableRow
                      key={order.orderId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/azienda/ordini/${order.orderId}`)}
                    >
                      <TableCell className="font-medium">{order.customerName}</TableCell>
                      <TableCell>{order.orderCode || order.description?.substring(0, 30)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(order.totalAmount)}</TableCell>
                      <TableCell className="text-right text-red-600">{formatCurrency(order.totalVariableCosts)}</TableCell>
                      <TableCell className={`text-right font-semibold ${order.grossMargin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {formatCurrency(order.grossMargin)}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${status.textColor}`}>
                        {order.marginPercent.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="gap-1">
                          {status.icon} {status.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* === SECTION 3 & 4: Fixed Costs + Break Even === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fixed Costs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-primary" />
              Costi Fissi Mensili
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {salariesMonthly > 0 && (
              <div className="flex justify-between">
                <span className="text-sm">Stipendi dipendenti</span>
                <span className="font-medium">{formatCurrency(salariesMonthly)}</span>
              </div>
            )}
            {fixedCosts.map((cost) => (
              <div key={cost.category} className="flex justify-between">
                <span className="text-sm">{cost.category}</span>
                <span className="font-medium">{formatCurrency(cost.amount)}</span>
              </div>
            ))}
            {(fixedCosts.length === 0 && salariesMonthly === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nessun costo fisso registrato
              </p>
            )}
            <Separator />
            <div className="flex justify-between font-bold text-lg">
              <span>Totale Mensile</span>
              <span className="text-red-600">{formatCurrency(totalFixedCostsMonthly)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Break Even */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-5 w-5 text-primary" />
              Punto di Pareggio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Per andare in pareggio devi fatturare</p>
              <p className="text-3xl font-bold mt-1">{formatCurrency(breakEvenRevenue)}</p>
              <p className="text-xs text-muted-foreground">al mese</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Oggi stai fatturando in media</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(currentMonthlyRevenue)}</p>
              <p className="text-xs text-muted-foreground">al mese</p>
            </div>
            <Separator />
            <div className={`flex items-center gap-3 p-3 rounded-lg ${breakEvenDelta >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30"}`}>
              {breakEvenDelta >= 0 ? (
                <ArrowUpRight className="h-6 w-6 text-emerald-600" />
              ) : (
                <ArrowDownRight className="h-6 w-6 text-red-600" />
              )}
              <div>
                <p className={`text-xl font-bold ${breakEvenDelta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {breakEvenDelta >= 0 ? "+" : ""}{formatCurrency(breakEvenDelta)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {breakEvenDelta >= 0
                    ? "Surplus rispetto al pareggio 👍"
                    : "Ti mancano questi soldi per coprire i costi"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* === SECTION 5: CFO Alerts === */}
      {alerts.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Alert Intelligenti
          </h2>
          <div className="space-y-3">
            {alerts.map((alert, i) => (
              <Card key={i} className={alert.severity === "error" ? "border-red-200 dark:border-red-900" : "border-amber-200 dark:border-amber-900"}>
                <CardContent className="p-4 flex items-start gap-3">
                  <div className={alert.severity === "error" ? "text-red-600" : "text-amber-600"}>
                    {alert.icon}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{alert.text}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      💡 {alert.action}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* === SECTION 6: Simulator === */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          Simulatore Strategico
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Inputs */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Parametri</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground">Margine target %</label>
                <Input
                  type="number"
                  value={simMarginTarget}
                  onChange={(e) => setSimMarginTarget(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Fatturato target mensile €</label>
                <Input
                  type="number"
                  value={simRevenueTarget}
                  onChange={(e) => setSimRevenueTarget(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Variazione costi fissi €/mese</label>
                <Input
                  type="number"
                  value={simFixedDelta}
                  onChange={(e) => setSimFixedDelta(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Variazione margine % (punti)</label>
                <Input
                  type="number"
                  value={simVarDelta}
                  onChange={(e) => setSimVarDelta(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Outputs */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Risultato Simulazione</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="text-sm text-muted-foreground">Nuovo punto di pareggio</p>
                <p className="text-2xl font-bold">{formatCurrency(simNewBreakEven)}</p>
                <p className="text-xs text-muted-foreground">al mese</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Utile previsto mensile</p>
                <p className={`text-2xl font-bold ${simNewProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {formatCurrency(simNewProfit)}
                </p>
              </div>
              <Separator />
              <div className={`p-3 rounded-lg ${simCashFlowDelta >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30"}`}>
                <p className="text-sm text-muted-foreground">Impatto su cash flow vs attuale</p>
                <p className={`text-xl font-bold ${simCashFlowDelta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {simCashFlowDelta >= 0 ? "+" : ""}{formatCurrency(simCashFlowDelta)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
