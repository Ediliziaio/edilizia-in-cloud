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
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CircleDollarSign,
  Clock,
  Coins,
  CreditCard,
  Euro,
  FileText,
  Filter,
  HandCoins,
  Hourglass,
  Landmark,
  ListChecks,
  Package,
  PackageX,
  PieChart,
  Receipt,
  ShoppingCart,
  Sparkles,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Trophy,
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
// Marketing & Pipeline (NUOVO)
// ─────────────────────────────────────────────────────────────────

const MARKETING: PaletteItem[] = [
  {
    type: "kpi_card",
    label: "Nuovi lead",
    description: "Contatti acquisiti nel periodo",
    icon: Sparkles,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Nuovi lead",
      metric: "leads_new",
      aggregation: "count",
      compareTo: "prev_period",
    },
  },
  {
    type: "kpi_card",
    label: "Opportunità aperte",
    description: "Pipeline attiva",
    icon: Target,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Opportunità aperte",
      metric: "opportunities_open",
      aggregation: "count",
    },
  },
  {
    type: "kpi_card",
    label: "Pipeline value",
    description: "Valore complessivo opportunità aperte",
    icon: HandCoins,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Pipeline value",
      metric: "pipeline_value",
      aggregation: "sum",
      format: { currency: "EUR", decimals: 0 },
    },
  },
  {
    type: "kpi_card",
    label: "Vinte nel periodo",
    description: "Opportunità chiuse con successo",
    icon: Trophy,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Vinte nel periodo",
      metric: "opportunities_won",
      aggregation: "count",
      compareTo: "prev_period",
    },
  },
  {
    type: "chart_area",
    label: "Lead nel tempo",
    description: "Andamento lead per mese",
    icon: TrendingUp,
    defaultSize: { w: 6, h: 4 },
    defaultConfig: {
      title: "Lead per mese",
      metric: "leads_new",
      aggregation: "count",
      breakdown: "month",
    },
  },
  {
    type: "chart_pie",
    label: "Lead per sorgente",
    description: "Da dove arrivano i lead",
    icon: PieChart,
    defaultSize: { w: 4, h: 4 },
    defaultConfig: {
      title: "Lead per sorgente",
      metric: "leads_new",
      aggregation: "count",
      breakdown: "source",
    },
  },
  {
    type: "chart_bar",
    label: "Pipeline per stage",
    description: "Distribuzione valore per stage",
    icon: Filter,
    defaultSize: { w: 6, h: 4 },
    defaultConfig: {
      title: "Pipeline per stage",
      metric: "pipeline_value",
      aggregation: "sum",
      breakdown: "bucket",
      format: { currency: "EUR", decimals: 0 },
    },
  },
  {
    type: "table",
    label: "Opportunità per agente",
    description: "Carico opportunità per assegnatario",
    icon: Users,
    defaultSize: { w: 6, h: 4 },
    defaultConfig: {
      title: "Opportunità per agente",
      metric: "opportunities_open",
      aggregation: "count",
      breakdown: "assigned_to",
      columns: [
        { key: "label", label: "Agente" },
        { key: "value", label: "Aperte" },
      ],
    },
  },
];

// ─────────────────────────────────────────────────────────────────
// Tesoreria & Banking (NUOVO)
// ─────────────────────────────────────────────────────────────────

const TESORERIA: PaletteItem[] = [
  {
    type: "kpi_card",
    label: "Saldo cassa totale",
    description: "Somma saldi conti attivi",
    icon: Landmark,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Saldo cassa totale",
      metric: "cash_balance",
      aggregation: "sum",
      format: { currency: "EUR", decimals: 0 },
    },
  },
  {
    type: "kpi_card",
    label: "Entrate periodo",
    description: "Somma accrediti bancari",
    icon: TrendingUp,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Entrate periodo",
      metric: "bank_inflows",
      aggregation: "sum",
      format: { currency: "EUR", decimals: 0 },
      compareTo: "prev_period",
    },
  },
  {
    type: "kpi_card",
    label: "Uscite periodo",
    description: "Somma addebiti bancari",
    icon: TrendingDown,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Uscite periodo",
      metric: "bank_outflows",
      aggregation: "sum",
      format: { currency: "EUR", decimals: 0 },
      compareTo: "prev_period",
    },
  },
  {
    type: "kpi_card",
    label: "Rate scadute",
    description: "Importo rate non incassate oltre scadenza",
    icon: TriangleAlert,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Rate scadute",
      metric: "installments_overdue",
      aggregation: "sum",
      format: { currency: "EUR", decimals: 0 },
    },
  },
  {
    type: "chart_area",
    label: "Andamento entrate",
    description: "Entrate bancarie per mese",
    icon: TrendingUp,
    defaultSize: { w: 6, h: 4 },
    defaultConfig: {
      title: "Entrate per mese",
      metric: "bank_inflows",
      aggregation: "sum",
      breakdown: "month",
      format: { currency: "EUR", decimals: 0 },
    },
  },
  {
    type: "chart_area",
    label: "Andamento uscite",
    description: "Uscite bancarie per mese",
    icon: TrendingDown,
    defaultSize: { w: 6, h: 4 },
    defaultConfig: {
      title: "Uscite per mese",
      metric: "bank_outflows",
      aggregation: "sum",
      breakdown: "month",
      format: { currency: "EUR", decimals: 0 },
    },
  },
  {
    type: "chart_pie",
    label: "Saldo per tipo conto",
    description: "Composizione liquidità",
    icon: PieChart,
    defaultSize: { w: 4, h: 4 },
    defaultConfig: {
      title: "Saldo per tipo conto",
      metric: "cash_balance",
      aggregation: "sum",
      breakdown: "category",
      format: { currency: "EUR", decimals: 0 },
    },
  },
  {
    type: "chart_bar",
    label: "Uscite per categoria",
    description: "Spese bancarie raggruppate",
    icon: Receipt,
    defaultSize: { w: 6, h: 4 },
    defaultConfig: {
      title: "Uscite per categoria",
      metric: "bank_outflows",
      aggregation: "sum",
      breakdown: "category",
      format: { currency: "EUR", decimals: 0 },
    },
  },
  {
    type: "table",
    label: "Top scaduti per cliente",
    description: "Clienti con rate non incassate",
    icon: Users,
    defaultSize: { w: 6, h: 4 },
    defaultConfig: {
      title: "Top scaduti per cliente",
      metric: "installments_overdue",
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
// Calendario & Appuntamenti (NUOVO)
// ─────────────────────────────────────────────────────────────────

const CALENDAR: PaletteItem[] = [
  {
    type: "kpi_card",
    label: "Appuntamenti periodo",
    description: "Numero totale di appuntamenti",
    icon: CalendarDays,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Appuntamenti periodo",
      metric: "appointments_count",
      aggregation: "count",
      compareTo: "prev_period",
    },
  },
  {
    type: "kpi_card",
    label: "Completati",
    description: "Appuntamenti chiusi positivamente",
    icon: CalendarCheck,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Completati",
      metric: "appointments_completed",
      aggregation: "count",
    },
  },
  {
    type: "chart_bar",
    label: "Appuntamenti per giorno",
    description: "Andamento giornaliero",
    icon: CalendarClock,
    defaultSize: { w: 8, h: 4 },
    defaultConfig: {
      title: "Appuntamenti per giorno",
      metric: "appointments_count",
      aggregation: "count",
      breakdown: "day",
    },
  },
  {
    type: "chart_pie",
    label: "Per categoria",
    description: "Tipo di appuntamento",
    icon: PieChart,
    defaultSize: { w: 4, h: 4 },
    defaultConfig: {
      title: "Per categoria",
      metric: "appointments_count",
      aggregation: "count",
      breakdown: "category",
    },
  },
  {
    type: "table",
    label: "Per agente",
    description: "Carico appuntamenti per assegnatario",
    icon: Users,
    defaultSize: { w: 6, h: 4 },
    defaultConfig: {
      title: "Per agente",
      metric: "appointments_count",
      aggregation: "count",
      breakdown: "assigned_to",
      columns: [
        { key: "label", label: "Agente" },
        { key: "value", label: "Appuntamenti" },
      ],
    },
  },
  {
    type: "table",
    label: "Completati per agente",
    description: "Performance individuale",
    icon: Trophy,
    defaultSize: { w: 6, h: 4 },
    defaultConfig: {
      title: "Completati per agente",
      metric: "appointments_completed",
      aggregation: "count",
      breakdown: "assigned_to",
      columns: [
        { key: "label", label: "Agente" },
        { key: "value", label: "Completati" },
      ],
    },
  },
];

// ─────────────────────────────────────────────────────────────────
// Magazzino — segnali rapidi (NUOVO: stock_low usa metric attiva)
// ─────────────────────────────────────────────────────────────────

const WAREHOUSE_SIGNALS: PaletteItem[] = [
  {
    type: "stat_tile",
    label: "Articoli sotto scorta",
    description: "Tile colorato: numero articoli da riordinare",
    icon: PackageX,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Sotto scorta",
      metric: "stock_low",
      aggregation: "count",
      tone: "warning",
      statusLabel: "Da riordinare",
      description: "Articoli con quantità ≤ minimo",
    },
  },
  {
    type: "kpi_card",
    label: "Sotto scorta (count)",
    description: "Conteggio classico articoli critici",
    icon: TriangleAlert,
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      title: "Sotto scorta",
      metric: "stock_low",
      aggregation: "count",
    },
  },
];

// ─────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────

export const RECIPE_CATEGORIES: RecipeCategory[] = [
  { id: "rec_sales", label: "Vendite & Fatturato", items: SALES },
  { id: "rec_orders", label: "Ordini", items: ORDERS },
  { id: "rec_marketing", label: "Marketing & Pipeline", items: MARKETING },
  { id: "rec_customers", label: "Clienti & CRM", items: CUSTOMERS },
  { id: "rec_finance", label: "Finanza & Pagamenti", items: FINANCE },
  { id: "rec_tesoreria", label: "Tesoreria & Banking", items: TESORERIA },
  { id: "rec_calendar", label: "Calendario & Appuntamenti", items: CALENDAR },
  { id: "rec_warehouse", label: "Magazzino", items: WAREHOUSE },
  { id: "rec_warehouse_signals", label: "Magazzino — Segnali", items: WAREHOUSE_SIGNALS },
  { id: "rec_team", label: "Team & Personale", items: TEAM },
];

/** Flat list di tutte le ricette (per la ricerca). */
export const ALL_RECIPES: PaletteItem[] = RECIPE_CATEGORIES.flatMap(
  (c) => c.items,
);
