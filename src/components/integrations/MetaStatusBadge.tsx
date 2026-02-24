import { Badge } from "@/components/ui/badge";
import type { IntegrationStatus, IntegrationHealth } from "@/types/integrations";

interface MetaStatusBadgeProps {
  status: IntegrationStatus;
  health: IntegrationHealth;
}

const statusConfig: Record<IntegrationStatus, { label: string; className: string }> = {
  connected: { label: "Collegato", className: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800" },
  disconnected: { label: "Non collegato", className: "bg-muted text-muted-foreground border-border" },
  error: { label: "Errore", className: "bg-destructive/10 text-destructive border-destructive/20" },
  token_expired: { label: "Token scaduto", className: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800" },
};

export function MetaStatusBadge({ status, health }: MetaStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.disconnected;

  // Override for health critical when connected
  const effectiveConfig =
    status === "connected" && health === "critical"
      ? statusConfig.error
      : status === "connected" && health === "warn"
        ? statusConfig.token_expired
        : config;

  const label =
    status === "connected" && health === "critical"
      ? "Problemi"
      : status === "connected" && health === "warn"
        ? "Attenzione"
        : config.label;

  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-medium ${effectiveConfig.className}`}>
      {label}
    </Badge>
  );
}
