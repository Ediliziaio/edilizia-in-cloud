import { RefreshCw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DashboardHeaderProps {
  title: string;
  subtitle: string;
  lastUpdatedAt: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  children?: React.ReactNode;
}

/**
 * Header unificato Dashboard:
 * - Titolo + sottotitolo + badge "ultimo aggiornamento" a sinistra
 * - Toolbar azioni (Esporta / Widget / Aggiorna / Nuova Azienda) a destra,
 *   tutto in un'unica riga su desktop, wrap pulito su mobile.
 */
export function DashboardHeader({
  title,
  subtitle,
  lastUpdatedAt,
  isRefreshing,
  onRefresh,
  children,
}: DashboardHeaderProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl md:text-2xl font-bold text-foreground truncate">{title}</h1>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <p className="text-muted-foreground text-xs md:text-sm hidden sm:block">{subtitle}</p>
          {lastUpdatedAt && (
            <Badge
              variant="outline"
              className="text-xs gap-1 font-normal text-muted-foreground shrink-0"
            >
              <Clock className="h-2.5 w-2.5" />
              {lastUpdatedAt}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        {children}
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="gap-2"
          aria-label="Aggiorna dati dashboard"
        >
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          <span className="hidden sm:inline">
            {isRefreshing ? "Aggiornamento..." : "Aggiorna"}
          </span>
        </Button>
      </div>
    </div>
  );
}
