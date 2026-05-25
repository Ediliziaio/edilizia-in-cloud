import { Link } from "react-router-dom";
import { Bell, CheckCircle2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useAdminCommandCenterData } from "@/hooks/useAdminCommandCenterData";
import { cn } from "@/lib/utils";

export function AdminNotificationCenter() {
  const { data, isLoading, refetch, isFetching } = useAdminCommandCenterData();
  const items = data?.items ?? [];
  const urgentCount = (data?.summary.critical ?? 0) + (data?.summary.high ?? 0);
  const badgeCount = urgentCount || data?.summary.total || 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifiche Superadmin">
          <Bell className="h-5 w-5" />
          {badgeCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {badgeCount > 99 ? "99+" : badgeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="font-semibold">Notifiche operative</p>
            <p className="text-xs text-muted-foreground">Solo priorità che richiedono azione.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
        </div>
        <Separator />
        <div className="max-h-[420px] overflow-y-auto p-2">
          {isLoading ? (
            <div className="space-y-2 p-2">
              <div className="h-14 rounded-md bg-muted animate-pulse" />
              <div className="h-14 rounded-md bg-muted animate-pulse" />
              <div className="h-14 rounded-md bg-muted animate-pulse" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              <p className="text-sm font-medium">Tutto sotto controllo</p>
              <p className="max-w-[260px] text-xs text-muted-foreground">
                Non ci sono chat, trial, sync o aziende da gestire subito.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {items.slice(0, 8).map((item) => (
                <Link
                  key={item.id}
                  to={item.href}
                  className="block rounded-lg p-3 transition-colors hover:bg-muted"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 text-[10px]",
                        item.severity === "critical" && "border-red-200 bg-red-50 text-red-700",
                        item.severity === "high" && "border-orange-200 bg-orange-50 text-orange-700",
                        item.severity === "medium" && "border-blue-200 bg-blue-50 text-blue-700",
                      )}
                    >
                      {item.severity === "critical" ? "Critico" : item.severity === "high" ? "Alta" : "Info"}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
        <Separator />
        <div className="p-3">
          <Button asChild variant="outline" className="w-full">
            <Link to="/admin/attivita">Apri centro operativo</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
