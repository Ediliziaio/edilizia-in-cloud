/**
 * Bottom navigation mobile per l'area SuperAdmin.
 * 5 tab: Dashboard, Aziende, Ticket, Marketing, App (menu grid).
 * Visibile solo su mobile (< md). Stile nativo con safe-area.
 */
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Building,
  MessageSquare,
  Megaphone,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminSidebarBadges } from "@/hooks/useAdminSidebarBadges";

interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  exact?: boolean;
  badgeKey?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/admin", exact: true },
  { label: "Aziende", icon: Building, href: "/admin/aziende" },
  { label: "Ticket", icon: MessageSquare, href: "/admin/ticket", badgeKey: "openTickets" },
  { label: "Marketing", icon: Megaphone, href: "/admin/marketing" },
  { label: "App", icon: LayoutGrid, href: "/admin/menu" },
];

export function AdminBottomNav() {
  const location = useLocation();
  const { data: badges } = useAdminSidebarBadges();

  const isActive = (item: NavItem) => {
    if (item.exact) return location.pathname === item.href;
    // Special: "App" is active only on /admin/menu
    if (item.href === "/admin/menu") return location.pathname === "/admin/menu";
    return location.pathname.startsWith(item.href);
  };

  const getBadgeCount = (item: NavItem): number => {
    if (!item.badgeKey || !badges) return 0;
    if (item.badgeKey === "openTickets") return badges.openTickets ?? 0;
    return 0;
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border/50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navigazione admin"
    >
      <div className="flex items-stretch h-16">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          const badgeCount = getBadgeCount(item);

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
                {badgeCount > 0 && (
                  <span className="absolute top-1 right-1/2 translate-x-4 h-4 min-w-[16px] px-1 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-[9px] font-bold leading-none">
                    {badgeCount > 9 ? "9+" : badgeCount}
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
