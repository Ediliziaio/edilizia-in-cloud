/** La richiesta degli avvisi sul telefono nella Home del cantiere: vedi lib/campo/avvisiTelefono. */
import { useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { eIPhoneNelBrowser, richiestaAvvisi } from "@/lib/campo/avvisiTelefono";

const CHIAVE = "campo-push-banner-fino";
const QUATTORDICI_GIORNI = 14 * 86_400_000;

function nascostoPerOra(): boolean {
  try { return Number(localStorage.getItem(CHIAVE) ?? 0) > Date.now(); } catch { return false; }
}

export function AvvisiCampo({ momentoGiusto }: { momentoGiusto: boolean }) {
  const { permission, isSubscribed, isLoading, subscribe } = usePushNotifications();
  const [nascosto, setNascosto] = useState(nascostoPerOra);
  const standalone = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  const richiesta = richiestaAvvisi({
    permesso: permission,
    iscritto: isSubscribed,
    iPhoneNelBrowser: eIPhoneNelBrowser(navigator.userAgent, standalone),
    momentoGiusto,
  });
  if (nascosto || !richiesta) return null;

  const chiudi = () => {
    try { localStorage.setItem(CHIAVE, String(Date.now() + QUATTORDICI_GIORNI)); } catch { /* privato */ }
    setNascosto(true);
  };

  return (
    <section aria-label="Avvisi sul telefono" className="flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-3">
      <Bell className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm text-blue-900">
        {richiesta === "attiva"
          ? "Ti ricordo il rapportino e ti avviso se l'ufficio lo respinge."
          : "Per gli avvisi: Condividi → Aggiungi alla schermata Home, poi apri da lì."}
      </p>
      {richiesta === "attiva" && (
        <Button size="sm" className="shrink-0 bg-blue-600 text-white hover:bg-blue-700" disabled={isLoading} onClick={() => void subscribe()}>
          {isLoading ? "…" : "Attiva"}
        </Button>
      )}
      <button type="button" onClick={chiudi} aria-label="Non ora" className="tap-compact flex h-8 w-8 shrink-0 items-center justify-center text-blue-400">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </section>
  );
}
