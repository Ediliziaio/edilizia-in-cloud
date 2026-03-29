import {
  LayoutDashboard,
  ClipboardList,
  Users,
  HeadphonesIcon,
  TrendingUp,
  Receipt,
  AlertTriangle,
  Warehouse,
  CalendarDays,
  CheckSquare,
  MessageSquare,
  MessageCircle,
  Zap,
  Contact,
  Target,
  Bot,
  Mail,
  Gauge,
  BarChart3,
  Headphones,
  Landmark,
  FileSignature,
  FileText,
  BookOpen,
  Truck,
  Package,
  Wallet,
  Shield,
  KanbanSquare,
  Settings,
  HardHat,
  Euro,
  Users2,
  Megaphone,
  LifeBuoy,
  CalendarClock,
  FileStack,
  FileSearch,
  BookUser,
  Coins,
  Archive,
  TrendingDown,
  ContactRound,
  UserCheck,
  Clock,
  MessagesSquare,
  FormInput,
  ListTodo,
  PieChart,
  Workflow,
  GitBranch,
  BrainCircuit,
  LayoutGrid,
  Home,
  FileClock,
  FileX2,
  ShieldAlert,
  NotebookPen,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ModuleKey } from "@/hooks/useSubscriptionLimits";

export interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  permissionKey?: string;
  moduleKey?: ModuleKey;
  featureKey?: string;
  isBeta?: boolean;
  category?: "internal" | "marketing";
  subcategory?: string;
  groupLabel?: string;
}

export interface SubcategoryConfig {
  id: string;
  label: string;
}

export interface MacroArea {
  id: string;
  title: string;
  icon: LucideIcon;
  items: NavItem[];
}

export const macroAreas: MacroArea[] = [
  // 1. Cruscotto — standalone top items
  {
    id: "area_cruscotto",
    title: "Cruscotto",
    icon: LayoutGrid,
    items: [
      { title: "Cruscotto Aziendale", url: "/azienda/cruscotto", icon: LayoutGrid, permissionKey: "canViewCruscotto" },
      { title: "Attività", url: "/azienda/attivita", icon: CheckSquare },
    ],
  },

  // 2. Cantieri & Lavori
  {
    id: "area_cantieri",
    title: "Cantieri & Lavori",
    icon: HardHat,
    items: [
      { title: "Dashboard", url: "/azienda", icon: Home, permissionKey: "canViewDashboard" },
      { title: "Ordini", url: "/azienda/ordini", icon: ClipboardList, permissionKey: "canViewOrders", moduleKey: "orders" },
      { title: "Magazzino", url: "/azienda/magazzino", icon: Warehouse, permissionKey: "canViewWarehouse", moduleKey: "warehouse" },
      { title: "Clienti", url: "/azienda/clienti", icon: Users, permissionKey: "canViewCustomers", moduleKey: "customers" },
      { title: "Ticket Assistenza", url: "/azienda/assistenza", icon: LifeBuoy, permissionKey: "canViewTickets", moduleKey: "tickets" },
      
      { title: "Calendario", url: "/azienda/calendario", icon: CalendarDays, permissionKey: "canViewCalendar", moduleKey: "calendar" },
      { title: "Ordini Acquisto", url: "/azienda/ordini-acquisto", icon: Package, permissionKey: "canViewForecast" },
      { title: "Sicurezza Cantiere", url: "/azienda/sicurezza-cantiere", icon: ShieldAlert, permissionKey: "canViewOrders" },
      { title: "Marginalità", url: "/azienda/marginalita", icon: PieChart, permissionKey: "canViewOrders" },
      { title: "Errori", url: "/azienda/errori", icon: AlertTriangle, permissionKey: "canViewOrders", moduleKey: "orders" },
    ],
  },

  // 3. Finanza
  {
    id: "area_finanza",
    title: "Finanza",
    icon: Euro,
    items: [
      // ─── Sub-gruppo: Fatturazione e Documenti (billing_native) ───
      { title: "Fatture", url: "/azienda/documenti", icon: FileText, permissionKey: "canViewBilling", featureKey: "billing_native", groupLabel: "Fatturazione e Documenti" },
      { title: "Anagrafica Fiscale", url: "/azienda/documenti/anagrafiche", icon: BookUser, permissionKey: "canViewBilling", featureKey: "billing_native" },
      { title: "Registro Incassi", url: "/azienda/documenti/incassi", icon: Coins, permissionKey: "canViewBilling", featureKey: "billing_native" },
      { title: "Cassetto SDI", url: "/azienda/documenti/cassetto-sdi", icon: Archive, permissionKey: "canViewBilling", featureKey: "billing_native" },
      { title: "Report Fiscali", url: "/azienda/documenti/report", icon: BarChart3, permissionKey: "canViewBilling", featureKey: "billing_native" },
      { title: "Impostazioni Fatt.", url: "/azienda/impostazioni/fatturazione-nativa", icon: Settings, permissionKey: "canViewBilling", featureKey: "billing_native" },
      // ─── Fatturazione esterna (billing_external) ───
      { title: "Fatturazione", url: "/azienda/fatturazione", icon: Receipt, permissionKey: "canViewBilling", featureKey: "billing_external", groupLabel: "Fatturazione e Documenti" },
      { title: "Scadenzario", url: "/azienda/scadenzario", icon: CalendarClock, permissionKey: "canViewScadenzario", featureKey: "billing_external" },
      // ─── Contabilità ───
      { title: "Prima Nota", url: "/azienda/prima-nota", icon: BookOpen, permissionKey: "canViewPrimaNota", groupLabel: "Contabilità" },
      { title: "Tesoreria", url: "/azienda/tesoreria", icon: Landmark, permissionKey: "canViewDashboard" },
      { title: "Costi", url: "/azienda/costi", icon: TrendingDown, permissionKey: "canViewCosts", moduleKey: "forecast" },
      { title: "Previsionale", url: "/azienda/previsionale", icon: TrendingUp, permissionKey: "canViewForecast", moduleKey: "forecast" },
    ],
  },

  // 4. Persone
  {
    id: "area_persone",
    title: "Persone",
    icon: Users2,
    items: [
      { title: "Personale & HR", url: "/azienda/personale", icon: UserCheck, permissionKey: "canViewPersone" },
      { title: "Giornale Lavori", url: "/azienda/giornale-lavori", icon: NotebookPen, permissionKey: "canViewOrders", isBeta: true },
      { title: "Messaggistica", url: "/azienda/messaggistica-beta", icon: MessageSquare, permissionKey: "canViewPersone", featureKey: "messaging_beta", isBeta: true },
      { title: "Chat Interna", url: "/azienda/chat", icon: MessagesSquare, permissionKey: "canViewPersone" },
    ],
  },

  // 5. Marketing & Vendita
  {
    id: "area_marketing",
    title: "Marketing & Vendita",
    icon: Megaphone,
    items: [
      { title: "Dashboard", url: "/azienda/marketing", icon: LayoutDashboard, permissionKey: "canViewMarketingDashboard" },
      { title: "Contatti CRM", url: "/azienda/marketing/contatti", icon: ContactRound, permissionKey: "canViewMarketingContacts" },
      { title: "Opportunità", url: "/azienda/marketing/opportunita", icon: Target, permissionKey: "canViewMarketingOpportunities" },
      { title: "Preventivi CRM", url: "/azienda/marketing/preventivi", icon: FileSignature, permissionKey: "canViewMarketingOpportunities" },
      { title: "Email Marketing", url: "/azienda/marketing/email", icon: Mail, permissionKey: "canViewMarketingEmail" },
      { title: "WhatsApp", url: "/azienda/marketing/whatsapp", icon: MessageCircle, permissionKey: "canViewMarketingWhatsapp" },
      
      { title: "Calendario CRM", url: "/azienda/marketing/calendario", icon: CalendarDays, permissionKey: "canViewMarketingAppointments" },
      { title: "Sales OS", url: "/azienda/marketing/sales-os", icon: Gauge, permissionKey: "canViewMarketingOpportunities" },
      { title: "Reportistica", url: "/azienda/marketing/reportistica", icon: PieChart, permissionKey: "canViewMarketingReports" },
      { title: "Analisi AI Preventivi", url: "/azienda/marketing/analisi-preventivi", icon: BrainCircuit, permissionKey: "canViewMarketingReports" },
    ],
  },

  // 6. Automazioni & AI
  {
    id: "area_automazioni",
    title: "Automazioni & AI",
    icon: Zap,
    items: [
      { title: "Automazioni", url: "/azienda/automazioni", icon: Workflow, permissionKey: "canViewSettings" },
      { title: "Agenti AI", url: "/azienda/agenti-ai", icon: Bot, permissionKey: "canViewMarketingAiAgent" },
    ],
  },
];

/** @deprecated Use macroAreas instead */
export const internalSubcategories: SubcategoryConfig[] = [
  { id: "gi_operazioni", label: "Operazioni" },
  { id: "gi_supporto", label: "Clienti & Supporto" },
  { id: "gi_finanza", label: "Finanza" },
  { id: "gi_team", label: "Team" },
  { id: "gi_automation", label: "Automazione & AI" },
];

/** @deprecated Use macroAreas instead */
export const marketingSubcategories: SubcategoryConfig[] = [
  { id: "mkt_crm", label: "CRM" },
  { id: "mkt_comunicazione", label: "Comunicazione" },
  { id: "mkt_automation", label: "Automazione & AI" },
  { id: "mkt_analisi", label: "Analisi" },
];

/** @deprecated Use macroAreas instead */
export const internalNavItems: NavItem[] = [
  { title: "Dashboard", url: "/azienda", icon: LayoutDashboard, permissionKey: "canViewDashboard", category: "internal", subcategory: "gi_operazioni" },
  { title: "Ordini", url: "/azienda/ordini", icon: ClipboardList, permissionKey: "canViewOrders", moduleKey: "orders", category: "internal", subcategory: "gi_operazioni" },
  { title: "Magazzino", url: "/azienda/magazzino", icon: Warehouse, permissionKey: "canViewWarehouse", moduleKey: "warehouse", category: "internal", subcategory: "gi_operazioni" },
  { title: "Calendario", url: "/azienda/calendario", icon: CalendarDays, permissionKey: "canViewCalendar", moduleKey: "calendar", category: "internal", subcategory: "gi_operazioni" },
  { title: "Clienti", url: "/azienda/clienti", icon: Users, permissionKey: "canViewCustomers", moduleKey: "customers", category: "internal", subcategory: "gi_supporto" },
  { title: "Ticket Clienti", url: "/azienda/assistenza", icon: HeadphonesIcon, permissionKey: "canViewTickets", moduleKey: "tickets", category: "internal", subcategory: "gi_supporto" },
  { title: "Previsionale", url: "/azienda/previsionale", icon: TrendingUp, permissionKey: "canViewForecast", moduleKey: "forecast", category: "internal", subcategory: "gi_finanza" },
  { title: "Costi", url: "/azienda/costi", icon: Receipt, permissionKey: "canViewForecast", moduleKey: "forecast", category: "internal", subcategory: "gi_finanza" },
  { title: "Tesoreria", url: "/azienda/tesoreria", icon: Landmark, permissionKey: "canViewDashboard", category: "internal", subcategory: "gi_finanza" },
  { title: "Fatturazione", url: "/azienda/fatturazione", icon: FileText, permissionKey: "canViewForecast", featureKey: "billing_external", category: "internal", subcategory: "gi_finanza" },
  { title: "Scadenzario", url: "/azienda/scadenzario", icon: CalendarDays, permissionKey: "canViewForecast", featureKey: "billing_external", category: "internal", subcategory: "gi_finanza" },
  { title: "Fatturazione", url: "/azienda/documenti", icon: FileText, permissionKey: "canViewForecast", featureKey: "billing_native", category: "internal", subcategory: "gi_finanza" },
  { title: "Anagrafica", url: "/azienda/documenti/anagrafiche", icon: Users, permissionKey: "canViewForecast", featureKey: "billing_native", category: "internal", subcategory: "gi_finanza" },
  { title: "Registro Incassi", url: "/azienda/documenti/incassi", icon: Wallet, permissionKey: "canViewForecast", featureKey: "billing_native", category: "internal", subcategory: "gi_finanza" },
  { title: "Cassetto SDI", url: "/azienda/documenti/cassetto-sdi", icon: Shield, permissionKey: "canViewForecast", featureKey: "billing_native", category: "internal", subcategory: "gi_finanza" },
  { title: "Report", url: "/azienda/documenti/report", icon: BarChart3, permissionKey: "canViewForecast", featureKey: "billing_native", category: "internal", subcategory: "gi_finanza" },
  { title: "Prima Nota", url: "/azienda/prima-nota", icon: BookOpen, permissionKey: "canViewForecast", category: "internal", subcategory: "gi_finanza" },
  { title: "Ordini Acquisto", url: "/azienda/ordini-acquisto", icon: Package, permissionKey: "canViewForecast", category: "internal", subcategory: "gi_finanza" },
  
  { title: "Errori", url: "/azienda/errori", icon: AlertTriangle, permissionKey: "canViewOrders", moduleKey: "orders", category: "internal", subcategory: "gi_operazioni" },
  { title: "Messaggistica", url: "/azienda/messaggistica-beta", icon: MessageSquare, permissionKey: "canViewPersone", featureKey: "messaging_beta", isBeta: true, category: "internal", subcategory: "gi_team" },
  { title: "Chat Interna", url: "/azienda/chat", icon: MessageCircle, permissionKey: "canViewPersone", category: "internal", subcategory: "gi_team" },
  { title: "Personale & HR", url: "/azienda/personale", icon: Users, permissionKey: "canViewPersone", category: "internal", subcategory: "gi_team" },
  { title: "Automazioni", url: "/azienda/automazioni", icon: Zap, permissionKey: "canViewSettings", category: "internal", subcategory: "gi_automation" },
  { title: "Agenti AI Interni", url: "/azienda/agenti-ai?tipo=platform", icon: Headphones, permissionKey: "canViewSettings", featureKey: "ai_agents_internal", category: "internal", subcategory: "gi_automation" },
];

/** @deprecated Use macroAreas instead */
export const cruscottoNavItem: NavItem = {
  title: "Cruscotto Aziendale",
  url: "/azienda/cruscotto",
  icon: Gauge,
  permissionKey: "canViewCruscotto",
  category: "internal",
};

/** @deprecated Use macroAreas instead */
export const marketingNavItems: NavItem[] = [
  { title: "Dashboard", url: "/azienda/marketing", icon: LayoutDashboard, permissionKey: "canViewMarketingDashboard", category: "marketing", subcategory: "mkt_crm" },
  { title: "Contatti", url: "/azienda/marketing/contatti", icon: Contact, permissionKey: "canViewMarketingContacts", category: "marketing", subcategory: "mkt_crm" },
  { title: "Opportunità", url: "/azienda/marketing/opportunita", icon: Target, permissionKey: "canViewMarketingOpportunities", category: "marketing", subcategory: "mkt_crm" },
  { title: "Preventivi", url: "/azienda/marketing/preventivi", icon: FileSignature, permissionKey: "canViewMarketingOpportunities", category: "marketing", subcategory: "mkt_crm" },
  
  { title: "Appuntamenti", url: "/azienda/marketing/calendario", icon: CalendarDays, permissionKey: "canViewMarketingAppointments", category: "marketing", subcategory: "mkt_crm" },
  { title: "Email Marketing", url: "/azienda/marketing/email", icon: Mail, permissionKey: "canViewMarketingEmail", category: "marketing", subcategory: "mkt_comunicazione" },
  { title: "WhatsApp", url: "/azienda/marketing/whatsapp", icon: MessageCircle, permissionKey: "canViewMarketingWhatsapp", category: "marketing", subcategory: "mkt_comunicazione" },
  { title: "Automazioni", url: "/azienda/automazioni?tab=marketing", icon: Zap, permissionKey: "canViewMarketingAutomations", category: "marketing", subcategory: "mkt_automation" },
  { title: "Agenti AI", url: "/azienda/agenti-ai?tipo=custom", icon: Bot, permissionKey: "canViewMarketingAiAgent", category: "marketing", subcategory: "mkt_automation" },
  { title: "Sales OS", url: "/azienda/marketing/sales-os", icon: Zap, permissionKey: "canViewMarketingOpportunities", category: "marketing", subcategory: "mkt_analisi" },
  { title: "Reportistica", url: "/azienda/marketing/reportistica", icon: BarChart3, permissionKey: "canViewMarketingReports", category: "marketing", subcategory: "mkt_analisi" },
];
