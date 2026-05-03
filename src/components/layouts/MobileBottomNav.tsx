/**
 * Bottom navigation mobile per l'area azienda.
 * Renderizzata tramite Portal nel body per garantire position:fixed funzionante.
 *
 * Le 2 tab dinamiche cambiano in base alla sezione corrente:
 *   - Marketing (/azienda/marketing/*) → Opportunità + Calendario
 *   - Gestione (/azienda, /azienda/ordini, ecc.) → Commesse + secondo item per permessi
 *   - Cruscotto (/azienda/cruscotto/*) → rilevamento profilo automatico
 *
 * Chat e App sono sempre presenti.
 */
import { useState } from "react";
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
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/useNotifications";
import { usePermissions } from "@/hooks/usePermissions";
import type { Permissions } from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileAppGrid } from "@/components/layouts/MobileAppGrid";
import { useAuth } from "@/contexts/AuthContext";
import { getSmartCruscottoPath } from "@/lib/dashboardRouting";

/* ── Tipi ──────────────────────────────────────────────── */
interface BottomNavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  exact?: boolean;
  permissionKey?: keyof Permissions;
}

/* ── Item sets per sezione ─────────────────────────────── */

/** Marketing & Vendite */
const MARKETING_ITEMS: BottomNavItem[] = [
  { label: "Opportunità", icon: Target, href: "/azienda/marketing/opportunita", permissionKey: "canViewMarketingOpportunities" },
  { label: "Calendario", icon: CalendarDays, href: "/azienda/marketing/calendario", permissionKey: "canViewMarketingAppointments" },
];

/** Gestione operativa — ordine di priorità, prende i primi 2 accessibili */
const GESTIONE_ITEMS: BottomNavItem[] = [
  { label: "Commesse", icon: ClipboardList, href: "/azienda/ordini", permissionKey: "canViewOrders" },
  { label: "Magazzino", icon: Package, href: "/azienda/magazzino", permissionKey: "canViewWarehouse" },
  { label: "Finanza", icon: Euro, href: "/azienda/documenti", permissionKey: "canViewBilling" },
  { label: "Cantieri", icon: HardHat, href: "/azienda/ordini", permissionKey: "canViewOrders" },
  { label: "Giornale", icon: NotebookPen, href: "/azienda/giornale-lavori", permissionKey: "canViewGiornaleLavori" },
  { label: "Clienti", icon: Users, href: "/azienda/clienti", permissionKey: "canViewCustomers" },
];

/** Cruscotto — profilo rilevato automaticamente */
const CRUSCOTTO_COMMERCIAL: BottomNavItem[] = [
  { label: "Opportunità", icon: Target, href: "/azienda/marketing/opportunita", permissionKey: "canViewMarketingOpportunities" },
  { label: "Calendario", icon: CalendarDays, href: "/azienda/marketing/calendario", permissionKey: "canViewMarketingAppointments" },
];

const CRUSCOTTO_OFFICE: BottomNavItem[] = [
  { label: "Commesse", icon: ClipboardList, href: "/azienda/ordini", permissionKey: "canViewOrders" },
  { label: "Finanza", icon: Euro, href: "/azienda/documenti", permissionKey: "canViewBilling" },
];

const CRUSCOTTO_OPERATIONS: BottomNavItem[] = [
  { label: "Cantieri", icon: HardHat, href: "/azienda/ordini", permissionKey: "canViewOrders" },
  { label: "Giornale", icon: NotebookPen, href: "/azienda/giornale-lavori", permissionKey: "canViewGiornaleLavori" },
];

const CRUSCOTTO_GENERIC: BottomNavItem[] = [
  { label: "Commesse", icon: ClipboardList, href: "/azienda/ordini", permissionKey: "canViewOrders" },
  { label: "Clienti", icon: Users, href: "/azienda/clienti", permissionKey: "canViewCustomers" },
];

/* ── Helpers ───────────────────────────────────────────── */

type NavSection = "marketing" | "gestione" | "cruscotto";

function detectSection(pathname: string): NavSection {
  if (pathname.startsWith("/azienda/marketing")) return "marketing";
  if (pathname.startsWith("/azienda/cruscotto")) return "cruscotto";
  return "gestione";
}

function detectCruscottoProfile(p: Permissions): BottomNavItem[] {
  if (p.canViewMarketingOpportunities || p.canViewMarketingAppointments) return CRUSCOTTO_COMMERCIAL;
  if (p.canViewBilling || p.canViewPrimaNota || p.canViewTesoreria) return CRUSCOTTO_OFFICE;
  if (p.canViewGiornaleLavori || p.canViewInterventi) return CRUSCOTTO_OPERATIONS;
  return CRUSCOTTO_GENERIC;
}

function filterAccessible(items: BottomNavItem[], permissions: Permissions, max: number): BottomNavItem[] {
  const filtered = items.filter((item) => {
    if (!item.permissionKey) return true;
    return permissions.isAdmin || permissions[item.permissionKey] === true;
  });
  // Evita duplicati di href
  const seen = new Set<string>();
  const unique: BottomNavItem[] = [];
  for (const item of filtered) {
    if (!seen.has(item.href)) {
      seen.add(item.href);
      unique.push(item);
    }
    if (unique.length >= max) break;
  }
  return unique;
}

/* ── Componente ────────────────────────────────────────── */
export function MobileBottomNav() {
  const location = useLocation();
  const { unreadCount } = useNotifications();
  const permissions = usePermissions();
  const { role } = useAuth();
  const isMobile = useIsMobile();
  const [appGridOpen, setAppGridOpen] = useState(false);

  // Solo su mobile
  if (!isMobile) return null;

  // Nascondi nelle impostazioni
  if (location.pathname.startsWith("/azienda/impostazioni")) return null;

  // Rileva la sezione corrente e seleziona gli item contestuali
  const section = detectSection(location.pathname);
  const dynamicItems = (() => {
    if (permissions.isLoading) return CRUSCOTTO_GENERIC.slice(0, 2);

    switch (section) {
      case "marketing":
        return filterAccessible(MARKETING_ITEMS, permissions, 2);
      case "gestione":
        return filterAccessible(GESTIONE_ITEMS, permissions, 2);
      case "cruscotto": {
        const profileItems = detectCruscottoProfile(permissions);
        return filterAccessible(profileItems, permissions, 2);
      }
    }
  })();

  // Home link punta alla dashboard della sezione corrente
  const homeHref = section === "marketing"
    ? "/azienda/marketing"
    : section === "cruscotto"
      ? (permissions.isLoading ? "/azienda/cruscotto" : getSmartCruscottoPath(permissions, role))
      : "/azienda";

  const isHomeActive = section === "marketing"
    ? location.pathname === "/azienda/marketing" || location.pathname === "/azienda/marketing/"
    : section === "cruscotto"
      ? location.pathname.startsWith("/azienda/cruscotto")
      : location.pathname === "/azienda" || location.pathname === "/azienda/";

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return location.pathname === href;
    return location.pathname.startsWith(href);
  };

  // Layout fisso 5 tab: Home | [dynamic1] | Chat | [dynamic2] | App
  const navSlots: Array<
    | { type: "link"; label: string; icon: React.ComponentType<{ className?: string }>; href: string; exact?: boolean; active?: boolean }
    | { type: "app" }
  > = [
    { type: "link", label: "Home", icon: LayoutDashboard, href: homeHref, active: isHomeActive },
    ...(dynamicItems[0] ? [{ type: "link" as const, label: dynamicItems[0].label, icon: dynamicItems[0].icon, href: dynamicItems[0].href }] : []),
    { type: "link", label: "Chat", icon: MessagesSquare, href: "/azienda/chat" },
    ...(dynamicItems[1] ? [{ type: "link" as const, label: dynamicItems[1].label, icon: dynamicItems[1].icon, href: dynamicItems[1].href }] : []),
    { type: "app" },
  ];

  const bottomNav = (
    <nav
      className="shrink-0 bg-background border-t border-border/50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] md:hidden"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      aria-label="Navigazione principale"
    >
      <div className="flex items-stretch h-16">
        {navSlots.map((slot) => {
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

          const active = slot.active !== undefined ? slot.active : isActive(slot.href, slot.exact);
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
  );

  return (
    <>
      {/* Render diretto (NO createPortal) — su Safari iOS il portal al body
          causa problemi con position:fixed che non viene renderizzato.
          position:fixed funziona correttamente anche senza portal. */}
      {bottomNav}
      {/* App Grid Sheet */}
      <MobileAppGrid open={appGridOpen} onOpenChange={setAppGridOpen} />
    </>
  );
}
