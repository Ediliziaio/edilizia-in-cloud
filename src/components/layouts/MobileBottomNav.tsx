import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  HardHat,
  BookOpen,
  Users,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { useNotifications } from "@/hooks/useNotifications";

const NAV_ITEMS = [
  { label: "Home",      icon: LayoutDashboard, href: "/azienda" },
  { label: "Cantieri",  icon: HardHat,         href: "/azienda/cantieri" },
  { label: "Giornale",  icon: BookOpen,        href: "/azienda/giornale-lavori" },
  { label: "Clienti",   icon: Users,           href: "/azienda/clienti" },
] as const;

export function MobileBottomNav() {
  const location = useLocation();
  const { toggleSidebar } = useSidebar();
  const { unreadCount } = useNotifications();

  if (location.pathname.startsWith("/azienda/impostazioni")) return null;

  const isActive = (href: string) => {
    if (href === "/azienda") return location.pathname === "/azienda";
    return location.pathname.startsWith(href);
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border/60"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch h-16">
        {NAV_ITEMS.map(({ label, icon: Icon, href }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              to={href}
              className="flex-1 flex flex-col items-center justify-center gap-1 relative"
            >
              <div
                className={cn(
                  "flex items-center justify-center rounded-2xl transition-all duration-200",
                  active
                    ? "bg-primary/10 w-14 h-8"
                    : "w-10 h-8"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 transition-all duration-200",
                    active ? "text-primary stroke-[2.5]" : "text-muted-foreground stroke-[1.5]"
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-[10px] leading-none transition-all duration-200",
                  active ? "text-primary font-semibold" : "text-muted-foreground font-medium"
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}

        {/* Menu */}
        <button
          className="flex-1 flex flex-col items-center justify-center gap-1 relative"
          onClick={toggleSidebar}
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
