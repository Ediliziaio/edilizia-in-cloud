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
  Zap,
  Contact,
  Target,
  Bot,
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

export const marketingNavItems: NavItem[] = [
  { title: "Dashboard", url: "/azienda/marketing", icon: LayoutDashboard, category: "marketing" },
  { title: "Contatti", url: "/azienda/marketing/contatti", icon: Contact, category: "marketing" },
  { title: "Opportunità", url: "/azienda/marketing/opportunita", icon: Target, category: "marketing" },
  { title: "Calendario", url: "/azienda/marketing/calendario", icon: CalendarDays, category: "marketing" },
  { title: "Automazioni", url: "/azienda/marketing/automazioni", icon: Zap, category: "marketing" },
  { title: "Agente AI", url: "/azienda/marketing/agente-ai", icon: Bot, category: "marketing" },
];
