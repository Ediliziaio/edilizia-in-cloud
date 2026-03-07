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
  Database,
  CreditCard,
} from "lucide-react";
import type { ModuleKey } from "@/hooks/useSubscriptionLimits";

export interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  permissionKey?: string;
  moduleKey?: ModuleKey;
  isBeta?: boolean;
  category: "internal" | "marketing";
}

export const internalNavItems: NavItem[] = [
  { title: "Dashboard", url: "/azienda", icon: LayoutDashboard, permissionKey: "canViewDashboard", category: "internal" },
  { title: "Ordini", url: "/azienda/ordini", icon: ClipboardList, permissionKey: "canViewOrders", moduleKey: "orders", category: "internal" },
  { title: "Magazzino", url: "/azienda/magazzino", icon: Warehouse, permissionKey: "canViewWarehouse", moduleKey: "warehouse", category: "internal" },
  { title: "Calendario", url: "/azienda/calendario", icon: CalendarDays, permissionKey: "canViewCalendar", moduleKey: "calendar", category: "internal" },
  { title: "Clienti", url: "/azienda/clienti", icon: Users, permissionKey: "canViewCustomers", moduleKey: "customers", category: "internal" },
  { title: "Ticket Clienti", url: "/azienda/assistenza", icon: HeadphonesIcon, permissionKey: "canViewTickets", moduleKey: "tickets", category: "internal" },
  { title: "Previsionale", url: "/azienda/previsionale", icon: TrendingUp, permissionKey: "canViewForecast", moduleKey: "forecast", category: "internal" },
  { title: "Costi", url: "/azienda/costi", icon: Receipt, permissionKey: "canViewForecast", moduleKey: "forecast", category: "internal" },
  { title: "Attività", url: "/azienda/attivita", icon: CheckSquare, permissionKey: "canViewOrders", moduleKey: "orders", category: "internal" },
  { title: "Errori", url: "/azienda/errori", icon: AlertTriangle, permissionKey: "canViewOrders", moduleKey: "orders", category: "internal" },
  { title: "Messaggistica", url: "/azienda/messaggistica-beta", icon: MessageSquare, permissionKey: "canViewOrders", isBeta: true, category: "internal" },
  { title: "Automazioni", url: "/azienda/automazioni", icon: Zap, permissionKey: "canViewSettings", category: "internal" },
];

export const cruscottoNavItem: NavItem = {
  title: "Cruscotto Aziendale",
  url: "/azienda/cruscotto",
  icon: Gauge,
  permissionKey: "canViewCruscotto",
  category: "internal",
};

export const marketingNavItems: NavItem[] = [
  { title: "Dashboard", url: "/azienda/marketing", icon: LayoutDashboard, permissionKey: "canViewMarketingDashboard", category: "marketing" },
  { title: "Contatti", url: "/azienda/marketing/contatti", icon: Contact, permissionKey: "canViewMarketingContacts", category: "marketing" },
  { title: "Opportunità", url: "/azienda/marketing/opportunita", icon: Target, permissionKey: "canViewMarketingOpportunities", category: "marketing" },
  { title: "Attività", url: "/azienda/marketing/attivita", icon: CheckSquare, permissionKey: "canViewMarketingActivities", category: "marketing" },
  { title: "Appuntamenti", url: "/azienda/marketing/calendario", icon: CalendarDays, permissionKey: "canViewMarketingAppointments", category: "marketing" },
  { title: "Automazioni", url: "/azienda/marketing/automazioni", icon: Zap, permissionKey: "canViewMarketingAutomations", category: "marketing" },
  { title: "Agenti AI", url: "/azienda/marketing/agente-ai", icon: Bot, permissionKey: "canViewMarketingAiAgent", category: "marketing" },
  { title: "KB Globale", url: "/azienda/marketing/agente-ai/knowledge-base", icon: Database, permissionKey: "canViewMarketingAiAgent", category: "marketing" },
  { title: "Crediti AI", url: "/azienda/marketing/agente-ai/crediti", icon: CreditCard, permissionKey: "canViewMarketingAiAgent", category: "marketing" },
  { title: "Email Marketing", url: "/azienda/marketing/email", icon: Mail, permissionKey: "canViewMarketingEmail", category: "marketing" },
  { title: "WhatsApp", url: "/azienda/marketing/whatsapp", icon: MessageCircle, permissionKey: "canViewMarketingWhatsapp", category: "marketing" },
  { title: "Reportistica", url: "/azienda/marketing/reportistica", icon: BarChart3, permissionKey: "canViewMarketingReports", category: "marketing" },
];
