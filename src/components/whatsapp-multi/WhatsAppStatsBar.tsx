// MP-FINAL — Riepilogo WhatsApp per il hub.
//
// 09/10/2026: una riga al posto di cinque riquadri uguali («{n} numeri attivi · {m} messaggi nelle ultime 24 ore · spesa
// di oggi {x}»). Gli errori compaiono solo se ce ne sono, in rosso: a zero erano un riquadro intero per dire niente.

import { Skeleton } from "@/components/ui/skeleton";
import { useWAMetrics } from "@/hooks/whatsapp/useWAMetrics";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

export function WhatsAppStatsBar() {
  const t = useT();
  const { data: m, isLoading } = useWAMetrics();

  if (isLoading) {
    return <Skeleton className="h-5 w-80 max-w-full" aria-label={t("Caricamento del riepilogo WhatsApp")} />;
  }

  if (!m) return null;

  // Spesa in euro con due decimali: «€ 0.0000» (quattro decimali, punto
  // all'inglese) sembrava un codice. Sotto il centesimo si dice «< 0,01 €».
  const spesa = m.total_spend_today > 0 && m.total_spend_today < 0.01
    ? "< 0,01 €"
    : m.total_spend_today.toLocaleString(intlCampo(), { style: "currency", currency: "EUR" });

  return (
    <p className="text-sm text-muted-foreground" role="region" aria-label={t("Riepilogo WhatsApp")}>
      <span className="font-medium text-foreground">{m.active_numbers}</span>{" "}
      {m.active_numbers === 1 ? t("numero attivo") : t("numeri attivi")} ·{" "}
      <span className="font-medium text-foreground">{m.messages_last_24h}</span>{" "}
      {m.messages_last_24h === 1 ? t("messaggio") : t("messaggi")} {t("nelle ultime 24 ore ·")}{" "}
      <span className="font-medium text-foreground">{m.tool_calls_last_24h}</span>{" "}
      {m.tool_calls_last_24h === 1 ? t("azione") : t("azioni")} {t("dell'AI · spesa di oggi")}{" "}
      <span className="font-medium text-foreground">{spesa}</span>
      {m.errors_last_24h > 0 && (
        <>
          {" "}·{" "}
          <span className="font-medium text-red-600">
            {m.errors_last_24h} {m.errors_last_24h === 1 ? t("errore") : t("errori")} {t("nelle ultime 24 ore")}
          </span>
        </>
      )}
    </p>
  );
}
