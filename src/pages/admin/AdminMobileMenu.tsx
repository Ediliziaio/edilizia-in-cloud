/**
 * Menu App mobile per SuperAdmin — griglia categorizzata di tutte le sezioni.
 * Ispirato al design di CampoMenu: sezioni raggruppate, ricerca, profilo utente.
 * Sostituisce la sidebar su mobile.
 */
import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  LayoutDashboard, Building, MessageSquare, Gift, Blocks,
  LifeBuoy, Megaphone, Mail, ClipboardCheck,
  Users, Target, CalendarDays, MessageCircle,
  LineChart, Settings, AlertTriangle,
  Search, LogOut,
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

// Le stesse pagine del menu da computer, con gli indirizzi veri (prima quasi
// tutte puntavano a rimandi) e senza gli strumenti da scrivania: niente import
// CSV né Operazioni da telefono (stanno nelle Impostazioni).
const allSections: AppSection[] = [
  {
    title: "Panoramica",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", url: "/admin", color: "text-blue-600 bg-blue-50", permission: "can_view_platform_stats" },
    ],
  },
  {
    title: "Clienti",
    items: [
      { icon: Building, label: "Aziende", url: "/admin/aziende", color: "text-indigo-600 bg-indigo-50", permission: "super_admin" },
      { icon: Users, label: "Utenti", url: "/admin/utenti", color: "text-indigo-600 bg-indigo-50", permission: "super_admin" },
      { icon: LifeBuoy, label: "Assistenza", url: "/admin/cs", color: "text-teal-600 bg-teal-50", permission: "can_manage_companies" },
      { icon: ClipboardCheck, label: "Attività", url: "/admin/attivita", color: "text-teal-600 bg-teal-50", permission: "can_manage_companies" },
    ],
  },
  {
    title: "Fatturato",
    items: [
      { icon: LineChart, label: "Fatturato", url: "/admin/fatturato", color: "text-emerald-600 bg-emerald-50", permission: "billing_read" },
      { icon: AlertTriangle, label: "Insoluti", url: "/admin/insoluti", color: "text-rose-600 bg-rose-50", permission: "billing_read" },
    ],
  },
  {
    title: "Prodotto",
    items: [
      { icon: Blocks, label: "Funzionalità", url: "/admin/feature-flags", color: "text-orange-600 bg-orange-50", permission: "super_admin" },
      { icon: Megaphone, label: "Annunci", url: "/admin/annunci", color: "text-pink-600 bg-pink-50", permission: "can_view_platform_stats" },
    ],
  },
  {
    title: "Marketing e vendita",
    items: [
      { icon: LayoutDashboard, label: "Dashboard CRM", url: "/admin/marketing/dashboard", color: "text-blue-600 bg-blue-50", permission: "can_manage_marketing" },
      { icon: Users, label: "Contatti", url: "/admin/marketing/contatti", color: "text-indigo-600 bg-indigo-50", permission: "crm_operatore" },
      { icon: Target, label: "Opportunità", url: "/admin/marketing/opportunita", color: "text-emerald-600 bg-emerald-50", permission: "crm_operatore" },
      { icon: CalendarDays, label: "Calendario", url: "/admin/marketing/calendario", color: "text-orange-600 bg-orange-50", permission: "crm_operatore" },
      { icon: Mail, label: "Email", url: "/admin/marketing/email", color: "text-rose-600 bg-rose-50", permission: "can_manage_marketing" },
      { icon: MessageCircle, label: "WhatsApp", url: "/admin/marketing/whatsapp", color: "text-green-600 bg-green-50", permission: "can_manage_marketing" },
      { icon: MessageSquare, label: "WhatsApp telefono", url: "/admin/marketing/whatsapp-locale", color: "text-green-600 bg-green-50", permission: "can_manage_marketing" },
    ],
  },
  {
    title: "Growth",
    items: [
      { icon: Gift, label: "Referral", url: "/admin/referral", color: "text-pink-600 bg-pink-50", permission: "super_admin" },
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
