import { Car, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCalendarTravel } from "@/hooks/useCalendarTravel";
import type { CalendarEvent } from "@/lib/calendar/events";
import { durataViaggio, linkIndicazioni } from "@/hooks/useCantiereLogistica";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

export function CalendarEventTravel({
  event,
  fallbackAddress,
}: {
  event: CalendarEvent;
  fallbackAddress?: string;
}) {
  const t = useT();
  const q = useCalendarTravel(event, fallbackAddress);
  const link = linkIndicazioni(q.base, {
    indirizzo: q.location.address || null,
    lat: q.location.coordinates?.lat ?? null,
    lng: q.location.coordinates?.lng ?? null,
  });
  return (
    <section
      aria-label={t("Viaggio verso questo indirizzo")}
      className="space-y-3 rounded-xl border bg-muted/20 p-4"
    >
      <h4 className="flex items-center gap-2 text-xs font-semibold">
        <Car className="h-4 w-4" />
        {t("Dalla sede a questo indirizzo")}
      </h4>
      {q.data ? (
        <div>
          <p className="text-sm font-semibold">
            {q.data.km.toLocaleString(intlCampo(), { maximumFractionDigits: 1 })} km
            ·{" "}
            {(q.data.minutes === 0 ? "0 min" : durataViaggio(q.data.minutes)) ||
              t("Tempo non disponibile")}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {q.data.source === "commessa"
              ? t("Distanza registrata nella commessa. Il tempo di viaggio è distinto dall’orario di lavoro.")
              : t("Stima su strada, sola andata. Il tempo di viaggio è distinto dall’orario di lavoro.")}
          </p>
        </div>
      ) : q.loading ? (
        <p role="status" className="text-xs text-muted-foreground">
          {t("Verifica percorso…")}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {!q.location.address
            ? t("Indirizzo non impostato.")
            : q.missingBase
              ? t("La sede operativa non ha una posizione impostata: distanza e tempo non sono calcolabili.")
              : q.error
                ? t("Percorso non disponibile. Puoi riprovare o aprire le indicazioni.")
                : t("Distanza e tempo non ancora calcolati per questo indirizzo.")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {q.canCalculate &&
          (!q.data || q.data.minutes == null) &&
          !q.loading && (
            <Button size="sm" variant="outline" onClick={q.calculate}>
              {q.error ? t("Riprova percorso") : t("Calcola percorso")}
            </Button>
          )}
        {link && (
          <Button size="sm" variant="outline" asChild>
            <a href={link} target="_blank" rel="noopener noreferrer">
              {t("Indicazioni")}
              <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </div>
    </section>
  );
}
