/**
 * Bottom navigation mobile per l'area azienda.
 * Dinamica e permission-aware: mostra voci diverse in base al profilo utente.
 *
 * Profili auto-rilevati:
 *  - Commerciale → Opportunità, Calendario CRM, Preventivi, Render AI
 *  - Ufficio/Admin → Ordini, Finanza, Calendario Lavori, Clienti
 *  - Operativo    → Cantieri, Giornale Lavori, Calendario, Interventi
 *  - Generico     → Ordini, Clienti, Calendario, Attività
 *
 * Visibile solo su mobile (< md). Nascosta nelle impostazioni.
 */
import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  HardHat,
  ClipboardList,
  Users,
  MoreHorizontal,
  Target,
  CalendarDays,
  FileSignature,
  Image,
  Euro,
  NotebookPen,
  Wrench,
  CheckSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { useNotifications } from "@/hooks/useNotifications";
import { usePermissions } from "@/hooks/usePermissions";
import type { Permissions } from "@/hooks/usePermissions";

/* ── Tipi ──────────────────────────────────────────────── */
interface BottomNavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  exact?: boolean;
  /** Chiave permesso da verificare (se omessa → sempre visibile) */
  permissionKey?: keyof Permissions;
}

type NavProfile = "commercial" | "office" | "operations" | "generic";

/* ── Item sets per profilo ─────────────────────────────── */

const COMMERCIAL_ITEMS: BottomNavItem[] = [
  { label: "Home", icon: LayoutDashboard, href: "/azienda", exact: true },
  { label: "Opportunità", icon: Target, href: "/azienda/marketing/opportunita", permissionKey: "canViewMarketingOpportunities" },
  { label: "Calendario", icon: CalendarDays, href: "/azienda/marketing/calendario", permissionKey: "canViewMarketingAppointments" },
  { label: "Preventivi", icon: FileSignature, href: "/azienda/marketing/preventivi", permissionKey: "canViewMarketingOpportunities" },
];

const OFFICE_ITEMS: BottomNavItem[] = [
  { label: "Home", icon: LayoutDashboard, href: "/azienda", exact: true },
  { label: "Ordini", icon: ClipboardList, href: "/azienda/ordini", permissionKey: "canViewOrders" },
  { label: "Finanza", icon: Euro, href: "/azienda/documenti", permissionKey: "canViewBilling" },
  { label: "Calendario", icon: CalendarDays, href: "/azienda/calendario", permissionKey: "canViewCalendar" },
];

const OPERATIONS_ITEMS: BottomNavItem[] = [
  { label: "Home", icon: LayoutDashboard, href: "/azienda", exact: true },
  { label: "Cantieri", icon: HardHat, href: "/azienda/ordini", permissionKey: "canViewOrders" },
  { label: "Giornale", icon: NotebookPen, href: "/azienda/giornale-lavori", permissionKey: "canViewGiornaleLavori" },
  { label: "Calendario", icon: CalendarDays, href: "/azienda/calendario", permissionKey: "canViewCalendar" },
];

const GENERIC_ITEMS: BottomNavItem[] = [
  { label: "Home", icon: LayoutDashboard, href: "/azienda", exact: true },
  { label: "Ordini", icon: ClipboardList, href: "/azienda/ordini", permissionKey: "canViewOrders" },
  { label: "Clienti", icon: Users, href: "/azienda/clienti", permissionKey: "canViewCustomers" },
  { label: "Calendario", icon: CalendarDays, href: "/azienda/calendario", permissionKey: "canViewCalendar" },
];

/* ── Auto-detect del profilo ───────────────────────────── */
function detectProfile(p: Permissions): NavProfile {
  // Commerciale: ha accesso a opportunità o calendario CRM
  if (p.canViewMarketingOpportunities || p.canViewMarketingAppointments) {
    return "commercial";
  }
  // Ufficio/Admin: ha accesso a finanza
  if (p.canViewBilling || p.canViewPrimaNota || p.canViewTesoreria) {
    return "office";
  }
  // Operativo: ha accesso a giornale lavori o interventi
  if (p.canViewGiornaleLavori || p.canViewInterventi) {
    return "operations";
  }
  return "generic";
}

const PROFILE_MAP: Record<NavProfile, BottomNavItem[]> = {
  commercial: COMMERCIAL_ITEMS,
  office: OFFICE_ITEMS,
  operations: OPERATIONS_ITEMS,
  generic: GENERIC_ITEMS,
};

/* ── Componente ────────────────────────────────────────── */
export function MobileBottomNav() {
  const location = useLocation();
  const { toggleSidebar } = useSidebar();
  const { unreadCount } = useNotifications();
  const permissions = usePermissions();

  // Nascondi nelle impostazioni
  if (location.pathname.startsWith("/azienda/impostazioni")) return null;

  // Rileva il profilo e filtra solo item accessibili
  const navItems = useMemo(() => {
    if (permissions.isLoading) return GENERIC_ITEMS; // fallback durante il caricamento
    const profile = detectProfile(permissions);
    const items = PROFILE_MAP[profile];
    // Filtra gli item in base ai permessi effettivi
    return items.filter((item) => {
      if (!item.permissionKey) return true;
      return permissions[item.permissionKey] === true;
    });
  }, [permissions]);

  const isActive = (item: BottomNavItem) => {
    if (item.exact) return location.pathname === item.href;
    return location.pathname.startsWith(item.href);
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border/50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navigazione principale"
    >
      <div className="flex items-stretch h-16">
        {navItems.map(({ label, icon: Icon, href }) => {
          const active = isActive({ label, icon: Icon, href, exact: href === "/azienda" });
          return (
            <Link
              key={href}
              to={href}
              className="flex-1 flex flex-col items-center justify-center gap-1 relative min-w-0"
              aria-label={label}
              aria-current={active ? "page" : undefined}
            >
              <div
                className={cn(
                  "flex items-center justify-center rounded-2xl transition-all duration-200",
                  active ? "bg-blue-50 w-12 h-8" : "w-10 h-8"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 transition-all duration-200",
                    active
                      ? "text-blue-600 stroke-[2.5]"
                      : "text-muted-foreground stroke-[1.5]"
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-[10px] leading-none transition-all duration-200",
                  active
                    ? "text-blue-600 font-semibold"
                    : "text-muted-foreground font-medium"
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}

        {/* Menu — sempre presente come ultimo elemento */}
        <button
          className="flex-1 flex flex-col items-center justify-center gap-1 relative min-w-0"
          onClick={toggleSidebar}
          aria-label="Apri menu completo"
          type="button"
        >
          <div className="relative flex items-center justify-center w-10 h-8">
            <MoreHorizontal className="h-5 w-5 text-muted-foreground stroke-[1.5]" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-[9px] font-bold leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </div>
          <span className="text-[10px] leading-none text-muted-foreground font-medium">
            Altro
          </span>
        </button>
      </div>
    </nav>
  );
}
