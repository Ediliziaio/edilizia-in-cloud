/**
 * Banner per il consenso alle notifiche push PWA.
 * Mostrato agli operai/tecnici al primo accesso se non hanno ancora dato il consenso.
 */
import { Bell, BellOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";

interface PushConsentBannerProps {
  onDismiss?: () => void;
}

export function PushConsentBanner({ onDismiss }: PushConsentBannerProps) {
  const { permission, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotifications();

  // Non mostrare se non supportato o già deciso
  if (permission === "unsupported" || permission === "denied") return null;
  if (isSubscribed) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
        <Bell className="h-4 w-4 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-blue-900">Attiva le notifiche</p>
        {/* Solo quello che parte davvero: gli avvisi di documenti in scadenza per
            la persona non esistono ancora (26/09/2026). */}
        <p className="text-xs text-blue-700 mt-0.5">
          Gli avvisi arrivano sul telefono anche ad app chiusa.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={subscribe}
            disabled={isLoading}
          >
            {isLoading ? "Attivazione…" : "Attiva notifiche"}
          </Button>
          {onDismiss && (
            <Button size="sm" variant="ghost" className="text-blue-600" onClick={onDismiss}>
              Non ora
            </Button>
          )}
        </div>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 text-blue-400 hover:text-blue-600 transition-colors"
          aria-label="Chiudi"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Versione compatta per le impostazioni profilo */
export function PushNotificationToggle() {
  const { permission, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotifications();

  if (permission === "unsupported") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <BellOff className="h-3.5 w-3.5" />
        Notifiche push non supportate su questo dispositivo
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {isSubscribed ? (
          <Bell className="h-4 w-4 text-green-600" />
        ) : (
          <BellOff className="h-4 w-4 text-muted-foreground" />
        )}
        <div>
          <p className="text-sm font-medium">
            Notifiche push {isSubscribed ? "attive" : "disattivate"}
          </p>
          {permission === "denied" && (
            <p className="text-xs text-red-600">
              Permesso negato — abilita il browser nelle impostazioni del dispositivo
            </p>
          )}
        </div>
      </div>
      {permission !== "denied" && (
        <Button
          size="sm"
          variant={isSubscribed ? "outline" : "default"}
          onClick={isSubscribed ? unsubscribe : subscribe}
          disabled={isLoading}
        >
          {isLoading ? "…" : isSubscribed ? "Disattiva" : "Attiva"}
        </Button>
      )}
    </div>
  );
}
