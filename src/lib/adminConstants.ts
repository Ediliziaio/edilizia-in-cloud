import {
  ClipboardList,
  Warehouse,
  CalendarDays,
  Users,
  HardHat,
  HeadphonesIcon,
  TrendingUp,
  Play,
  Timer,
  Pause,
  XCircle,
  RefreshCw,
  CreditCard,
} from "lucide-react";

export const ALL_MODULES = [
  { key: "orders", label: "Ordini", icon: ClipboardList, description: "Gestione ordini e preventivi" },
  { key: "warehouse", label: "Magazzino", icon: Warehouse, description: "Gestione materiali e scorte" },
  { key: "calendar", label: "Calendario", icon: CalendarDays, description: "Pianificazione lavori" },
  { key: "customers", label: "Clienti", icon: Users, description: "Anagrafica clienti" },
  { key: "employees", label: "Dipendenti", icon: HardHat, description: "Gestione personale" },
  { key: "tickets", label: "Assistenza", icon: HeadphonesIcon, description: "Supporto clienti" },
  { key: "forecast", label: "Previsionale", icon: TrendingUp, description: "Analisi cash flow" },
] as const;

export const PERMISSION_LABELS: Record<string, string> = {
  can_view_dashboard: "Dashboard",
  can_view_orders: "Ordini",
  can_edit_orders: "Modifica Ordini",
  can_view_customers: "Clienti",
  can_edit_customers: "Modifica Clienti",
  can_view_warehouse: "Magazzino",
  can_edit_warehouse: "Modifica Magazzino",
  can_view_calendar: "Calendario",
  can_view_employees: "Dipendenti",
  can_view_tickets: "Ticket",
  can_edit_tickets: "Modifica Ticket",
  can_view_forecast: "Previsionale",
  can_view_settings: "Impostazioni",
};

export const eventTypeLabels: Record<string, string> = {
  trial_started: "Trial avviato",
  activated: "Attivato",
  suspended: "Sospeso",
  canceled: "Cancellato",
  renewed: "Rinnovato",
  plan_changed: "Piano cambiato",
  payment_failed: "Pagamento fallito",
  trial_extended: "Trial esteso",
  status_change: "Cambio stato",
};

export const eventTypeIcons: Record<string, typeof Play> = {
  trial_started: Timer,
  activated: Play,
  suspended: Pause,
  canceled: XCircle,
  renewed: RefreshCw,
  plan_changed: CreditCard,
  payment_failed: XCircle,
  trial_extended: Timer,
  status_change: RefreshCw,
};

export const commissionTypeLabels: Record<string, string> = {
  percentage_sold: "% sul venduto",
  percentage_margin: "% sul margine",
  fixed_per_order: "Fisso per ordine",
};

export const ticketStatusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  aperto: { label: "Aperto", variant: "outline" },
  in_lavorazione: { label: "In lavorazione", variant: "secondary" },
  risolto: { label: "Risolto", variant: "default" },
};
