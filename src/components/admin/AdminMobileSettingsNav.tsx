/**
 * Navigazione mobile per le Impostazioni SuperAdmin.
 * Barra orizzontale scrollabile con le sezioni principali.
 * Visibile solo su mobile dove la sidebar impostazioni è nascosta.
 */
import { useLocation, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ADMIN_SETTINGS_NAV } from "@/config/adminSettingsNav";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { cn } from "@/lib/utils";

export function AdminMobileSettingsNav() {
  const location = useLocation();
  const { permissions } = useSuperAdminPermissions();

  // Flatten all settings items and filter by permission
  const allItems = ADMIN_SETTINGS_NAV.flatMap((g) =>
    g.items.filter((item) => {
      if (!item.permission) return true;
      return permissions[item.permission as keyof typeof permissions] === true;
    })
  );

  return (
    <div className="border-b bg-background sticky top-12 z-30">
      {/* Back button */}
      <div className="flex items-center gap-2 px-3 pt-2 pb-1">
        <Link
          to="/admin"
          className="flex items-center gap-1.5 text-xs text-muted-foreground active:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Torna indietro</span>
        </Link>
        <span className="text-xs font-semibold text-foreground ml-auto">Impostazioni</span>
      </div>

      {/* Scrollable tabs */}
      <div className="flex overflow-x-auto scrollbar-hide gap-1 px-3 pb-2">
        {allItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.url;
          return (
            <Link
              key={item.id}
              to={item.url}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/80 text-muted-foreground active:bg-muted"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
