/**
 * «Su questo telefono»: l'interruttore delle push per il dispositivo in mano.
 *
 * Le push vivono per dispositivo (un'iscrizione per browser), non per utente:
 * accese sul telefono non lo sono sul computer. Qui si accendono e spengono
 * per questo dispositivo, e si dice in una riga perché non si può quando non si
 * può: su iPhone il sito va aggiunto alla schermata Home (Safari da solo non
 * riceve push), altrove il permesso può essere stato bloccato.
 */
import { BellRing } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { cn } from "@/lib/utils";

function iPhoneNonInstallato(): boolean {
  if (typeof window === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const installato = window.matchMedia?.("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !installato;
}

export function NotificheSuQuestoDispositivo({ className }: { className?: string }) {
  const { supported, permission, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotifications();

  const perche =
    !supported
      ? iPhoneNonInstallato()
        ? "Su iPhone: aggiungi il sito alla schermata Home e aprilo da lì."
        : "Questo browser non riceve notifiche."
      : permission === "denied"
        ? "Bloccate nelle impostazioni del browser: riattivale da lì."
        : null;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <BellRing className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm">Su questo telefono</p>
        <p className="text-xs text-muted-foreground">
          {perche ?? (isSubscribed ? "Gli avvisi arrivano anche ad app chiusa." : "Spento: gli avvisi restano nell'app.")}
        </p>
      </div>
      <Switch
        checked={isSubscribed}
        disabled={isLoading || !!perche}
        onCheckedChange={(acceso) => void (acceso ? subscribe() : unsubscribe())}
        aria-label="Notifiche su questo telefono"
      />
    </div>
  );
}
