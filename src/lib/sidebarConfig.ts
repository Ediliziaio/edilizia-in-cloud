import {
  LayoutDashboard,
  ClipboardList,
  Users,
  HeadphonesIcon,
  TrendingUp,
  Receipt,
  Warehouse,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  Clock,
  Palmtree,
  User,
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
  Wallet,
  Shield,
  HardHat,
  Euro,
  Users2,
  Megaphone,
  LifeBuoy,
  CalendarClock,
  BookUser,
  Coins,
  Archive,
  TrendingDown,
  ContactRound,
  UserCheck,
  MessagesSquare,
  PieChart,
  Workflow,
  LayoutGrid,
  ShieldAlert,
  NotebookPen,
  Rocket,
  Image,
  Wrench,
  Settings,
  MousePointerClick,
  Camera,
  GanttChart,
  Calculator,
  ShieldCheck,
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

export interface MacroArea {
  id: string;
  title: string;
  icon: LucideIcon;
  items: NavItem[];
}

export const macroAreas: MacroArea[] = [
  // 0. Area personale — visibile SOLO a company_staff (filtrata in CompanyLayout.tsx)
  {
    id: "area_personale_staff",
    title: "La mia area",
    icon: User,
    items: [
      { title: "Le mie Attività",    url: "/azienda/attivita",              icon: ClipboardCheck },
      { title: "Le mie Timbrature",  url: "/azienda/timbrature-personali",  icon: Clock },
      { title: "Ferie e Permessi",   url: "/azienda/ferie-personali",       icon: Palmtree },
      { title: "I miei Cedolini",    url: "/azienda/cedolini-personali",    icon: Receipt },
    ],
  },

  // 1. Cruscotto — standalone top items
  {
    id: "area_cruscotto",
    title: "Cruscotto",
    icon: LayoutGrid,
    items: [
      { title: "Cruscotto", url: "/azienda/cruscotto", icon: LayoutGrid, permissionKey: "canViewCruscotto" },
      { title: "Attività", url: "/azienda/attivita", icon: CheckSquare },
      { title: "Chat Team", url: "/azienda/chat", icon: MessagesSquare }, // no gate — accessible to all authenticated users
      { title: "Setup Guidato", url: "/azienda/onboarding", icon: Rocket },
    ],
  },

  // 2. Cantieri & Lavori
  {
    id: "area_cantieri",
    title: "Cantieri & Lavori",
    icon: HardHat,
    items: [
      // ─── Operativo ───
      { title: "Ordini", url: "/azienda/ordini", icon: ClipboardList, permissionKey: "canViewOrders", moduleKey: "orders" },
      { title: "Magazzino", url: "/azienda/magazzino", icon: Warehouse, permissionKey: "canViewWarehouse", moduleKey: "warehouse" },
      { title: "Clienti", url: "/azienda/clienti", icon: Users, permissionKey: "canViewCustomers", moduleKey: "customers" },
      { title: "Subappaltatori", url: "/azienda/subappaltatori", icon: HardHat, permissionKey: "canViewSubappaltatori" },
      // ─── Pianificazione ───
      { title: "Assistenza", url: "/azienda/assistenza", icon: LifeBuoy, permissionKey: "canViewTickets", moduleKey: "tickets", groupLabel: "Pianificazione" },
      { title: "Interventi", url: "/azienda/interventi", icon: Wrench, permissionKey: "canViewInterventi", groupLabel: "Pianificazione" },
      { title: "Manutenzione", url: "/azienda/manutenzione", icon: Settings, permissionKey: "canViewManutenzione", groupLabel: "Pianificazione" },
      { title: "Calendario", url: "/azienda/calendario", icon: CalendarDays, permissionKey: "canViewCalendar", moduleKey: "calendar" },
      // ─── Controllo ───
      { title: "Sicurezza Cantiere", url: "/azienda/sicurezza-cantiere", icon: ShieldAlert, permissionKey: "canViewSicurezzaCantiere" },
      { title: "Gantt Cantieri", url: "/azienda/gantt-ordini", icon: GanttChart, permissionKey: "canViewCalendar", groupLabel: "Pianificazione" },
      { title: "Foto Cantiere", url: "/azienda/foto-cantiere", icon: Camera, permissionKey: "canViewOrders" },
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
      { title: "Rubrica Fiscale", url: "/azienda/documenti/anagrafiche", icon: BookUser, permissionKey: "canViewBilling", featureKey: "billing_native" },
      { title: "Registro Incassi", url: "/azienda/documenti/incassi", icon: Coins, permissionKey: "canViewBilling", featureKey: "billing_native" },
      { title: "Cassetto SDI", url: "/azienda/documenti/cassetto-sdi", icon: Archive, permissionKey: "canViewBilling", featureKey: "billing_native" },
      // Report Fiscali e Impostazioni Fatt. rimosse dalla sidebar (non navigazione quotidiana).
      // Le pagine restano intatte e raggiungibili dall'header della pagina Fatture.
      // ─── Fatturazione esterna (billing_external) ───
      { title: "Fatturazione", url: "/azienda/fatturazione", icon: Receipt, permissionKey: "canViewBilling", featureKey: "billing_external", groupLabel: "Fatturazione e Documenti" },
      { title: "Scadenzario", url: "/azienda/scadenzario", icon: CalendarClock, permissionKey: "canViewScadenzario", featureKey: "billing_external" },
      // ─── Contabilità ───
      { title: "Prima Nota", url: "/azienda/prima-nota", icon: BookOpen, permissionKey: "canViewPrimaNota", groupLabel: "Contabilità" },
      { title: "Tesoreria", url: "/azienda/tesoreria", icon: Landmark, permissionKey: "canViewTesoreria" },
      { title: "Costi", url: "/azienda/costi", icon: TrendingDown, permissionKey: "canViewCosts", moduleKey: "forecast" },
      { title: "Previsionale", url: "/azienda/previsionale", icon: TrendingUp, permissionKey: "canViewForecast", moduleKey: "forecast" },
      { title: "Contabilità Fiscale", url: "/azienda/contabilita-fiscale", icon: Calculator, permissionKey: "canViewPrimaNota", groupLabel: "Fiscale" },
      { title: "Ritenute Garanzia", url: "/azienda/ritenute-garanzia", icon: ShieldCheck, permissionKey: "canViewOrders", groupLabel: "Fiscale" },
      { title: "Archivio Sostitutivo", url: "/azienda/archivio-sostitutivo", icon: Archive, permissionKey: "canViewPrimaNota", groupLabel: "Fiscale" },
    ],
  },

  // 4. Persone
  {
    id: "area_persone",
    title: "Persone",
    icon: Users2,
    items: [
      { title: "Personale & HR", url: "/azienda/personale", icon: UserCheck, permissionKey: "canViewPersone" },
      { title: "Giornale Lavori", url: "/azienda/giornale-lavori", icon: NotebookPen, permissionKey: "canViewGiornaleLavori" },
      { title: "Messaggi Esterni", url: "/azienda/messaggistica-beta", icon: MessageSquare, permissionKey: "canViewMessaggiEsterni" },
    ],
  },

  // 5. Marketing & Vendita
  {
    id: "area_marketing",
    title: "Marketing & Vendita",
    icon: Megaphone,
    items: [
      { title: "Contatti CRM", url: "/azienda/marketing/contatti", icon: ContactRound, permissionKey: "canViewMarketingContacts" },
      { title: "Opportunità", url: "/azienda/marketing/opportunita", icon: Target, permissionKey: "canViewMarketingOpportunities" },
      { title: "Preventivi CRM", url: "/azienda/marketing/preventivi", icon: FileSignature, permissionKey: "canViewMarketingOpportunities" },
      { title: "Documenti & FEA", url: "/azienda/firma-elettronica", icon: FileSignature, permissionKey: "canViewMarketingOpportunities" },
      { title: "Calendario CRM", url: "/azienda/marketing/calendario", icon: CalendarDays, permissionKey: "canViewMarketingAppointments" },
      { title: "Sales OS", url: "/azienda/marketing/sales-os", icon: Gauge, permissionKey: "canViewSalesOs" },
      { title: "Reportistica", url: "/azienda/marketing/reportistica", icon: PieChart, permissionKey: "canViewMarketingReports" },
    ],
  },

  // 6. Automazioni & AI — Email · SMS · WhatsApp stub · Automazioni · Agenti · Render
  {
    id: "area_automazioni",
    title: "Automazioni & AI",
    icon: Zap,
    items: [
      // ─── Canali comunicazione ───
      { title: "Email Marketing", url: "/azienda/marketing/email", icon: Mail, permissionKey: "canViewMarketingEmail", groupLabel: "Comunicazione" },
      { title: "SMS Marketing", url: "/azienda/sms-marketing", icon: MessageSquare, permissionKey: "canViewSmsMarketing" },
      { title: "SMS Transazionale", url: "/azienda/sms", icon: MessageSquare, permissionKey: "canViewSmsMarketing" },
      { title: "WhatsApp", url: "/azienda/marketing/whatsapp", icon: MessageCircle, permissionKey: "canViewMarketingWhatsapp" },
      // ─── Automazione ───
      { title: "Automazioni", url: "/azienda/automazioni", icon: Workflow, permissionKey: "canViewAutomazioni", groupLabel: "Automazione" },
      { title: "Agenti AI", url: "/azienda/agenti-ai", icon: Bot, permissionKey: "canViewMarketingAiAgent" },
      { title: "Render AI", url: "/azienda/render", icon: Image, permissionKey: "canViewRenderAi" },
    ],
  },
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
  { title: "Tesoreria", url: "/azienda/tesoreria", icon: Landmark, permissionKey: "canViewTesoreria", category: "internal", subcategory: "gi_finanza" },
  { title: "Fatturazione", url: "/azienda/fatturazione", icon: FileText, permissionKey: "canViewForecast", featureKey: "billing_external", category: "internal", subcategory: "gi_finanza" },
  { title: "Scadenzario", url: "/azienda/scadenzario", icon: CalendarDays, permissionKey: "canViewForecast", featureKey: "billing_external", category: "internal", subcategory: "gi_finanza" },
  { title: "Fatturazione", url: "/azienda/documenti", icon: FileText, permissionKey: "canViewForecast", featureKey: "billing_native", category: "internal", subcategory: "gi_finanza" },
  { title: "Rubrica Fiscale", url: "/azienda/documenti/anagrafiche", icon: Users, permissionKey: "canViewForecast", featureKey: "billing_native", category: "internal", subcategory: "gi_finanza" },
  { title: "Registro Incassi", url: "/azienda/documenti/incassi", icon: Wallet, permissionKey: "canViewForecast", featureKey: "billing_native", category: "internal", subcategory: "gi_finanza" },
  { title: "Cassetto SDI", url: "/azienda/documenti/cassetto-sdi", icon: Shield, permissionKey: "canViewForecast", featureKey: "billing_native", category: "internal", subcategory: "gi_finanza" },
  // "Report" rimosso da internalNavItems (allineato con rimozione da sidebar principale)
  { title: "Prima Nota", url: "/azienda/prima-nota", icon: BookOpen, permissionKey: "canViewForecast", category: "internal", subcategory: "gi_finanza" },
  
  { title: "Messaggi Esterni", url: "/azienda/messaggistica-beta", icon: MessageSquare, permissionKey: "canViewMessaggiEsterni", featureKey: "messaging_beta", isBeta: true, category: "internal", subcategory: "gi_team" },
  { title: "Chat Team", url: "/azienda/chat", icon: MessageCircle, permissionKey: "canViewPersone", category: "internal", subcategory: "gi_team" },
  { title: "Personale & HR", url: "/azienda/personale", icon: Users, permissionKey: "canViewPersone", category: "internal", subcategory: "gi_team" },
  { title: "Automazioni", url: "/azienda/automazioni", icon: Zap, permissionKey: "canViewAutomazioni", category: "internal", subcategory: "gi_automation" },
  { title: "Agenti AI Interni", url: "/azienda/agenti-ai?tipo=platform", icon: Headphones, permissionKey: "canViewSettings", featureKey: "ai_agents_internal", category: "internal", subcategory: "gi_automation" },
];

/** @deprecated Use macroAreas instead */
export const marketingNavItems: NavItem[] = [
  { title: "Dashboard", url: "/azienda/marketing", icon: LayoutDashboard, permissionKey: "canViewMarketingDashboard", category: "marketing", subcategory: "mkt_crm" },
  { title: "Contatti", url: "/azienda/marketing/contatti", icon: Contact, permissionKey: "canViewMarketingContacts", category: "marketing", subcategory: "mkt_crm" },
  { title: "Opportunità", url: "/azienda/marketing/opportunita", icon: Target, permissionKey: "canViewMarketingOpportunities", category: "marketing", subcategory: "mkt_crm" },
  { title: "Preventivi", url: "/azienda/marketing/preventivi", icon: FileSignature, permissionKey: "canViewMarketingOpportunities", category: "marketing", subcategory: "mkt_crm" },
  
  { title: "Appuntamenti", url: "/azienda/marketing/calendario", icon: CalendarDays, permissionKey: "canViewMarketingAppointments", category: "marketing", subcategory: "mkt_crm" },

  { title: "Email Marketing", url: "/azienda/marketing/email", icon: Mail, permissionKey: "canViewMarketingEmail", category: "marketing", subcategory: "mkt_comunicazione" },
  { title: "SMS Marketing", url: "/azienda/marketing/sms", icon: MessageSquare, permissionKey: "canViewMarketingEmail", category: "marketing", subcategory: "mkt_comunicazione" },
  { title: "SMS Transazionale", url: "/azienda/sms", icon: MessageSquare, permissionKey: "canViewSmsMarketing", category: "marketing", subcategory: "mkt_comunicazione" },
  { title: "WhatsApp", url: "/azienda/marketing/whatsapp", icon: MessageCircle, permissionKey: "canViewMarketingWhatsapp", category: "marketing", subcategory: "mkt_comunicazione" },
  { title: "Automazioni", url: "/azienda/automazioni?tab=marketing", icon: Zap, permissionKey: "canViewMarketingAutomations", category: "marketing", subcategory: "mkt_automation" },
  { title: "Agenti AI", url: "/azienda/agenti-ai?tipo=custom", icon: Bot, permissionKey: "canViewMarketingAiAgent", category: "marketing", subcategory: "mkt_automation" },
  { title: "Sales OS", url: "/azienda/marketing/sales-os", icon: Zap, permissionKey: "canViewMarketingOpportunities", category: "marketing", subcategory: "mkt_analisi" },
  { title: "Reportistica", url: "/azienda/marketing/reportistica", icon: BarChart3, permissionKey: "canViewMarketingReports", category: "marketing", subcategory: "mkt_analisi" },
];
