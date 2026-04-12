/**
 * Bottom navigation mobile per l'area azienda.
 * Dinamica e permission-aware: mostra voci diverse in base al profilo utente.
 * Chat Team è sempre presente per tutti.
 * "App" apre una schermata full-screen con tutte le sezioni accessibili.
 *
 * Profili auto-rilevati:
 *  - Commerciale → Opportunità, Calendario CRM
 *  - Ufficio/Admin → Ordini, Finanza
 *  - Operativo    → Cantieri, Giornale Lavori
 *  - Generico     → Ordini, Clienti
 *
 * Visibile solo su mobile (< md). Nascosta nelle impostazioni.
 */
import { useState, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  HardHat,
  ClipboardList,
  Users,
  LayoutGrid,
  Target,
  CalendarDays,
  Euro,
  NotebookPen,
  MessagesSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/useNotifications";
import { usePermissions } from "@/hooks/usePermissions";
import type { Permissions } from "@/hooks/usePermissions";
import { MobileAppGrid } from "@/components/layouts/MobileAppGrid";

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

/* ── Item sets per profilo (solo 2 item dinamici — Home e Chat sono fissi) */

const COMMERCIAL_ITEMS: BottomNavItem[] = [
  { label: "Opportunità", icon: Target, href: "/azienda/marketing/opportunita", permissionKey: "canViewMarketingOpportunities" },
  { label: "Calendario", icon: CalendarDays, href: "/azienda/marketing/calendario", permissionKey: "canViewMarketingAppointments" },
];

const OFFICE_ITEMS: BottomNavItem[] = [
  { label: "Ordini", icon: ClipboardList, href: "/azienda/ordini", permissionKey: "canViewOrders" },
  { label: "Finanza", icon: Euro, href: "/azienda/documenti", permissionKey: "canViewBilling" },
];

const OPERATIONS_ITEMS: BottomNavItem[] = [
  { label: "Cantieri", icon: HardHat, href: "/azienda/ordini", permissionKey: "canViewOrders" },
  { label: "Giornale", icon: NotebookPen, href: "/azienda/giornale-lavori", permissionKey: "canViewGiornaleLavori" },
];

const GENERIC_ITEMS: BottomNavItem[] = [
  { label: "Ordini", icon: ClipboardList, href: "/azienda/ordini", permissionKey: "canViewOrders" },
  { label: "Clienti", icon: Users, href: "/azienda/clienti", permissionKey: "canViewCustomers" },
];

/* ── Auto-detect del profilo ───────────────────────────── */
function detectProfile(p: Permissions): NavProfile {
  if (p.canViewMarketingOpportunities || p.canViewMarketingAppointments) return "commercial";
  if (p.canViewBilling || p.canViewPrimaNota || p.canViewTesoreria) return "office";
  if (p.canViewGiornaleLavori || p.canViewInterventi) return "operations";
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
  const { unreadCount } = useNotifications();
  const permissions = usePermissions();
  const [appGridOpen, setAppGridOpen] = useState(false);

  // Nascondi nelle impostazioni
  if (location.pathname.startsWith("/azienda/impostazioni")) return null;

  // Rileva il profilo e filtra solo item accessibili
  const dynamicItems = useMemo(() => {
    if (permissions.isLoading) return GENERIC_ITEMS;
    const profile = detectProfile(permissions);
    const items = PROFILE_MAP[profile];
    return items.filter((item) => {
      if (!item.permissionKey) return true;
      return permissions[item.permissionKey] === true;
    });
  }, [permissions]);

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return location.pathname === href;
    return location.pathname.startsWith(href);
  };

  // Layout fisso: Home | [dynamic1] | Chat | [dynamic2] | App
  const navSlots: Array<{ type: "link"; label: string; icon: React.ComponentType<{ className?: string }>; href: string; exact?: boolean } | { type: "app" }> = [
    { type: "link", label: "Home", icon: LayoutDashboard, href: "/azienda", exact: true },
    ...(dynamicItems[0] ? [{ type: "link" as const, label: dynamicItems[0].label, icon: dynamicItems[0].icon, href: dynamicItems[0].href }] : []),
    { type: "link", label: "Chat", icon: MessagesSquare, href: "/azienda/chat" },
    ...(dynamicItems[1] ? [{ type: "link" as const, label: dynamicItems[1].label, icon: dynamicItems[1].icon, href: dynamicItems[1].href }] : []),
    { type: "app" },
  ];

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border/50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Navigazione principale"
      >
        <div className="flex items-stretch h-16">
          {navSlots.map((slot, i) => {
            if (slot.type === "app") {
              return (
                <button
                  key="app"
                  className="flex-1 flex flex-col items-center justify-center gap-1 relative min-w-0"
                  onClick={() => setAppGridOpen(true)}
                  aria-label="Apri menu app"
                  type="button"
                >
                  <div className={cn(
                    "relative flex items-center justify-center w-10 h-8",
                    appGridOpen && "bg-blue-50 rounded-2xl w-12"
                  )}>
                    <LayoutGrid className={cn(
                      "h-5 w-5 stroke-[1.5]",
                      appGridOpen ? "text-blue-600 stroke-[2.5]" : "text-muted-foreground"
                    )} />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-[9px] font-bold leading-none">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </div>
                  <span className={cn(
                    "text-[10px] leading-none font-medium",
                    appGridOpen ? "text-blue-600 font-semibold" : "text-muted-foreground"
                  )}>
                    App
                  </span>
                </button>
              );
            }

            const active = isActive(slot.href, slot.exact);
            const Icon = slot.icon;
            return (
              <Link
                key={slot.href}
                to={slot.href}
                className="flex-1 flex flex-col items-center justify-center gap-1 relative min-w-0"
                aria-label={slot.label}
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
                  {slot.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* App Grid Sheet */}
      <MobileAppGrid open={appGridOpen} onOpenChange={setAppGridOpen} />
    </>
  );
}
