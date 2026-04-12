/**
 * Bottom navigation mobile per l'area campo.
 * Stile ispirato a app native — 5 tab con icone + label.
 * Visibile solo su mobile (< md).
 */
import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Calendar,
  MessageSquare,
  Clock,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Home", icon: Home, href: "/campo", exact: true },
  { label: "Lavori", icon: Calendar, href: "/campo/calendario" },
  { label: "Timbra", icon: Clock, href: "__timbra__" },
  { label: "Chat", icon: MessageSquare, href: "/campo/chat" },
  { label: "App", icon: LayoutGrid, href: "/campo/menu" },
];

interface Props {
  unreadCount?: number;
  onTimbraClick?: () => void;
}

export function CampoBottomNav({ unreadCount = 0, onTimbraClick }: Props) {
  const location = useLocation();

  const isActive = (item: NavItem) => {
    if (item.href === "__timbra__") return false;
    if (item.exact) return location.pathname === item.href;
    return location.pathname.startsWith(item.href);
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border/50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navigazione campo"
    >
      <div className="flex items-stretch h-16">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;

          // Timbra — bottone speciale al centro
          if (item.href === "__timbra__") {
            return (
              <Link
                key="timbra"
                to="/campo"
                className="flex-1 flex flex-col items-center justify-center gap-0.5 relative"
                aria-label="Timbratura"
              >
                <div className="w-12 h-12 -mt-5 rounded-2xl bg-primary shadow-lg shadow-primary/30 flex items-center justify-center">
                  <Icon className="h-6 w-6 text-white stroke-[2.5]" />
                </div>
                <span className="text-[10px] leading-none text-primary font-semibold mt-0.5">
                  {item.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              to={item.href}
              className="flex-1 flex flex-col items-center justify-center gap-1 relative min-w-0"
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              <div
                className={cn(
                  "flex items-center justify-center rounded-2xl transition-all duration-200",
                  active ? "bg-primary/10 w-12 h-8" : "w-10 h-8"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 transition-all duration-200",
                    active ? "text-primary stroke-[2.5]" : "text-muted-foreground stroke-[1.5]"
                  )}
                />
                {/* Chat badge */}
                {item.label === "Chat" && unreadCount > 0 && (
                  <span className="absolute top-1 right-1/2 translate-x-4 h-4 min-w-[16px] px-1 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-[9px] font-bold leading-none">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "text-[10px] leading-none transition-all duration-200",
                  active ? "text-primary font-semibold" : "text-muted-foreground font-medium"
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
