import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calculateNetFromGross } from "@/lib/vatUtils";
import { calculateStoredCommissionNet } from "@/lib/commissions";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

/**
 * OrderEconomicsSummary — conto economico "a colpo d'occhio" in cima alla commessa.
 *
 * Riusa ESATTAMENTE la formula del consuntivo di OrderEconomics.tsx (tab Finanza)
 * così i numeri combaciano: Ricavo NET = total_amount; Costi NET = articoli
 * (purchase_price×qty scorporato) + manodopera (dipendenti NET + squadre scorporate)
 * + provvigioni (commission−deduction) + errori (order_errors.amount).
 * Margine = Ricavo − Costi; Margine% = margine/ricavo.
 *
 * Donut in CSS puro (conic-gradient): nessuna libreria grafica → non può crashare
 * il rendering (lezione: recharts ResponsiveContainer height="100%" buttava giù la
 * pagina). Componente OrderEconomics originale lasciato intatto (no regressioni).
 */

interface EconItem {
  name?: string;
  purchase_price?: number | null;
  quantity: number;
  vat_rate?: number | null;
}

interface OrderEconomicsSummaryProps {
  orderId: string;
  totalAmount: number;
  vatRate: number;
  items: EconItem[];
  collectedAmount: number; // NET già incassato (calcolato da OrderDetail)
  /** true mentre la query order_items del genitore è in corso: evita di mostrare
   *  un "Margine 100% / Costi 0" fuorviante prima che i costi articoli arrivino. */
  itemsLoading?: boolean;
}

const CHART = {
  articoli: "hsl(var(--chart-1))",
  manodopera: "hsl(var(--chart-4))",
  provvigioni: "hsl(var(--chart-3))",
  errori: "hsl(var(--chart-5))",
  margine: "hsl(var(--chart-2))",
};

export function OrderEconomicsSummary({
  orderId,
  totalAmount,
  vatRate,
  items,
  collectedAmount,
  itemsLoading = false,
}: OrderEconomicsSummaryProps) {
  void vatRate; // tenuto per parità d'interfaccia col conto economico esistente

  const { data: employees = [], isPending: empPending } = useQuery({
    queryKey: ["oes-employees", orderId], // chiave DEDICATA: non condividere la cache di OrderLaborCosts/OrderEconomics (select diversi → dati incompleti → crash)
    enabled: !!orderId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_employees")
        .select("total_cost")
        .eq("order_id", orderId);
      if (error) throw error;
      return (data ?? []) as { total_cost: number }[];
    },
  });

  const { data: teams = [], isPending: teamsPending } = useQuery({
    queryKey: ["oes-external-teams", orderId], // chiave DEDICATA (vedi sopra)
    enabled: !!orderId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_external_teams")
        .select("total_cost, vat_rate")
        .eq("order_id", orderId);
      if (error) throw error;
      return (data ?? []) as { total_cost: number; vat_rate: number | null }[];
    },
  });

  const { data: salespeople = [], isPending: spPending } = useQuery({
    queryKey: ["oes-salespeople", orderId], // chiave DEDICATA: non condividere la cache di OrderCommissions/OrderEconomics
    enabled: !!orderId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_salespeople")
        .select("commission_amount, deduction_amount")
        .eq("order_id", orderId);
      if (error) throw error;
      return (data ?? []) as { commission_amount: number; deduction_amount: number }[];
    },
  });

  const { data: errors = [], isPending: errPending } = useQuery({
    queryKey: ["oes-errors", orderId], // chiave DEDICATA (vedi sopra)
    enabled: !!orderId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_errors")
        .select("amount")
        .eq("order_id", orderId);
      if (error) throw error;
      return (data ?? []) as { amount: number }[];
    },
  });

  // CONSUNTIVO materiali = somma degli ordini fornitore (ODA) realmente emessi.
  const { data: oda = [], isPending: odaPending } = useQuery({
    queryKey: ["oes-oda", orderId], // chiave DEDICATA
    enabled: !!orderId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("subtotal")
        .eq("order_id", orderId);
      if (error) throw error;
      return (data ?? []) as { subtotal: number | null }[];
    },
  });

  // Variazioni approvate (OdV) = extra del consuntivo.
  const { data: variazioni = [] } = useQuery({
    queryKey: ["oes-variazioni", orderId], // chiave DEDICATA
    enabled: !!orderId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordini_variazione")
        .select("impatto_economico, status")
        .eq("order_id", orderId)
        .eq("status", "approvato");
      if (error) throw error;
      return (data ?? []) as { impatto_economico: number | null; status: string }[];
    },
  });

  const econ = useMemo(() => {
    const itemsNet = (items ?? [])
      .filter((i) => i.purchase_price && i.purchase_price > 0)
      .reduce((sum, i) => {
        const gross = (i.purchase_price || 0) * (i.quantity || 0);
        const { netAmount } = calculateNetFromGross(gross, i.vat_rate ?? 22);
        return sum + netAmount;
      }, 0);

    const employeesNet = employees.reduce((s, e) => s + (e.total_cost || 0), 0);
    const teamsNet = teams.reduce((s, t) => {
      const { netAmount } = calculateNetFromGross(t.total_cost || 0, t.vat_rate ?? 22);
      return s + netAmount;
    }, 0);
    const laborNet = employeesNet + teamsNet;

    const commissions = salespeople.reduce(
      (s, sp) => s + calculateStoredCommissionNet(sp.commission_amount, sp.deduction_amount),
      0,
    );
    const errorsTot = errors.reduce((s, e) => s + (e.amount || 0), 0);

    const costsTot = itemsNet + laborNet + commissions + errorsTot;
    const margin = totalAmount - costsTot;
    const marginPct = totalAmount > 0 ? (margin / totalAmount) * 100 : 0;
    // Margine "atteso" coi soli materiali (prima di manodopera/provvigioni/errori):
    // mostra quanto i costi operativi erodono il margine di partenza.
    const attesoMaterialiPct = totalAmount > 0 ? ((totalAmount - itemsNet) / totalAmount) * 100 : 0;

    return { itemsNet, laborNet, commissions, errorsTot, costsTot, margin, marginPct, attesoMaterialiPct };
  }, [items, employees, teams, salespeople, errors, totalAmount]);

  // ── PREVISIONALE vs CONSUNTIVO (costi materiali) ────────────────────────────
  // Previsionale = costo materiali PIANIFICATO (order_items.purchase_price × qty,
  // come inserito). Consuntivo = costo materiali REALE = somma ODA fornitore emessi
  // (subtotal, netto) + variazioni approvate. Confronto sui valori "come inseriti"
  // (niente scorporo differenziale) → scostamento leggibile: "ho ordinato più del
  // preventivato?". È il controllo costi pianificato→reale chiesto dall'utente.
  const consuntivo = useMemo(() => {
    const materialiPianificati = (items ?? []).reduce(
      (s, i) => s + (Number(i.purchase_price) || 0) * (Number(i.quantity) || 0),
      0,
    );
    const materialiOrdinati = oda.reduce((s, o) => s + (Number(o.subtotal) || 0), 0);
    const odaCount = oda.length;
    const variazioniTot = variazioni.reduce((s, v) => s + (Number(v.impatto_economico) || 0), 0);
    const scostamento = materialiOrdinati + variazioniTot - materialiPianificati;
    const scostamentoPct = materialiPianificati > 0 ? (scostamento / materialiPianificati) * 100 : 0;

    // MARGINE CONSUNTIVO unificato con Controllo di Gestione (vista v_ordine_marginalita):
    // costo = materiali REALI (ODA, subtotal netto) + manodopera (total_cost grezzo) +
    // provvigioni nette (max(commission−deduction,0)) + errori; ricavo = total + variazioni.
    // Stesse formule della vista → stesso margine consuntivo su commessa e CG.
    const laborRaw =
      employees.reduce((s, e) => s + (Number(e.total_cost) || 0), 0) +
      teams.reduce((s, t) => s + (Number(t.total_cost) || 0), 0);
    const commissionsRaw = salespeople.reduce(
      (s, sp) => s + calculateStoredCommissionNet(sp.commission_amount, sp.deduction_amount),
      0,
    );
    const errorsRaw = errors.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const ricavoTot = totalAmount + variazioniTot;
    const consuntivoCost = materialiOrdinati + laborRaw + commissionsRaw + errorsRaw;
    const consuntivoMargin = ricavoTot - consuntivoCost;
    const consuntivoMarginPct = ricavoTot > 0 ? (consuntivoMargin / ricavoTot) * 100 : 0;

    return {
      materialiPianificati, materialiOrdinati, odaCount, variazioniTot, scostamento, scostamentoPct,
      consuntivoCost, consuntivoMargin, consuntivoMarginPct,
    };
  }, [items, oda, variazioni, employees, teams, salespeople, errors, totalAmount]);

  const composition = useMemo(
    () =>
      [
        { key: "articoli", label: "Articoli", value: econ.itemsNet, color: CHART.articoli },
        { key: "manodopera", label: "Manodopera", value: econ.laborNet, color: CHART.manodopera },
        { key: "provvigioni", label: "Provvigioni", value: econ.commissions, color: CHART.provvigioni },
        { key: "errori", label: "Errori/perdite", value: econ.errorsTot, color: CHART.errori },
        ...(econ.margin > 0
          ? [{ key: "margine", label: "Margine", value: econ.margin, color: CHART.margine }]
          : []),
      ].filter((d) => d.value > 0),
    [econ],
  );

  // Donut in CSS puro: stops del conic-gradient dalle percentuali della composizione.
  const donutGradient = useMemo(() => {
    const tot = composition.reduce((s, d) => s + d.value, 0);
    if (tot <= 0) return null;
    let acc = 0;
    const stops = composition.map((d) => {
      const start = (acc / tot) * 360;
      acc += d.value;
      const end = (acc / tot) * 360;
      return `${d.color} ${start}deg ${end}deg`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  }, [composition]);

  const marginColor =
    econ.marginPct >= 30
      ? "text-emerald-600 dark:text-emerald-400"
      : econ.marginPct >= 20
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";
  const marginBadge =
    econ.marginPct >= 30
      ? "bg-emerald-100 text-emerald-700 border-emerald-300"
      : econ.marginPct >= 20
        ? "bg-amber-100 text-amber-700 border-amber-300"
        : "bg-red-100 text-red-700 border-red-300";

  const dueAmount = Math.max(0, totalAmount - collectedAmount);
  const collectedPct = totalAmount > 0 ? Math.min(100, (collectedAmount / totalAmount) * 100) : 0;

  // Finché una qualsiasi fonte di costo è in caricamento (articoli dal genitore,
  // o dipendenti/squadre/provvigioni/errori), i costi sarebbero parziali → il
  // margine apparirebbe gonfiato (es. "100%"). Mostriamo uno skeleton: la card
  // di testata non deve MAI lampeggiare numeri sbagliati.
  const costsLoading = itemsLoading || empPending || teamsPending || spPending || errPending || odaPending;
  if (costsLoading) {
    return (
      <Card className="border-l-4 border-l-orange-400">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Conto economico
          </CardTitle>
          <Skeleton className="h-5 w-20 rounded-full" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-[1fr_200px] md:items-center">
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
            <div className="flex h-[160px] items-center justify-center">
              <Skeleton className="h-[140px] w-[140px] rounded-full" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-l-4 border-l-orange-400">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {econ.margin >= 0 ? (
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
          Conto economico
        </CardTitle>
        <Badge variant="outline" className={`text-xs font-semibold ${marginBadge}`}>
          Margine {econ.marginPct.toFixed(1)}%
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-[1fr_200px] md:items-center">
          {/* KPI + cassa */}
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Kpi label="Ricavi" value={formatCurrency(totalAmount)} hint="imponibile" />
              <Kpi label="Costi" value={formatCurrency(econ.costsTot)} hint="netto" />
              <Kpi
                label="Margine lordo"
                value={formatCurrency(econ.margin)}
                valueClass={marginColor}
                hint={econ.margin < 0 ? "in perdita" : "netto"}
              />
            </div>

            {econ.costsTot > econ.itemsNet && econ.margin >= 0 && (
              <p className="text-xs text-muted-foreground">
                Margine pianificato: su soli materiali{" "}
                <strong className="text-foreground">{econ.attesoMaterialiPct.toFixed(1)}%</strong> → completo{" "}
                <strong className={marginColor}>{econ.marginPct.toFixed(1)}%</strong>{" "}
                <span className="text-amber-600 dark:text-amber-400">
                  (manodopera/provvigioni/errori: −{formatCurrency(econ.costsTot - econ.itemsNet)})
                </span>
              </p>
            )}

            {/* Pianificato vs Consuntivo materiali: costo preventivato vs realmente
                ordinato ai fornitori (ODA) + variazioni. Controllo sovracosti. */}
            <div className="rounded-lg border bg-muted/20 p-2.5 text-xs">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-medium text-foreground">Materiali: pianificato vs consuntivo</span>
                {consuntivo.odaCount > 0 && (
                  <span className="text-muted-foreground">{consuntivo.odaCount} ODA emessi</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Pianificato</span>
                <span>{formatCurrency(consuntivo.materialiPianificati)}</span>
              </div>
              {consuntivo.odaCount > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Ordinato ai fornitori</span>
                    <span className="font-medium">{formatCurrency(consuntivo.materialiOrdinati)}</span>
                  </div>
                  {consuntivo.variazioniTot !== 0 && (
                    <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                      <span>Variazioni approvate</span>
                      <span>
                        {consuntivo.variazioniTot > 0 ? "+" : ""}
                        {formatCurrency(consuntivo.variazioniTot)}
                      </span>
                    </div>
                  )}
                  <div className="mt-1 flex items-center justify-between border-t pt-1">
                    <span className="text-muted-foreground">Scostamento</span>
                    <span
                      className={`font-semibold ${
                        consuntivo.scostamento > 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {consuntivo.scostamento > 0 ? "+" : ""}
                      {formatCurrency(consuntivo.scostamento)}
                      {Math.abs(consuntivo.scostamentoPct) >= 0.1 &&
                        ` (${consuntivo.scostamento > 0 ? "+" : ""}${consuntivo.scostamentoPct.toFixed(1)}%)`}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between border-t pt-1.5">
                    <span className="font-medium text-foreground">
                      Margine consuntivo (reale)
                      <span className="ml-1 font-normal text-muted-foreground">· come Controllo di Gestione</span>
                    </span>
                    <span
                      className={`font-semibold ${
                        consuntivo.consuntivoMarginPct >= 20
                          ? "text-emerald-600 dark:text-emerald-400"
                          : consuntivo.consuntivoMarginPct >= 0
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {formatCurrency(consuntivo.consuntivoMargin)} · {consuntivo.consuntivoMarginPct.toFixed(1)}%
                    </span>
                  </div>
                </>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  Nessun ordine fornitore (ODA) ancora emesso → consuntivo materiali in corso.
                </p>
              )}
            </div>

            {/* Cassa */}
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-emerald-600 dark:text-emerald-400">
                  Incassato {formatCurrency(collectedAmount)}
                </span>
                <span className="text-muted-foreground">
                  Da incassare {formatCurrency(dueAmount)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${collectedPct}%` }}
                />
              </div>
            </div>

            {(items?.length ?? 0) > 0 && (econ.itemsNet === 0 || econ.laborNet === 0) && econ.margin >= 0 && (
              <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Margine consuntivo <strong>parziale</strong>: mancano i costi{" "}
                  {[econ.itemsNet === 0 ? "articoli" : null, econ.laborNet === 0 ? "manodopera" : null]
                    .filter(Boolean)
                    .join(" e ")}{" "}
                  → il margine reale sarà più basso.
                </span>
              </p>
            )}
            {econ.errorsTot > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Errori/perdite registrati: {formatCurrency(econ.errorsTot)} — incidono sul margine.
              </p>
            )}
            {econ.margin < 0 && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Commessa in perdita: i costi superano i ricavi.
              </p>
            )}
          </div>

          {/* Donut composizione (CSS puro, nessuna libreria → non può crashare) */}
          <div className="flex h-[160px] items-center justify-center">
            {donutGradient ? (
              <div
                className="relative h-[140px] w-[140px] rounded-full"
                style={{ background: donutGradient }}
                aria-label={`Margine ${econ.marginPct.toFixed(0)}%`}
              >
                <div className="absolute inset-[22px] flex flex-col items-center justify-center rounded-full bg-card">
                  <span className={`text-lg font-bold leading-none ${marginColor}`}>
                    {econ.marginPct.toFixed(0)}%
                  </span>
                  <span className="text-[10px] text-muted-foreground">margine</span>
                </div>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Dati costi non ancora disponibili</span>
            )}
          </div>
        </div>

        {/* Legenda composizione */}
        {composition.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            {composition.map((d) => (
              <span key={d.key} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
                <span className="text-muted-foreground">{d.label}</span>
                <span className="font-medium">{formatCurrency(d.value)}</span>
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({
  label,
  value,
  hint,
  valueClass,
}: {
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-base font-bold leading-tight ${valueClass ?? ""}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
