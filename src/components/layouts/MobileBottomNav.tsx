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
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

/** Feedback aptico leggero al cambio tab (solo app nativa, fire-and-forget). */
function tabHaptic() {
  if (!Capacitor.isNativePlatform()) return;
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => { /* no-op */ });
}
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
  Package,
  BarChart3,
  Sparkles,
  Mail,
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
  // Email prima di Magazzino (richiesta utente 2026-06): la posta è l'azione
  // mobile più frequente; il Magazzino resta raggiungibile dall'App grid.
  { label: "Email", icon: Mail, href: "/azienda/email" },
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

function appendSearchToAziendaUrl(url: string, search: string) {
  if (!search || !url.startsWith("/azienda")) return url;
  const normalizedSearch = search.startsWith("?") ? search.slice(1) : search;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${normalizedSearch}`;
}

/* ── Componente ────────────────────────────────────────── */
export function MobileBottomNav() {
  const location = useLocation();
  const { unreadCount } = useNotifications();
  const permissions = usePermissions();
  const { role } = useAuth();
  const isMobile = useIsMobile();
  const [appGridOpen, setAppGridOpen] = useState(false);
  // Hide-on-scroll stile Instagram: la pillola scivola via scrollando GIÙ e
  // riappare scrollando SU (o vicino al top). Listener in CAPTURE: lo scroll
  // avviene su <main id="main-content"> (overflow-y-auto), non su window.
  const [navHidden, setNavHidden] = useState(false);
  useEffect(() => {
    let lastY = 0;
    let lastEl: EventTarget | null = null;
    const onScroll = (e: Event) => {
      const t = e.target;
      const el = t instanceof Element ? t : document.scrollingElement;
      if (!el || el.scrollHeight - el.clientHeight < 80) return; // scroller irrilevanti
      const y = el.scrollTop;
      if (t !== lastEl) { lastEl = t; lastY = y; return; }
      const dy = y - lastY;
      if (Math.abs(dy) < 8) return; // dead-zone anti-jitter
      if (y < 48) setNavHidden(false);
      else setNavHidden(dy > 0);
      lastY = y;
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, []);
  const commercialistaParams = new URLSearchParams(location.search);
  const isCommercialistaMode = commercialistaParams.get("commercialistaMode") === "1";
  const commercialistaSearch = isCommercialistaMode
    ? new URLSearchParams({
        commercialistaMode: "1",
        commercialistaCompany: commercialistaParams.get("commercialistaCompany") ?? "",
        commercialistaCompanyName: commercialistaParams.get("commercialistaCompanyName") ?? "",
        returnTo: commercialistaParams.get("returnTo") || "/commercialista",
      }).toString()
    : "";

  // Solo su mobile
  if (!isMobile) return null;

  if (isCommercialistaMode) {
    const scopedItems: BottomNavItem[] = [
      { label: "Studio", icon: LayoutDashboard, href: commercialistaParams.get("returnTo") || "/commercialista", exact: true },
      { label: "Cantieri", icon: ClipboardList, href: appendSearchToAziendaUrl("/azienda/ordini", commercialistaSearch) },
      { label: "Magazzino", icon: Package, href: appendSearchToAziendaUrl("/azienda/magazzino", commercialistaSearch) },
      { label: "Controllo", icon: BarChart3, href: appendSearchToAziendaUrl("/azienda/controllo-gestione", commercialistaSearch) },
      { label: "Finanza", icon: Euro, href: appendSearchToAziendaUrl("/azienda/documenti", commercialistaSearch) },
    ];

    return (
      <nav
        className="shrink-0 bg-background border-t border-border/50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Navigazione commercialista"
      >
        <div className="flex items-stretch h-16">
          {scopedItems.map((item) => {
            const active = item.exact ? location.pathname === item.href : location.pathname.startsWith(item.href.split("?")[0]);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                to={item.href}
                className="flex-1 flex flex-col items-center justify-center gap-1 relative min-w-0"
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
              >
                <div
                  className={cn(
                    "flex items-center justify-center rounded-2xl transition-all duration-200",
                    active ? "bg-blue-50 w-12 h-8" : "w-10 h-8",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5 transition-all duration-200",
                      active ? "text-blue-600 stroke-[2.5]" : "text-muted-foreground stroke-[1.5]",
                    )}
                  />
                </div>
                <span
                  className={cn(
                    "text-[10px] leading-none transition-all duration-200",
                    active ? "text-blue-600 font-semibold" : "text-muted-foreground font-medium",
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  // v8.6.68 — Rimosso il "nascondi nelle impostazioni": l'utente segnalava
  // incoerenza UX. La bottom nav è ora SEMPRE visibile su mobile in modo che
  // navigazione e accesso rapido (Home/Commesse/Chat/Magazzino/App) restino
  // coerenti tra pagine di lavoro e settings.

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

  // Home link: per la sezione gestione punta ad ATTIVITÀ (richiesta utente 2026-06:
  // "quando apro l'app deve finire in attività") — coerente col logo header.
  const homeHref = section === "marketing"
    ? "/azienda/marketing"
    : section === "cruscotto"
      ? (permissions.isLoading ? "/azienda/cruscotto" : getSmartCruscottoPath(permissions, role))
      : "/azienda/attivita";

  const isHomeActive = section === "marketing"
    ? location.pathname === "/azienda/marketing" || location.pathname === "/azienda/marketing/"
    : section === "cruscotto"
      ? location.pathname.startsWith("/azienda/cruscotto")
      : location.pathname.startsWith("/azienda/attivita") ||
        location.pathname === "/azienda" || location.pathname === "/azienda/";

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return location.pathname === href;
    return location.pathname.startsWith(href);
  };

  // v8.6.70 — Slot centrale Silvio (punch button):
  // Layout fisso 5 tab: Home | [dynamic1] | ⚫ Silvio | [dynamic2] | App
  // La voce Chat Team viene esposta via App grid (Cruscotto > Chat Team).
  // Silvio è "il cuore pulsante" → 1 tap dalla bottom nav, qualunque pagina.
  const navSlots: Array<
    | { type: "link"; label: string; icon: React.ComponentType<{ className?: string }>; href: string; exact?: boolean; active?: boolean }
    | { type: "silvio" }
    | { type: "app" }
  > = [
    { type: "link", label: "Home", icon: LayoutDashboard, href: homeHref, active: isHomeActive },
    ...(dynamicItems[0] ? [{ type: "link" as const, label: dynamicItems[0].label, icon: dynamicItems[0].icon, href: dynamicItems[0].href }] : []),
    { type: "silvio" },
    ...(dynamicItems[1] ? [{ type: "link" as const, label: dynamicItems[1].label, icon: dynamicItems[1].icon, href: dynamicItems[1].href }] : []),
    { type: "app" },
  ];

  const bottomNav = (
    <nav
      // "Liquid glass" stile iOS 26 (richiesta utente, rif. video Instagram/App
      // Store): la barra diventa una PILLOLA flottante in vetro traslucido,
      // staccata dai bordi, con la bolla dell'elemento attivo che scivola
      // liquida tra le voci (motion layoutId + spring, vedi sotto).
      className="shrink-0 bg-transparent px-3 md:hidden"
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)",
      }}
      aria-label="Navigazione principale"
    >
      <div className={cn(
        // Scrollando GIÙ la barra NON sparisce (richiesta utente): si attenua
        // (~70% di opacità) e si COMPRIME leggermente stile Instagram (scala
        // 90% ancorata in basso, icone incluse), restando visibile e
        // cliccabile; torna piena scrollando su o vicino al top.
        "flex h-16 origin-bottom items-stretch rounded-[28px] border border-border/40 bg-background/70 shadow-lg shadow-black/10 backdrop-blur-xl backdrop-saturate-150 transition-[opacity,transform] duration-300 ease-out",
        navHidden && !appGridOpen && "scale-90 opacity-70",
      )}>
        {navSlots.map((slot) => {
          if (slot.type === "app") {
            return (
              <button
                key="app"
                className="flex-1 flex flex-col items-center justify-center gap-1 relative min-w-0"
                onClick={() => { tabHaptic(); setAppGridOpen(true); }}
                aria-label="Apri menu app"
                type="button"
              >
                <div className="relative flex h-8 w-12 items-center justify-center">
                  {appGridOpen && (
                    <motion.div
                      layoutId="bottomnav-liquid"
                      initial={false}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      className="absolute inset-0 rounded-2xl bg-blue-100/90"
                    />
                  )}
                  <LayoutGrid className={cn(
                    "relative h-5 w-5 stroke-[1.5]",
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

          if (slot.type === "silvio") {
            // Il punch button porta DIRETTAMENTE alla pagina Silvio AI
            // (richiesta utente): niente più sheet chat via evento.
            return (
              <Link
                key="silvio"
                to="/azienda/silvio-ai"
                onClick={tabHaptic}
                className="flex-1 flex flex-col items-center justify-end gap-1 relative min-w-0 pb-1"
                aria-label="Apri Silvio AI"
              >
                {/* Punch button: tondo, gradient arancione, leggermente sollevato */}
                <div className="-mt-4 h-12 w-12 rounded-full bg-gradient-to-br from-orange-500 to-amber-400 text-white flex items-center justify-center shadow-lg shadow-orange-300/50 ring-4 ring-background active:scale-95 transition-transform">
                  <Sparkles className="h-5 w-5 stroke-[2.5]" />
                </div>
                <span className="text-[10px] leading-none font-semibold text-orange-600">
                  Silvio
                </span>
              </Link>
            );
          }

          const active = slot.active !== undefined ? slot.active : isActive(slot.href, slot.exact);
          const Icon = slot.icon;
          return (
            <Link
              key={slot.href}
              to={slot.href}
              onClick={tabHaptic}
              className="flex-1 flex flex-col items-center justify-center gap-1 relative min-w-0"
              aria-label={slot.label}
              aria-current={active ? "page" : undefined}
            >
              <div className="relative flex h-8 w-12 items-center justify-center">
                {/* Bolla "liquida" condivisa: layoutId fa scivolare la stessa
                    bolla tra le voci con fisica spring (effetto iOS 26). */}
                {active && !appGridOpen && (
                  <motion.div
                    layoutId="bottomnav-liquid"
                    initial={false}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className="absolute inset-0 rounded-2xl bg-blue-100/90"
                  />
                )}
                <Icon
                  className={cn(
                    "relative h-5 w-5 transition-all duration-200",
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
