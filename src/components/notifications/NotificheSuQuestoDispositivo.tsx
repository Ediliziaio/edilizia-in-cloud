/**
 * «Su questo dispositivo»: l'interruttore delle push per il telefono o il computer in mano.
 *
 * Le push vivono per dispositivo (un'iscrizione per browser), non per utente:
 * accese sul telefono non lo sono sul computer. Qui si accendono e spengono
 * per questo dispositivo, e si dice in una riga perché non si può quando non si
 * può: su iPhone il sito va aggiunto alla schermata Home (Safari da solo non
 * riceve push), altrove il permesso può essere stato bloccato.
 */
import { BellRing } from "lucide-react";
import { useId } from "react";
import { Switch } from "@/components/ui/switch";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

function iPhoneNonInstallato(): boolean {
  if (typeof window === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const installato = window.matchMedia?.("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !installato;
}

export function NotificheSuQuestoDispositivo({ className }: { className?: string }) {
  const t = useT();
  const { supported, permission, isSubscribed, isLoading, subscribe, unsubscribe, nativa, servizioNativo, errore } = usePushNotifications();
  const idStato = useId();

  const perche =
    !supported
      ? !nativa && iPhoneNonInstallato()
        ? t("Su iPhone aggiungi il sito alla schermata Home e aprilo da lì.")
        : nativa ? t("Le notifiche su questo telefono non sono disponibili.") : t("Questo browser non riceve notifiche.")
      : nativa && servizioNativo === false
        ? t("Il servizio per questo telefono non è ancora attivo.")
      : permission === "denied"
        ? nativa ? t("Riattiva le notifiche dalle impostazioni del telefono.") : t("Riattiva le notifiche dalle impostazioni del browser.")
        : null;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <BellRing className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm">{t("Su questo dispositivo")}</p>
        <p id={idStato} className="text-xs text-muted-foreground">
          {perche ?? (isSubscribed ? t("Ricevi gli avvisi anche ad app chiusa.") : t("Gli avvisi sono disponibili nella campanella."))}
        </p>
        {errore && <p role="alert" className="mt-1 text-xs text-destructive">{errore}</p>}
      </div>
      <Switch
        checked={isSubscribed}
        disabled={isLoading || (!isSubscribed && !!perche)}
        onCheckedChange={(acceso) => void (acceso ? subscribe() : unsubscribe())}
        aria-label={t("Notifiche su questo dispositivo")}
        aria-describedby={idStato}
      />
    </div>
  );
}
