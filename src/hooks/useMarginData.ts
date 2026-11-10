// ============================================================================
// useMarginData — analisi margini commesse (MarginTab, PuntoDiPareggio)
// ============================================================================
// FONTE UNICA: v_ordine_marginalita — la stessa vista di scheda commessa e
// Controllo di Gestione. Prima questo hook rifaceva i conti per conto suo
// scorporando l'IVA da purchase_price/total_cost (che per convenzione sono
// GIÀ imponibili in tutta l'app): terzo margine diverso sulle stesse commesse.
// Ora un margine solo, ovunque.
// ============================================================================
import { partiPerCategoria } from "@/lib/costi/partiPerCategoria";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { loadArchivedOrderIds, excludeArchivedOrders } from "@/lib/orders/archivedOrderScope";
import { readAllOrderRows } from "@/lib/orders/listScope";
import { dataVendita, fatturatoMedioMensile } from "@/lib/dataVendita";
import { useAuth } from "@/contexts/AuthContext";
import { recurrenceMultiplier } from "@/lib/forecastTypes";
import { queryKeys } from "@/lib/queryKeys";
import { costoMensileVero } from "@/lib/costoPersonale";
import { quotaNonRipartita } from "@/lib/controlloGestione/strutturaCommessa";
import { useParametriCostoPersonale } from "@/hooks/useParametriCostoPersonale";

export interface OrderMargin {
  orderId: string;
  orderCode: string | null;
  customerName: string;
  description: string;
  totalAmount: number; // imponibile (preventivo + variazioni approvate)
  vatRate: number;
  grossRevenue: number; // lordo con IVA (indicativo)
  itemsCostNet: number; // acquisti ODA + materiali da scorta + errori + costi diretti
  teamsCostNet: number; // manodopera interna + squadre esterne
  commissions: number;
  totalVariableCosts: number; // = consuntivo della vista
  grossMargin: number;
  marginPercent: number;
}

export interface FixedCostBreakdown {
  category: string;
  amount: number;
}

export interface MarginData {
  isLoading: boolean;
  isError: boolean;
  orders: OrderMargin[];
  // KPIs
  avgMarginEur: number;
  avgMarginPercent: number;
  minMarginOrder: OrderMargin | null;
  maxMarginOrder: OrderMargin | null;
  stdDeviation: number;
  // Fixed costs
  fixedCosts: FixedCostBreakdown[];
  totalFixedCostsMonthly: number;
  salariesMonthly: number;
  // Break even
  breakEvenRevenue: number;
  breakEvenAnnual: number;
  breakEvenMonthOfYear: number; // 1-12 = mese da cui guadagni per te; >12 = non raggiunto
  currentMonthlyRevenue: number;
  breakEvenDelta: number;
  // Company context
  companyId: string | null;
}

interface MarginViewRow {
  id: string;
  order_code: string | null;
  description: string | null;
  cliente_nome: string | null;
  created_at: string | null;
  preventivo_totale: number | null;
  consuntivo: number | null;
  costo_acquisti: number | null;
  costo_materiali_magazzino: number | null;
  costo_errori: number | null;
  costo_manodopera: number | null;
  costo_provvigioni: number | null;
  costo_diretto: number | null;
  margine: number | null;
  margine_perc: number | null;
}

export function useMarginData(): MarginData {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id || null;

  // 1. Marginalità per commessa dalla vista condivisa (ultimi 24 mesi)
  const { data: ordersRaw, isLoading: loadingOrders, isError: errOrders } = useQuery({
    queryKey: queryKeys.margin.orders(companyId),
    queryFn: async (): Promise<MarginViewRow[]> => {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 24);
      const archivedIds = await loadArchivedOrderIds(companyId!);
      // 08/11/2026: tutte le commesse dei 24 mesi, a pagine. Prima il limite di 500 righe
      // si fermava alle ultime 500 e il margine medio del pareggio era il loro.
      return readAllOrderRows<MarginViewRow>((from, to) => excludeArchivedOrders((supabase as any)
        .from("v_ordine_marginalita")
        .select("id, order_code, description, cliente_nome, created_at, preventivo_totale, consuntivo, costo_acquisti, costo_materiali_magazzino, costo_errori, costo_manodopera, costo_provvigioni, costo_diretto, margine, margine_perc")
        .eq("company_id", companyId!)
        .gte("created_at", cutoff.toISOString())
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to), archivedIds));
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // 1b. In che mese è stata venduta ogni commessa (08/11/2026): la data più antica che porta
  // con sé, non solo created_at. Chi importa lo storico crea tutto in un giorno (vedi dataVendita).
  const { data: giorniVendita } = useQuery({
    queryKey: [...queryKeys.margin.orders(companyId), "giorni-vendita"],
    queryFn: async (): Promise<Map<string, string | null>> => {
      type Ordine = { id: string; created_at: string | null; work_start_date: string | null; deposit_expected_date: string | null; deposit_paid_date: string | null };
      type Rata = { id: string; order_id: string; expected_date: string | null; paid_date: string | null };
      const [ordini, rate] = await Promise.all([
        readAllOrderRows<Ordine>((from, to) => supabase.from("orders")
          .select("id, created_at, work_start_date, deposit_expected_date, deposit_paid_date")
          .eq("company_id", companyId!).is("deleted_at", null).order("id").range(from, to)),
        readAllOrderRows<Rata>((from, to) => supabase.from("order_installments")
          .select("id, order_id, expected_date, paid_date, order:orders!inner(company_id)")
          .eq("order.company_id", companyId!).order("id").range(from, to) as unknown as PromiseLike<{ data: Rata[] | null; error: unknown }>),
      ]);
      const dateRate = new Map<string, string[]>();
      for (const r of rate) {
        const d = [r.expected_date, r.paid_date].filter((x): x is string => !!x);
        dateRate.set(r.order_id, [...(dateRate.get(r.order_id) ?? []), ...d]);
      }
      return new Map(ordini.map((o) => [o.id, dataVendita(o, dateRate.get(o.id))]));
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // 2. Fixed company costs (amount è GIÀ imponibile: niente scorporo)
  const { data: fixedCostsRaw, isLoading: loadingFixedCosts, isError: errFixedCosts } = useQuery({
    queryKey: queryKeys.margin.fixedCosts(companyId),
    queryFn: async () => {
      // A pagine (08/11/2026): oltre mille costi fissi PostgREST tagliava in silenzio.
      return readAllOrderRows((from, to) => supabase
        .from("company_costs")
        .select("id, amount, category, recurrence, recurrence_end_date, allocations, quota_magazzino, ripartizione_categorie")
        .eq("company_id", companyId!)
        .eq("cost_type", "fixed")
        // Un costo con order_id è già nel consuntivo diretto della commessa:
        // ripeterlo nel break-even/struttura lo conterebbe due volte. Lo stesso
        // vale per la quota ripartita sulle commesse (quotaNonRipartita).
        .is("order_id", null)
        .or(`recurrence_end_date.is.null,recurrence_end_date.gte.${new Date().toLocaleDateString("en-CA")}`)
        .order("id")
        .range(from, to));
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: parametriCosto } = useParametriCostoPersonale();

  // 3. Active employees (salaries + oneri, come nel resto dell'app)
  const { data: employees, isLoading: loadingEmployees, isError: errEmployees } = useQuery({
    queryKey: queryKeys.margin.employees(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("gross_salary, inps_rate, role_type, qualifica, area, profilo_costo")
        .eq("company_id", companyId!)
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = loadingOrders || loadingFixedCosts || loadingEmployees;
  const isError = errOrders || errFixedCosts || errEmployees;

  // --- Calculations ---

  // Per-order margin: numeri PRESI dalla vista, non ricalcolati.
  const orders: OrderMargin[] = (ordersRaw || []).map((v) => {
    const totalAmount = Number(v.preventivo_totale) || 0;
    const itemsCostNet =
      (Number(v.costo_acquisti) || 0)
      + (Number(v.costo_materiali_magazzino) || 0)
      + (Number(v.costo_errori) || 0)
      + (Number(v.costo_diretto) || 0);
    const teamsCostNet = Number(v.costo_manodopera) || 0;
    const commissions = Number(v.costo_provvigioni) || 0;
    const totalVariableCosts = Number(v.consuntivo) || 0;
    const grossMargin = Number(v.margine) || 0;
    const marginPercent = Number(v.margine_perc) || 0;

    return {
      orderId: v.id,
      orderCode: v.order_code,
      customerName: v.cliente_nome?.trim() || "N/D",
      description: v.description || "",
      totalAmount,
      vatRate: 22,
      grossRevenue: totalAmount * 1.22,
      itemsCostNet,
      teamsCostNet,
      commissions,
      totalVariableCosts,
      grossMargin,
      marginPercent,
    };
  });

  // Sort by margin % ascending (worst first)
  orders.sort((a, b) => a.marginPercent - b.marginPercent);

  // KPIs — solo le commesse con un ricavo E almeno un costo registrato: una
  // commessa senza costi non ha un margine del 100%, ha un consuntivo non
  // ancora iniziato (stessa regola di margineCantieriAperti). Contandole, la
  // Demo dava 70% di margine e un pareggio sottostimato di un terzo.
  const ordersWithRevenue = orders.filter(o => o.totalAmount > 0 && o.totalVariableCosts > 0);
  const totalRevenueAll = ordersWithRevenue.reduce((s, o) => s + o.totalAmount, 0);
  const totalMarginAll = ordersWithRevenue.reduce((s, o) => s + o.grossMargin, 0);
  const avgMarginPercent = totalRevenueAll > 0
    ? (totalMarginAll / totalRevenueAll) * 100
    : 0;
  const avgMarginEur = ordersWithRevenue.length > 0
    ? ordersWithRevenue.reduce((s, o) => s + o.grossMargin, 0) / ordersWithRevenue.length
    : 0;

  const minMarginOrder = ordersWithRevenue.length > 0 ? ordersWithRevenue[0] : null;
  const maxMarginOrder = ordersWithRevenue.length > 0 ? ordersWithRevenue[ordersWithRevenue.length - 1] : null;

  // Standard deviation
  const stdDeviation = ordersWithRevenue.length > 1
    ? Math.sqrt(
        ordersWithRevenue.reduce((s, o) => s + Math.pow(o.marginPercent - avgMarginPercent, 2), 0) /
          ordersWithRevenue.length
      )
    : 0;

  // Fixed costs aggregation (normalize to monthly using shared utility).
  // company_costs.amount è imponibile per convenzione: usarlo così com'è —
  // lo scorporo IVA di prima SOTTOSTIMAVA i costi fissi del break-even.
  const fixedCostsByCategory = new Map<string, number>();
  (fixedCostsRaw || []).forEach(cost => {
    const monthly = quotaNonRipartita(cost.amount, cost.allocations, cost.quota_magazzino) * recurrenceMultiplier(cost.recurrence);
    for (const p of partiPerCategoria(cost, monthly)) {
      const cat = p.categoria || "Altro";
      fixedCostsByCategory.set(cat, (fixedCostsByCategory.get(cat) || 0) + p.importo);
    }
  });

  const fixedCosts: FixedCostBreakdown[] = Array.from(fixedCostsByCategory.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const totalFixedCostsFromCosts = fixedCosts.reduce((s, c) => s + c.amount, 0);
  // Costo vero del mese (stessa formula della pagina Costi): mensilità aggiuntive,
  // contributi, Cassa Edile e TFR del tipo di dipendente.
  const salariesMonthly = (employees || []).reduce((s, e) => s + costoMensileVero(e, parametriCosto), 0);
  const totalFixedCostsMonthly = totalFixedCostsFromCosts + salariesMonthly;

  // Break even
  const breakEvenRevenue = avgMarginPercent > 0
    ? totalFixedCostsMonthly / (avgMarginPercent / 100)
    : 0;

  // Fatturato medio mensile degli ultimi 12 mesi (08/11/2026). Prima: created_at, e una
  // finestra che partiva dalla commessa più vecchia, minimo un mese. Chi aveva importato un
  // anno intero in un giorno risultava fatturare in un mese quello che aveva fatto in dodici.
  // Ora ogni commessa ha il suo mese di vendita (dataVendita) e la finestra è di 12 mesi pieni
  // se ci sono commesse più vecchie; più corta solo per un'azienda nata da meno di un anno.
  const importoPerCommessa = new Map((ordersRaw || []).map((r) => [r.id, Number(r.preventivo_totale) || 0]));
  const currentMonthlyRevenue = giorniVendita
    ? fatturatoMedioMensile([...giorniVendita.entries()].map(([id, giorno]) => ({ giorno, importo: importoPerCommessa.get(id) ?? 0 })))
    : fatturatoMedioMensile((ordersRaw || []).map((r) => ({ giorno: r.created_at ? r.created_at.slice(0, 10) : null, importo: Number(r.preventivo_totale) || 0 })));

  const breakEvenDelta = currentMonthlyRevenue - breakEvenRevenue;

  // Annual break-even & break-even month of year (based on ACTUAL revenue pace)
  const breakEvenAnnual = breakEvenRevenue * 12;
  const monthlyContribution = currentMonthlyRevenue * (avgMarginPercent / 100);
  const breakEvenMonthOfYear = monthlyContribution > 0
    ? Math.min(13, Math.ceil((totalFixedCostsMonthly * 12) / monthlyContribution))
    : 13; // 13 = non raggiunto nell'anno

  return {
    isLoading,
    isError,
    orders,
    avgMarginEur,
    avgMarginPercent,
    minMarginOrder,
    maxMarginOrder,
    stdDeviation,
    fixedCosts,
    totalFixedCostsMonthly,
    salariesMonthly,
    breakEvenRevenue,
    breakEvenAnnual,
    breakEvenMonthOfYear,
    currentMonthlyRevenue,
    breakEvenDelta,
    companyId,
  };
}
