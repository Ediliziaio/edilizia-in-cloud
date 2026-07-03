import { RefreshCw, Clock, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BrandPageHeader } from "@/components/admin/BrandPageHeader";

interface DashboardHeaderProps {
  title: string;
  subtitle: string;
  lastUpdatedAt: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  children?: React.ReactNode;
}

/**
 * Header unificato Dashboard Super Admin — hero brand (navy + arancione, stesso
 * linguaggio del Cruscotto Aziendale). Titolo + badge "ultimo aggiornamento" a
 * sinistra; toolbar azioni (Esporta / Widget / Nuova Azienda / Aggiorna) a
 * destra: i bottoni outline hanno sfondo chiaro, quindi restano leggibili su navy.
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
    <BrandPageHeader
      icon={LayoutDashboard}
      eyebrow="Piattaforma"
      title={title}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span className="hidden sm:inline">{subtitle}</span>
          {lastUpdatedAt && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] text-blue-50/80">
              <Clock className="h-2.5 w-2.5" />
              {lastUpdatedAt}
            </span>
          )}
        </span>
      }
      actions={
        <>
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
            <span className="hidden sm:inline">{isRefreshing ? "Aggiornamento..." : "Aggiorna"}</span>
          </Button>
        </>
      }
    />
  );
}
