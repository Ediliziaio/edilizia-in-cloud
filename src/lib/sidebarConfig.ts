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
} from "lucide-react";
import type { ModuleKey } from "@/hooks/useSubscriptionLimits";

export interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  permissionKey?: string;
  moduleKey?: ModuleKey;
  featureKey?: string;
  isBeta?: boolean;
  category: "internal" | "marketing";
  subcategory?: string;
}

export interface SubcategoryConfig {
  id: string;
  label: string;
}

export const internalSubcategories: SubcategoryConfig[] = [
  { id: "gi_operazioni", label: "Operazioni" },
  { id: "gi_supporto", label: "Clienti & Supporto" },
  { id: "gi_finanza", label: "Finanza" },
  { id: "gi_team", label: "Team" },
  { id: "gi_automation", label: "Automazione & AI" },
];

export const marketingSubcategories: SubcategoryConfig[] = [
  { id: "mkt_crm", label: "CRM" },
  { id: "mkt_comunicazione", label: "Comunicazione" },
  { id: "mkt_automation", label: "Automazione & AI" },
  { id: "mkt_analisi", label: "Analisi" },
];

export const internalNavItems: NavItem[] = [
  { title: "Dashboard", url: "/azienda", icon: LayoutDashboard, permissionKey: "canViewDashboard", category: "internal", subcategory: "gi_operazioni" },
  { title: "Ordini", url: "/azienda/ordini", icon: ClipboardList, permissionKey: "canViewOrders", moduleKey: "orders", category: "internal", subcategory: "gi_operazioni" },
  { title: "Magazzino", url: "/azienda/magazzino", icon: Warehouse, permissionKey: "canViewWarehouse", moduleKey: "warehouse", category: "internal", subcategory: "gi_operazioni" },
  { title: "Calendario", url: "/azienda/calendario", icon: CalendarDays, permissionKey: "canViewCalendar", moduleKey: "calendar", category: "internal", subcategory: "gi_operazioni" },
  { title: "Clienti", url: "/azienda/clienti", icon: Users, permissionKey: "canViewCustomers", moduleKey: "customers", category: "internal", subcategory: "gi_supporto" },
  { title: "Ticket Clienti", url: "/azienda/assistenza", icon: HeadphonesIcon, permissionKey: "canViewTickets", moduleKey: "tickets", category: "internal", subcategory: "gi_supporto" },
  { title: "Previsionale", url: "/azienda/previsionale", icon: TrendingUp, permissionKey: "canViewForecast", moduleKey: "forecast", category: "internal", subcategory: "gi_finanza" },
  { title: "Costi", url: "/azienda/costi", icon: Receipt, permissionKey: "canViewForecast", moduleKey: "forecast", category: "internal", subcategory: "gi_finanza" },
  { title: "Tesoreria", url: "/azienda/tesoreria", icon: Landmark, permissionKey: "canViewDashboard", featureKey: "tesoreria", category: "internal", subcategory: "gi_finanza" },
  { title: "Fatturazione", url: "/azienda/fatturazione", icon: FileText, permissionKey: "canViewForecast", category: "internal", subcategory: "gi_finanza" },
  { title: "Scadenzario", url: "/azienda/scadenzario", icon: CalendarDays, permissionKey: "canViewForecast", category: "internal", subcategory: "gi_finanza" },
  { title: "Report Fatture", url: "/azienda/report-fatturazione", icon: BarChart3, permissionKey: "canViewForecast", category: "internal", subcategory: "gi_finanza" },
  { title: "Prima Nota", url: "/azienda/prima-nota", icon: BookOpen, permissionKey: "canViewForecast", category: "internal", subcategory: "gi_finanza" },
  { title: "Fornitori", url: "/azienda/fornitori", icon: Truck, permissionKey: "canViewForecast", category: "internal", subcategory: "gi_finanza" },
  { title: "Attività", url: "/azienda/attivita", icon: CheckSquare, permissionKey: "canViewOrders", moduleKey: "orders", category: "internal", subcategory: "gi_team" },
  { title: "Errori", url: "/azienda/errori", icon: AlertTriangle, permissionKey: "canViewOrders", moduleKey: "orders", category: "internal", subcategory: "gi_operazioni" },
  { title: "Messaggistica", url: "/azienda/messaggistica-beta", icon: MessageSquare, permissionKey: "canViewOrders", featureKey: "messaging_beta", isBeta: true, category: "internal", subcategory: "gi_team" },
  { title: "Chat Interna", url: "/azienda/chat", icon: MessageCircle, category: "internal", subcategory: "gi_team" },
  { title: "Automazioni", url: "/azienda/automazioni", icon: Zap, permissionKey: "canViewSettings", category: "internal", subcategory: "gi_automation" },
  { title: "Agenti AI Interni", url: "/azienda/agente-interno", icon: Headphones, permissionKey: "canViewSettings", featureKey: "ai_agents_internal", category: "internal", subcategory: "gi_automation" },
];

export const cruscottoNavItem: NavItem = {
  title: "Cruscotto Aziendale",
  url: "/azienda/cruscotto",
  icon: Gauge,
  permissionKey: "canViewCruscotto",
  category: "internal",
};

export const marketingNavItems: NavItem[] = [
  { title: "Dashboard", url: "/azienda/marketing", icon: LayoutDashboard, permissionKey: "canViewMarketingDashboard", category: "marketing", subcategory: "mkt_crm" },
  { title: "Contatti", url: "/azienda/marketing/contatti", icon: Contact, permissionKey: "canViewMarketingContacts", category: "marketing", subcategory: "mkt_crm" },
  { title: "Opportunità", url: "/azienda/marketing/opportunita", icon: Target, permissionKey: "canViewMarketingOpportunities", category: "marketing", subcategory: "mkt_crm" },
  { title: "Preventivi", url: "/azienda/marketing/preventivi", icon: FileSignature, permissionKey: "canViewMarketingOpportunities", category: "marketing", subcategory: "mkt_crm" },
  { title: "Attività", url: "/azienda/marketing/attivita", icon: CheckSquare, permissionKey: "canViewMarketingActivities", category: "marketing", subcategory: "mkt_crm" },
  { title: "Appuntamenti", url: "/azienda/marketing/calendario", icon: CalendarDays, permissionKey: "canViewMarketingAppointments", category: "marketing", subcategory: "mkt_crm" },
  { title: "Email Marketing", url: "/azienda/marketing/email", icon: Mail, permissionKey: "canViewMarketingEmail", category: "marketing", subcategory: "mkt_comunicazione" },
  { title: "WhatsApp", url: "/azienda/marketing/whatsapp", icon: MessageCircle, permissionKey: "canViewMarketingWhatsapp", category: "marketing", subcategory: "mkt_comunicazione" },
  { title: "Automazioni", url: "/azienda/marketing/automazioni", icon: Zap, permissionKey: "canViewMarketingAutomations", category: "marketing", subcategory: "mkt_automation" },
  { title: "Agenti AI", url: "/azienda/marketing/agente-ai", icon: Bot, permissionKey: "canViewMarketingAiAgent", category: "marketing", subcategory: "mkt_automation" },
  { title: "Reportistica", url: "/azienda/marketing/reportistica", icon: BarChart3, permissionKey: "canViewMarketingReports", category: "marketing", subcategory: "mkt_analisi" },
];
