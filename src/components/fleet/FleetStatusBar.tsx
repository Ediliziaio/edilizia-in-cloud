import { Radio, RadioTower, WifiOff, Battery, Pause } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TrackingStatus } from "@/types/fleet";
import { cn } from "@/lib/utils";

interface FleetStatusBarProps {
  status: TrackingStatus;
  lastRecordedAt: string | null;
  batteryLevel?: number | null;
  onStart: () => void;
  onStop: () => void;
  className?: string;
}

const STATUS_CONFIG: Record<
  TrackingStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  idle: { label: "Inattivo", color: "bg-gray-100 text-gray-600 border-gray-200", icon: Radio },
  consent_pending: { label: "Consenso richiesto", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Radio },
  active: { label: "In tracciamento", color: "bg-green-100 text-green-700 border-green-200", icon: RadioTower },
  paused: { label: "In pausa", color: "bg-blue-100 text-blue-600 border-blue-200", icon: Pause },
  denied: { label: "GPS negato", color: "bg-red-100 text-red-600 border-red-200", icon: WifiOff },
  error: { label: "Errore GPS", color: "bg-red-100 text-red-600 border-red-200", icon: WifiOff },
};

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s fa`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m fa`;
  return `${Math.floor(secs / 3600)}h fa`;
}

/**
 * Barra di stato del tracciamento GPS — mostrata in cima alla tab GPS dell'app campo.
 */
export function FleetStatusBar({
  status,
  lastRecordedAt,
  batteryLevel,
  onStart,
  onStop,
  className,
}: FleetStatusBarProps) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  const isActive = status === "active";

  return (
    <div className={cn("flex items-center gap-3 p-3 rounded-lg border", cfg.color, className)}>
      <Icon className={cn("h-4 w-4 shrink-0", isActive && "animate-pulse")} />

      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold leading-none">{cfg.label}</p>
        {lastRecordedAt && (
          <p className="text-[10px] mt-0.5 opacity-75">
            Ultimo aggiornamento: {formatRelative(lastRecordedAt)}
          </p>
        )}
      </div>

      {batteryLevel != null && (
        <Badge variant="outline" className="gap-1 text-[10px] h-5 shrink-0">
          <Battery className="h-3 w-3" />
          {batteryLevel}%
        </Badge>
      )}

      {isActive ? (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs shrink-0 border-current"
          onClick={onStop}
        >
          Ferma
        </Button>
      ) : (
        <Button
          size="sm"
          className="h-7 text-xs shrink-0 bg-green-600 hover:bg-green-700 text-white"
          onClick={onStart}
          disabled={status === "denied"}
        >
          Avvia
        </Button>
      )}
    </div>
  );
}
