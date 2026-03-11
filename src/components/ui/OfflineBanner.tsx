import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium flex items-center gap-2 justify-center">
      <WifiOff className="h-4 w-4" />
      Connessione assente — i dati potrebbero non essere aggiornati.
    </div>
  );
}
