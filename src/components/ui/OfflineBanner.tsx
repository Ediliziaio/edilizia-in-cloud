/**
 * OfflineBanner — v8.6.91
 *
 * Banner sticky in alto con:
 *  - icona + messaggio
 *  - counter "Offline da X min"
 *  - bottone "Riprova" che forza un heartbeat ping
 *
 * Usa useOnlineStatusDetail per distinguere "rete OK ma backend irraggiungibile"
 * (es. captive WiFi cantiere) da "veramente offline".
 */
import { useState, useEffect } from "react";
import { WifiOff, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnlineStatusDetail } from "@/hooks/useOnlineStatus";

function formatOfflineDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function OfflineBanner() {
  const { isOnline, isReachable, isOffline, offlineSince, retry } = useOnlineStatusDetail();
  const [retrying, setRetrying] = useState(false);
  const [tick, setTick] = useState(0);

  // Re-render ogni 5s per aggiornare il timer "Offline da Xm"
  useEffect(() => {
    if (!isOffline) return;
    const t = setInterval(() => setTick((v) => v + 1), 5000);
    return () => clearInterval(t);
  }, [isOffline]);

  if (!isOffline) return null;

  const duration = offlineSince ? Date.now() - offlineSince : 0;
  // Distinguere i 2 stati per UX più precisa
  const message = !isOnline
    ? "Connessione assente"
    : !isReachable
      ? "Server irraggiungibile (controlla WiFi cantiere)"
      : "Connessione instabile";

  const handleRetry = () => {
    setRetrying(true);
    retry();
    setTimeout(() => setRetrying(false), 1500);
  };

  return (
    <div className="bg-destructive text-destructive-foreground px-3 py-2 text-sm font-medium flex items-center gap-2 sm:gap-3 flex-wrap justify-center">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span className="truncate">
        {message}
        {duration > 5000 && (
          <span className="ml-1 opacity-80 font-normal" data-tick={tick}>
            · da {formatOfflineDuration(duration)}
          </span>
        )}
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={handleRetry}
        disabled={retrying}
        className="h-7 px-2 text-xs bg-destructive-foreground/10 hover:bg-destructive-foreground/20 text-destructive-foreground border-destructive-foreground/40 shrink-0"
      >
        {retrying ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="h-3 w-3 mr-1" />
        )}
        {retrying ? "Verifica…" : "Riprova"}
      </Button>
    </div>
  );
}
