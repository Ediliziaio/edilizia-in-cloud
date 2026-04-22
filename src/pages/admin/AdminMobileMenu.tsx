/**
 * Menu App mobile per SuperAdmin — griglia categorizzata di tutte le sezioni.
 * Ispirato al design di CampoMenu: sezioni raggruppate, ricerca, profilo utente.
 * Sostituisce la sidebar su mobile.
 */
import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  LayoutDashboard, Building, MessageSquare, CreditCard, Gift, Blocks,
  RefreshCw, LifeBuoy, Megaphone, Mail, Bot, ListChecks, ClipboardCheck,
  ShieldCheck, BarChart3, Users, Target, CalendarDays, Zap, MessageCircle,
  LineChart, Ticket, FileText, Settings, TrendingUp, BookOpen,
  FileUp, ShieldAlert, AlertTriangle,
  Search, LogOut, Settings2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface AppItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  url: string;
  color: string;
  permission: string;
}

interface AppSection {
  title: string;
  items: AppItem[];
}

const allSections: AppSection[] = [
  {
    title: "Overview",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", url: "/admin", color: "text-blue-600 bg-blue-50", permission: "can_view_platform_stats" },
    ],
  },
  {
    title: "Aziende",
    items: [
      { icon: Building, label: "Aziende", url: "/admin/aziende", color: "text-indigo-600 bg-indigo-50", permission: "can_manage_companies" },
    ],
  },
  {
    title: "Customer Success",
    items: [
      { icon: TrendingUp, label: "CS Dashboard", url: "/admin/cs-dashboard", color: "text-teal-600 bg-teal-50", permission: "can_impersonate" },
      { icon: MessageSquare, label: "Assistenza", url: "/admin/ticket", color: "text-blue-600 bg-blue-50", permission: "can_manage_tickets" },
      { icon: LifeBuoy, label: "Lifecycle", url: "/admin/lifecycle", color: "text-cyan-600 bg-cyan-50", permission: "can_manage_companies" },
      { icon: ClipboardCheck, label: "Task CS", url: "/admin/cs-tasks", color: "text-teal-600 bg-teal-50", permission: "can_manage_companies" },
      { icon: ListChecks, label: "Onboarding", url: "/admin/customer-success", color: "text-green-600 bg-green-50", permission: "can_manage_companies" },
      { icon: BookOpen, label: "Playbook", url: "/admin/playbooks", color: "text-violet-600 bg-violet-50", permission: "can_manage_companies" },
    ],
  },
  {
    title: "Revenue",
    items: [
      { icon: LineChart, label: "Revenue", url: "/admin/revenue", color: "text-emerald-600 bg-emerald-50", permission: "billing_read" },
      { icon: CreditCard, label: "Piani", url: "/admin/piani", color: "text-emerald-600 bg-emerald-50", permission: "can_manage_plans" },
      { icon: FileText, label: "Fatture", url: "/admin/fatture", color: "text-slate-600 bg-slate-50", permission: "billing_read" },
      { icon: Ticket, label: "Promo", url: "/admin/promo-codes", color: "text-amber-600 bg-amber-50", permission: "billing_write" },
      { icon: Settings2, label: "Dunning", url: "/admin/dunning", color: "text-rose-600 bg-rose-50", permission: "billing_write" },
    ],
  },
  {
    title: "Prodotto",
    items: [
      { icon: Blocks, label: "Feature Flags", url: "/admin/feature-flags", color: "text-orange-600 bg-orange-50", permission: "can_manage_companies" },
      { icon: Megaphone, label: "Annunci", url: "/admin/annunci", color: "text-pink-600 bg-pink-50", permission: "can_view_platform_stats" },
    ],
  },
  {
    title: "Operazioni",
    items: [
      { icon: RefreshCw, label: "Sync Logs", url: "/admin/sync-logs", color: "text-slate-600 bg-slate-50", permission: "can_view_platform_stats" },
      { icon: AlertTriangle, label: "Alert Failure", url: "/admin/failure-alerts", color: "text-red-600 bg-red-50", permission: "can_manage_companies" },
      { icon: FileUp, label: "Import CSV", url: "/admin/csv-import", color: "text-amber-600 bg-amber-50", permission: "can_manage_companies" },
      { icon: ShieldAlert, label: "Audit Log", url: "/admin/audit-log", color: "text-gray-600 bg-gray-50", permission: "can_manage_companies" },
      { icon: ShieldCheck, label: "GDPR", url: "/admin/gdpr", color: "text-green-600 bg-green-50", permission: "can_manage_companies" },
    ],
  },
  {
    title: "Marketing & Vendita",
    items: [
      { icon: BarChart3, label: "MKT Dashboard", url: "/admin/marketing", color: "text-blue-600 bg-blue-50", permission: "can_manage_marketing" },
      { icon: Users, label: "Contatti", url: "/admin/marketing/contatti", color: "text-indigo-600 bg-indigo-50", permission: "can_manage_marketing" },
      { icon: Target, label: "Opportunita", url: "/admin/marketing/opportunita", color: "text-emerald-600 bg-emerald-50", permission: "can_manage_marketing" },
      { icon: CalendarDays, label: "Calendario", url: "/admin/marketing/calendario", color: "text-orange-600 bg-orange-50", permission: "can_manage_marketing" },
      { icon: Mail, label: "Email MKT", url: "/admin/marketing/email", color: "text-rose-600 bg-rose-50", permission: "can_manage_marketing" },
      { icon: MessageCircle, label: "WhatsApp", url: "/admin/marketing/whatsapp", color: "text-green-600 bg-green-50", permission: "can_manage_marketing" },
      { icon: Zap, label: "Automazioni", url: "/admin/marketing/automazioni", color: "text-amber-600 bg-amber-50", permission: "can_manage_marketing" },
      { icon: Bot, label: "Agenti AI", url: "/admin/marketing/agenti-ai", color: "text-purple-600 bg-purple-50", permission: "can_manage_marketing" },
    ],
  },
  {
    title: "Growth",
    items: [
      { icon: Gift, label: "Referral", url: "/admin/referral", color: "text-pink-600 bg-pink-50", permission: "can_manage_referrals" },
    ],
  },
  {
    title: "Account",
    items: [
      { icon: Settings, label: "Impostazioni", url: "/admin/impostazioni", color: "text-gray-600 bg-gray-50", permission: "can_view_platform_stats" },
    ],
  },
];

export default function AdminMobileMenu() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { profile, signOut } = useAuth();
  const { permissions } = useSuperAdminPermissions();
  const [search, setSearch] = useState("");

  // Desktop: redirect to dashboard — this page is mobile-only
  if (!isMobile) return <Navigate to="/admin" replace />;

  const initials = (profile?.first_name?.[0] ?? "") + (profile?.last_name?.[0] ?? "");

  // Filter by permissions
  const permittedSections = allSections
    .map((s) => ({
      ...s,
      items: s.items.filter((item) => {
        const perm = item.permission as keyof typeof permissions;
        return permissions[perm] === true;
      }),
    }))
    .filter((s) => s.items.length > 0);

  // Filter by search
  const filteredSections = search.trim()
    ? permittedSections
        .map((s) => ({
          ...s,
          items: s.items.filter((i) =>
            i.label.toLowerCase().includes(search.toLowerCase())
          ),
        }))
        .filter((s) => s.items.length > 0)
    : permittedSections;

  return (
    <div className="space-y-5 max-w-3xl mx-auto pb-8">
      {/* Header profilo */}
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-foreground truncate">
            {profile?.first_name} {profile?.last_name}
          </p>
          <p className="text-xs text-muted-foreground">Super Admin</p>
        </div>
        <button
          onClick={() => signOut()}
          className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center active:scale-95 transition-all"
          title="Esci"
        >
          <LogOut className="w-5 h-5 text-red-500" />
        </button>
      </div>

      {/* Barra ricerca */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Cerca app"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-muted/80 border border-border/60 rounded-2xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
        />
      </div>

      {/* Sezioni */}
      {filteredSections.map((section) => (
        <div key={section.title} className="bg-background border border-border/60 rounded-2xl p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            {section.title}
          </p>
          <div className="grid grid-cols-4 gap-x-2 gap-y-4">
            {section.items.map((item) => {
              const [textColor, bgColor] = item.color.split(" ");
              return (
                <button
                  key={item.url + item.label}
                  onClick={() => navigate(item.url)}
                  className="flex flex-col items-center gap-2 py-1 rounded-xl transition-all active:scale-95"
                >
                  <div
                    className={cn(
                      "w-14 h-14 rounded-2xl flex items-center justify-center transition-all",
                      bgColor
                    )}
                  >
                    <item.icon className={cn("w-6 h-6", textColor)} />
                  </div>
                  <span className="text-[11px] font-medium text-foreground text-center leading-tight line-clamp-2 max-w-[72px]">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Nessun risultato */}
      {filteredSections.length === 0 && (
        <div className="text-center py-12">
          <Search className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Nessuna app trovata per &quot;{search}&quot;
          </p>
        </div>
      )}
    </div>
  );
}
