/**
 * Bottom navigation mobile per l'area SuperAdmin.
 *
 * v3 (2026-07-18): allineata 1:1 all'estetica dell'app azienda
 * (MobileBottomNav) su richiesta utente — "stessi effetto, stessa struttura,
 * con Silvio in mezzo":
 *   - Pillola flottante "liquid glass" iOS 26 (absolute, NON fixed: fixed è
 *     inaffidabile su Safari iOS in questo layout → il main scorre dietro il
 *     vetro; AdminLayout mobile è ora relative + main pb-28).
 *   - Slot centrale AI (Silvio) come punch button tondo arancione, sollevato.
 *   - Bolla "liquida" condivisa (motion layoutId) che scivola tra le voci.
 *   - Hide-on-scroll stile Instagram: la pillola si comprime scrollando giù.
 *   - Feedback aptico al tap (solo nativo).
 *
 * 5 slot fissi: Dashboard | Aziende | ⚫ AI | Assistenza | App.
 * Visibile solo su mobile (montata solo nel ramo isMobile di AdminLayout).
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import {
  LayoutDashboard,
  Building,
  LifeBuoy,
  Sparkles,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminSidebarBadges } from "@/hooks/useAdminSidebarBadges";

/** Feedback aptico leggero al cambio tab (solo app nativa, fire-and-forget). */
function tabHaptic() {
  if (!Capacitor.isNativePlatform()) return;
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => { /* no-op */ });
}

interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  /** Path alternativi che attivano la stessa voce (es. URL legacy). */
  matchPrefixes?: string[];
  exact?: boolean;
  badgeKey?: string;
}

const HOME: NavItem = { label: "Dashboard", icon: LayoutDashboard, href: "/admin", exact: true };
const AZIENDE: NavItem = { label: "Aziende", icon: Building, href: "/admin/aziende" };
const ASSISTENZA: NavItem = {
  label: "Assistenza",
  icon: LifeBuoy,
  href: "/admin/cs?tab=assistenza",
  matchPrefixes: ["/admin/cs", "/admin/ticket"], // ticket redirige a /admin/cs?tab=assistenza
  badgeKey: "openTickets",
};
const APP: NavItem = { label: "App", icon: LayoutGrid, href: "/admin/menu" };

export function AdminBottomNav() {
  const location = useLocation();
  const { data: badges } = useAdminSidebarBadges();

  // Hide-on-scroll stile Instagram: la pillola si comprime scrollando GIÙ e
  // torna piena scrollando SU (o vicino al top). Listener in CAPTURE: lo scroll
  // avviene su <main> (overflow-y-auto), non su window.
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

  const isActive = (item: NavItem) => {
    if (item.exact) return location.pathname === item.href;
    if (item.href === "/admin/menu") return location.pathname === "/admin/menu";
    // matchPrefixes ha precedenza: utile quando l'href contiene ?queryparam
    // (es. /admin/cs?tab=assistenza) o per supportare URL legacy che redirigono.
    if (item.matchPrefixes?.length) {
      return item.matchPrefixes.some((p) => location.pathname.startsWith(p));
    }
    const pathOnly = item.href.split("?")[0];
    return location.pathname.startsWith(pathOnly);
  };

  const getBadgeCount = (item: NavItem): number => {
    if (!item.badgeKey || !badges) return 0;
    if (item.badgeKey === "openTickets") return badges.openTickets ?? 0;
    return 0;
  };

  // Layout fisso 5 slot: Home | Aziende | ⚫ AI | Assistenza | App.
  // AI (Silvio) è il "cuore pulsante" → 1 tap dalla bottom nav, qualunque pagina.
  const navSlots: Array<{ type: "link"; item: NavItem } | { type: "ai" }> = [
    { type: "link", item: HOME },
    { type: "link", item: AZIENDE },
    { type: "ai" },
    { type: "link", item: ASSISTENZA },
    { type: "link", item: APP },
  ];

  return (
    <nav
      // "Liquid glass" iOS 26: pillola flottante in vetro traslucido, staccata
      // dai bordi. absolute (non fixed: inaffidabile su Safari iOS in questo
      // layout) dentro il container relative di AdminLayout; il main ha pb-28
      // per la raggiungibilità dell'ultimo elemento.
      className="pointer-events-none absolute inset-x-0 bottom-0 z-40 bg-transparent px-3 md:hidden"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      aria-label="Navigazione admin"
    >
      <div className={cn(
        "pointer-events-auto flex h-16 origin-bottom items-stretch rounded-[28px] border border-border/40 bg-background/70 shadow-lg shadow-black/10 backdrop-blur-xl backdrop-saturate-150 transition-[opacity,transform] duration-300 ease-out",
        navHidden && "scale-[0.8] opacity-60 translate-y-1.5",
      )}>
        {navSlots.map((slot) => {
          if (slot.type === "ai") {
            // Punch button → Hub AI (Silvio), identico allo slot Silvio azienda.
            return (
              <Link
                key="ai"
                to="/admin/ai"
                onClick={tabHaptic}
                className="flex-1 flex flex-col items-center justify-end gap-1 relative min-w-0 pb-1"
                aria-label="Apri AI (Silvio)"
              >
                <div className="-mt-4 h-12 w-12 rounded-full bg-gradient-to-br from-orange-500 to-amber-400 text-white flex items-center justify-center shadow-lg shadow-orange-300/50 ring-4 ring-background active:scale-95 transition-transform">
                  <Sparkles className="h-5 w-5 stroke-[2.5]" />
                </div>
                <span className="text-[10px] leading-none font-semibold text-orange-600">
                  AI
                </span>
              </Link>
            );
          }

          const { item } = slot;
          const active = isActive(item);
          const Icon = item.icon;
          const badgeCount = getBadgeCount(item);

          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={tabHaptic}
              className="flex-1 flex flex-col items-center justify-center gap-1 relative min-w-0"
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              <div className="relative flex h-8 w-12 items-center justify-center">
                {/* Bolla "liquida" condivisa: layoutId fa scivolare la stessa
                    bolla tra le voci con fisica spring (effetto iOS 26). */}
                {active && (
                  <motion.div
                    layoutId="admin-bottomnav-liquid"
                    initial={false}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className="absolute inset-0 rounded-2xl bg-primary/15"
                  />
                )}
                <Icon
                  className={cn(
                    "relative h-5 w-5 transition-all duration-200",
                    active ? "text-primary stroke-[2.5]" : "text-muted-foreground stroke-[1.5]",
                  )}
                />
                {badgeCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-[9px] font-bold leading-none">
                    {badgeCount > 9 ? "9+" : badgeCount}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "text-[10px] leading-none transition-all duration-200",
                  active ? "text-primary font-semibold" : "text-muted-foreground font-medium",
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
