/**
 * Bottom navigation mobile per l'area campo (operai e subappaltatori).
 *
 * Allineata all'app azienda (MobileBottomNav) a livello di EFFETTI, su richiesta
 * utente ("la parte in basso deve essere uguale"):
 *   - pillola flottante "liquid glass" (vetro traslucido, staccata dai bordi)
 *   - bolla attiva "liquida" che scivola tra le voci (framer-motion layoutId + spring)
 *   - hide-on-scroll: la pillola si comprime scrollando giù, torna piena su/near-top
 *   - feedback aptico leggero al tap (solo app nativa)
 * A differenza dell'azienda NON c'è il punch button Silvio: al subappaltatore non
 * serve. L'operaio mantiene il bottone centrale "Timbra" (i subappaltatori non timbrano).
 * Visibile solo su mobile (< md).
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import {
  Home,
  Calendar,
  MessageSquare,
  Clock,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsCampo } from "@/hooks/useIsCampo";

/** Feedback aptico leggero al cambio tab (solo app nativa, fire-and-forget). */
function tabHaptic() {
  if (!Capacitor.isNativePlatform()) return;
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => { /* no-op */ });
}

interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Home", icon: Home, href: "/campo", exact: true },
  { label: "Lavori", icon: Calendar, href: "/campo/calendario" },
  { label: "Timbra", icon: Clock, href: "/campo/timbratura" },
  { label: "Chat", icon: MessageSquare, href: "/campo/chat" },
  { label: "App", icon: LayoutGrid, href: "/campo/menu" },
];

interface Props {
  unreadCount?: number;
  onTimbraClick?: () => void;
}

export function CampoBottomNav({ unreadCount = 0, onTimbraClick }: Props) {
  const location = useLocation();
  const { isSubappaltatore } = useIsCampo();

  // Hide-on-scroll (stessa logica dell'app azienda): la pillola si attenua e si
  // comprime scrollando GIÙ, torna piena scrollando SU o vicino al top. Listener
  // in CAPTURE: lo scroll può avvenire su window o su un contenitore interno.
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

  // Subappaltatori non timbrano — filtra il bottone Timbra
  const visibleItems = isSubappaltatore
    ? NAV_ITEMS.filter((item) => item.label !== "Timbra")
    : NAV_ITEMS;

  const isActive = (item: NavItem) => {
    if (item.exact) return location.pathname === item.href;
    return location.pathname.startsWith(item.href);
  };

  return (
    <nav
      // Overlay flottante: la pillola NON occupa una fascia di layout, il contenuto
      // scorre dietro il vetro. pointer-events-none sul contenitore + auto sulla pillola.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 bg-transparent px-3 md:hidden"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      aria-label="Navigazione campo"
    >
      <div
        className={cn(
          "pointer-events-auto flex h-16 origin-bottom items-stretch rounded-[28px] border border-border/40 bg-background/70 shadow-lg shadow-black/10 backdrop-blur-xl backdrop-saturate-150 transition-[opacity,transform] duration-300 ease-out",
          navHidden && "scale-[0.8] opacity-60 translate-y-1.5",
        )}
      >
        {visibleItems.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;

          // Timbra — bottone centrale sollevato (solo operaio); analogo di posizione
          // al punch button dell'azienda ma con identità "timbratura" (primary).
          if (item.label === "Timbra") {
            return (
              <Link
                key="timbra"
                to={item.href}
                onClick={() => { tabHaptic(); onTimbraClick?.(); }}
                className="relative flex min-w-0 flex-1 flex-col items-center justify-end gap-1 pb-1"
                aria-label="Timbratura"
                aria-current={active ? "page" : undefined}
              >
                <div className="-mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/40 ring-4 ring-background transition-transform active:scale-95">
                  <Icon className="h-5 w-5 stroke-[2.5]" />
                </div>
                <span className="text-[10px] font-semibold leading-none text-primary">
                  {item.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={tabHaptic}
              className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1"
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              <div className="relative flex h-8 w-12 items-center justify-center">
                {/* Bolla "liquida" condivisa: layoutId fa scivolare la stessa bolla
                    tra le voci con fisica spring (stesso effetto iOS 26 dell'azienda). */}
                {active && (
                  <motion.div
                    layoutId="campo-bottomnav-liquid"
                    initial={false}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className="absolute inset-0 rounded-2xl bg-blue-100/90"
                  />
                )}
                <Icon
                  className={cn(
                    "relative h-5 w-5 transition-all duration-200",
                    active ? "text-blue-600 stroke-[2.5]" : "text-muted-foreground stroke-[1.5]",
                  )}
                />
                {/* Badge messaggi non letti sulla Chat */}
                {item.label === "Chat" && unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "text-[10px] leading-none transition-all duration-200",
                  active ? "font-semibold text-blue-600" : "font-medium text-muted-foreground",
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
