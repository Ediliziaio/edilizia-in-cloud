/**
 * MobileAppGrid — Schermata "App" full-screen per mobile.
 * Mostra tutte le sezioni accessibili all'utente in una griglia categorizzata.
 * Sostituisce la vecchia sidebar su mobile.
 */
import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { X, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { macroAreas, type NavItem } from "@/lib/sidebarConfig";
import { usePermissions } from "@/hooks/usePermissions";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useState } from "react";

interface MobileAppGridProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileAppGrid({ open, onOpenChange }: MobileAppGridProps) {
  const permissions = usePermissions();
  const { isModuleEnabled, billingMode } = useSubscriptionLimits();
  const { isFeatureEnabled } = useFeatureFlags();
  const { effectiveCompany } = useAuth();
  const location = useLocation();
  const [search, setSearch] = useState("");

  const filterNavItems = useMemo(() => {
    return (items: NavItem[]) => {
      if (permissions.isLoading) {
        return items.filter((item) => {
          if (item.featureKey === "billing_external" && billingMode !== "external") return false;
          if (item.featureKey === "billing_native" && billingMode !== "native") return false;
          if (item.featureKey && item.featureKey !== "billing_external" && item.featureKey !== "billing_native" && !isFeatureEnabled(item.featureKey)) return false;
          return true;
        });
      }
      return items.filter((item) => {
        if (item.url === "/azienda/cruscotto") {
          if (!permissions.canViewCruscotto && !permissions.canViewDashboard && !permissions.canViewMarketingDashboard) return false;
        } else if (item.permissionKey && permissions[item.permissionKey as keyof typeof permissions] !== true) {
          return false;
        }
        if (item.moduleKey && !isModuleEnabled(item.moduleKey)) return false;
        if (item.featureKey === "billing_external" && billingMode !== "external") return false;
        if (item.featureKey === "billing_native" && billingMode !== "native") return false;
        if (item.featureKey && item.featureKey !== "billing_external" && item.featureKey !== "billing_native" && !isFeatureEnabled(item.featureKey)) return false;
        return true;
      });
    };
  }, [permissions, isModuleEnabled, billingMode, isFeatureEnabled]);

  const filteredAreas = useMemo(() => {
    return macroAreas
      .map((area) => {
        let items = filterNavItems(area.items);
        if (search.trim()) {
          const q = search.toLowerCase();
          items = items.filter((item) => item.title.toLowerCase().includes(q));
        }
        return { ...area, items };
      })
      .filter((area) => area.items.length > 0);
  }, [filterNavItems, search]);

  const handleNavigate = () => {
    onOpenChange(false);
    setSearch("");
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSearch(""); }}>
      <SheetContent
        side="bottom"
        className="h-[92vh] rounded-t-3xl p-0 overflow-hidden [&>button]:hidden"
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-lg font-bold text-foreground">App</h2>
            <button
              onClick={() => { onOpenChange(false); setSearch(""); }}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
              aria-label="Chiudi"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Search */}
          <div className="px-5 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Cerca app"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-xl border border-border/60 bg-muted/30 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Grid content */}
          <div className="flex-1 overflow-y-auto px-5 pb-8">
            {filteredAreas.map((area) => (
              <div key={area.id} className="mb-5">
                <div className="bg-background border border-border/60 rounded-2xl p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    {area.title}
                  </p>
                  <div className="grid grid-cols-4 gap-3">
                    {area.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = location.pathname === item.url || location.pathname.startsWith(item.url + "/");
                      return (
                        <Link
                          key={item.url}
                          to={item.url}
                          onClick={handleNavigate}
                          className="flex flex-col items-center gap-1.5 min-w-0"
                        >
                          <div
                            className={cn(
                              "w-12 h-12 rounded-2xl flex items-center justify-center border transition-all",
                              isActive
                                ? "bg-blue-50 border-blue-200"
                                : "bg-muted/40 border-border/40 hover:bg-muted"
                            )}
                          >
                            <Icon
                              className={cn(
                                "h-5 w-5",
                                isActive ? "text-blue-600" : "text-muted-foreground"
                              )}
                            />
                          </div>
                          <span
                            className={cn(
                              "text-[11px] leading-tight text-center line-clamp-2 font-medium",
                              isActive ? "text-blue-600" : "text-foreground"
                            )}
                          >
                            {item.title}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
