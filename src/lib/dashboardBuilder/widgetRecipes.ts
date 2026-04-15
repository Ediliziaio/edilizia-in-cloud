/**
 * Widget recipes — template rapidi di widget pre-configurati per area di
 * business. Ogni ricetta è una PaletteItem che, al click, crea direttamente un
 * widget con metric + aggregazione + breakdown + titolo già impostati.
 *
 * Le ricette sono organizzate per "area" (Vendite, Clienti, Magazzino, ecc.)
 * e servono a ridurre l'onboarding: l'utente scopre cosa può fare dalla
 * palette senza dover prima sfogliare il catalogo metriche.
 */
import {
  Banknote,
  CircleDollarSign,
  Clock,
  Coins,
  CreditCard,
  Euro,
  FileText,
  HandCoins,
  Hourglass,
  ListChecks,
  Package,
  PackageX,
  PieChart,
  Receipt,
  ShoppingCart,
  Star,
  TrendingUp,
  TriangleAlert,
  Truck,
  UserPlus,
  Users,
  Warehouse,
  Wrench,
} from "lucide-react";
import type { PaletteItem } from "@/components/dashboardBuilder/builder/WidgetPalette";

export interface RecipeCategory {
  id: string;
  label: string;
  /** Emoji / icona breve per l'header (opzionale) */
  hint?: string;
  items: PaletteItem[];
}

// ─────────────────────────────────────────────────────────────────
// Vendite & Fatturato
// ─────────────────────────────────────────────────────────────────

const SALES: PaletteItem[] = [
  {
    type: "kpi_card",
    label: "Fatturato totale",
    description: "Ricavi complessivi del periodo",
    icon: Euro,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Fatturato totale",
      metric: "revenue_total",
      aggregation: "sum",
      format: { currency: "EUR", decimals: 0 },
      compareTo: "prev_period",
    },
  },
  {
    type: "kpi_card",
    label: "Fatturato realizzato",
    description: "Solo ordini consegnati/chiusi",
    icon: CircleDollarSign,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Fatturato realizzato",
      metric: "revenue_real",
      aggregation: "sum",
      format: { currency: "EUR", decimals: 0 },
      compareTo: "prev_period",
    },
  },
  {
    type: "kpi_card",
    label: "Margine operativo",
    description: "Margine di contribuzione nel periodo",
    icon: Coins,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Margine operativo",
      metric: "margin_total",
      aggregation: "sum",
      format: { currency: "EUR", decimals: 0 },
      compareTo: "prev_year",
    },
  },
  {
    type: "chart_area",
    label: "Andamento fatturato",
    description: "Trend ricavi per mese",
    icon: TrendingUp,
    defaultSize: { w: 6, h: 4 },
    defaultConfig: {
      title: "Andamento fatturato",
      metric: "revenue_total",
      aggregation: "sum",
      breakdown: "month",
      format: { currency: "EUR", decimals: 0 },
    },
  },
  {
    type: "chart_bar",
    label: "Fatturato settimanale",
    description: "Confronto ricavi per settimana",
    icon: Receipt,
    defaultSize: { w: 6, h: 4 },
    defaultConfig: {
      title: "Fatturato settimanale",
      metric: "revenue_total",
      aggregation: "sum",
      breakdown: "week",
      format: { currency: "EUR", decimals: 0 },
    },
  },
];

// ─────────────────────────────────────────────────────────────────
// Ordini
// ─────────────────────────────────────────────────────────────────

const ORDERS: PaletteItem[] = [
  {
    type: "kpi_card",
    label: "Ordini totali",
    description: "Numero di ordini nel periodo",
    icon: ShoppingCart,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Ordini totali",
      metric: "orders_count",
      aggregation: "count",
      compareTo: "prev_period",
    },
  },
  {
    type: "kpi_card",
    label: "Ordini aperti",
    description: "Ordini in lavorazione",
    icon: ListChecks,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Ordini aperti",
      metric: "orders_open",
      aggregation: "count",
    },
  },
  {
    type: "kpi_card",
    label: "Valore medio ordine",
    description: "Importo medio degli ordini",
    icon: HandCoins,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Valore medio ordine",
      metric: "order_avg_value",
      aggregation: "avg",
      format: { currency: "EUR", decimals: 0 },
      compareTo: "prev_period",
    },
  },
  {
    type: "kpi_card",
    label: "Durata media ordine",
    description: "Tempo medio di evasione",
    icon: Hourglass,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Durata media ordine",
      metric: "order_avg_duration",
      aggregation: "avg",
      format: { suffix: " gg" },
    },
  },
  {
    type: "chart_pie",
    label: "Ordini per stato",
    description: "Distribuzione per stato",
    icon: PieChart,
    defaultSize: { w: 4, h: 4 },
    defaultConfig: {
      title: "Ordini per stato",
      metric: "orders_by_status",
      aggregation: "count",
      breakdown: "order_status",
    },
  },
  {
    type: "chart_line",
    label: "Ordini nel tempo",
    description: "Evoluzione ordini per mese",
    icon: TrendingUp,
    defaultSize: { w: 6, h: 4 },
    defaultConfig: {
      title: "Ordini nel tempo",
      metric: "orders_count",
      aggregation: "count",
      breakdown: "month",
    },
  },
  {
    type: "table",
    label: "Ordini per cliente",
    description: "Top clienti per numero ordini",
    icon: FileText,
    defaultSize: { w: 6, h: 4 },
    defaultConfig: {
      title: "Ordini per cliente",
      metric: "orders_count",
      aggregation: "count",
      breakdown: "customer",
      columns: [
        { key: "label", label: "Cliente" },
        { key: "value", label: "Ordini" },
      ],
    },
  },
];

// ─────────────────────────────────────────────────────────────────
// Clienti / CRM
// ─────────────────────────────────────────────────────────────────

const CUSTOMERS: PaletteItem[] = [
  {
    type: "kpi_card",
    label: "Clienti totali",
    description: "Anagrafiche clienti attive",
    icon: Users,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Clienti totali",
      metric: "customers_total",
      aggregation: "count",
    },
  },
  {
    type: "kpi_card",
    label: "Nuovi clienti",
    description: "Clienti acquisiti nel periodo",
    icon: UserPlus,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Nuovi clienti",
      metric: "customers_new",
      aggregation: "count",
      compareTo: "prev_period",
    },
  },
  {
    type: "chart_line",
    label: "Acquisizione clienti",
    description: "Nuovi clienti per mese",
    icon: TrendingUp,
    defaultSize: { w: 6, h: 4 },
    defaultConfig: {
      title: "Nuovi clienti per mese",
      metric: "customers_new",
      aggregation: "count",
      breakdown: "month",
    },
  },
  {
    type: "table",
    label: "Top clienti per fatturato",
    description: "Classifica clienti per spesa",
    icon: Star,
    defaultSize: { w: 6, h: 5 },
    defaultConfig: {
      title: "Top clienti",
      metric: "customers_top",
      aggregation: "sum",
      breakdown: "customer",
      format: { currency: "EUR", decimals: 0 },
      columns: [
        { key: "label", label: "Cliente" },
        { key: "value", label: "Fatturato" },
      ],
    },
  },
];

// ─────────────────────────────────────────────────────────────────
// Finanza & Pagamenti
// ─────────────────────────────────────────────────────────────────

const FINANCE: PaletteItem[] = [
  {
    type: "kpi_card",
    label: "Incassi realizzati",
    description: "Pagamenti ricevuti nel periodo",
    icon: Banknote,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Incassi",
      metric: "payments_real",
      aggregation: "sum",
      format: { currency: "EUR", decimals: 0 },
      compareTo: "prev_period",
    },
  },
  {
    type: "kpi_card",
    label: "Crediti scaduti",
    description: "Fatture oltre la scadenza",
    icon: TriangleAlert,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Crediti scaduti",
      metric: "overdue_receivables",
      aggregation: "sum",
      format: { currency: "EUR", decimals: 0 },
    },
  },
  {
    type: "kpi_card",
    label: "Forecast cassa 30gg",
    description: "Previsione incassi prossimi 30 giorni",
    icon: CreditCard,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Forecast cassa 30gg",
      metric: "cashflow_forecast_30d",
      aggregation: "sum",
      format: { currency: "EUR", decimals: 0 },
    },
  },
  {
    type: "chart_bar",
    label: "Incassi per categoria",
    description: "Distribuzione pagamenti",
    icon: PieChart,
    defaultSize: { w: 6, h: 4 },
    defaultConfig: {
      title: "Incassi per categoria",
      metric: "payments_real",
      aggregation: "sum",
      breakdown: "category",
      format: { currency: "EUR", decimals: 0 },
    },
  },
  {
    type: "table",
    label: "Scaduti per cliente",
    description: "Clienti con fatture scadute",
    icon: Users,
    defaultSize: { w: 6, h: 4 },
    defaultConfig: {
      title: "Scaduti per cliente",
      metric: "overdue_receivables",
      aggregation: "sum",
      breakdown: "customer",
      format: { currency: "EUR", decimals: 0 },
      columns: [
        { key: "label", label: "Cliente" },
        { key: "value", label: "Importo scaduto" },
      ],
    },
  },
];

// ─────────────────────────────────────────────────────────────────
// Magazzino
// ─────────────────────────────────────────────────────────────────

const WAREHOUSE: PaletteItem[] = [
  {
    type: "kpi_card",
    label: "Articoli urgenti",
    description: "Articoli da riordinare subito",
    icon: TriangleAlert,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Articoli urgenti",
      metric: "items_urgent",
      aggregation: "count",
    },
  },
  {
    type: "kpi_card",
    label: "Sotto scorta",
    description: "Articoli sotto la soglia minima",
    icon: PackageX,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Sotto scorta",
      metric: "items_below_min",
      aggregation: "count",
    },
  },
  {
    type: "kpi_card",
    label: "Valore magazzino",
    description: "Controvalore scorte a magazzino",
    icon: Warehouse,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Valore magazzino",
      metric: "stock_value",
      aggregation: "sum",
      format: { currency: "EUR", decimals: 0 },
    },
  },
  {
    type: "chart_bar",
    label: "Stock per categoria",
    description: "Valore scorte per famiglia",
    icon: Package,
    defaultSize: { w: 6, h: 4 },
    defaultConfig: {
      title: "Stock per categoria",
      metric: "stock_value",
      aggregation: "sum",
      breakdown: "category",
      format: { currency: "EUR", decimals: 0 },
    },
  },
];

// ─────────────────────────────────────────────────────────────────
// Team & Personale
// ─────────────────────────────────────────────────────────────────

const TEAM: PaletteItem[] = [
  {
    type: "kpi_card",
    label: "Squadre attive oggi",
    description: "Team operativi in giornata",
    icon: Users,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Squadre attive",
      metric: "teams_active_today",
      aggregation: "count",
    },
  },
  {
    type: "kpi_card",
    label: "Ore lavorate",
    description: "Ore totali nel periodo",
    icon: Clock,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Ore lavorate",
      metric: "hours_worked_total",
      aggregation: "sum",
      format: { suffix: " h" },
      compareTo: "prev_period",
    },
  },
  {
    type: "kpi_card",
    label: "Produttività (H/O)",
    description: "Ore per ordine completato",
    icon: Wrench,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Produttività",
      metric: "productivity_hpo",
      aggregation: "avg",
      format: { suffix: " h/ord" },
    },
  },
  {
    type: "chart_bar",
    label: "Ore per team",
    description: "Ore lavorate per squadra",
    icon: Truck,
    defaultSize: { w: 6, h: 4 },
    defaultConfig: {
      title: "Ore per team",
      metric: "hours_worked_total",
      aggregation: "sum",
      breakdown: "team",
      format: { suffix: " h" },
    },
  },
  {
    type: "table",
    label: "Ore per membro",
    description: "Ore lavorate per persona",
    icon: Users,
    defaultSize: { w: 6, h: 4 },
    defaultConfig: {
      title: "Ore per membro",
      metric: "hours_worked_total",
      aggregation: "sum",
      breakdown: "member",
      format: { suffix: " h" },
      columns: [
        { key: "label", label: "Membro" },
        { key: "value", label: "Ore" },
      ],
    },
  },
];

// ─────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────

export const RECIPE_CATEGORIES: RecipeCategory[] = [
  { id: "rec_sales", label: "Vendite & Fatturato", items: SALES },
  { id: "rec_orders", label: "Ordini", items: ORDERS },
  { id: "rec_customers", label: "Clienti & CRM", items: CUSTOMERS },
  { id: "rec_finance", label: "Finanza & Pagamenti", items: FINANCE },
  { id: "rec_warehouse", label: "Magazzino", items: WAREHOUSE },
  { id: "rec_team", label: "Team & Personale", items: TEAM },
];

/** Flat list di tutte le ricette (per la ricerca). */
export const ALL_RECIPES: PaletteItem[] = RECIPE_CATEGORIES.flatMap(
  (c) => c.items,
);
