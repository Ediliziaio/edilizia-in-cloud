import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  useCalendarOrderFinance,
  useCalendarOrderPresence,
} from "@/hooks/useCalendarOrderDetails";
import { formatCurrency } from "@/lib/formatters";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { calendarOrderSectionLocation } from "@/lib/calendar/navigation";
import type { CalendarScope } from "@/types/calendar";

const date = (d: string) => format(parseISO(d), "d MMM yyyy", { locale: it });
const time = (ms: number) =>
  new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ms);
const statusLabel = (status: string) =>
  (
    ({
      bozza: "Bozza",
      emesso: "Emesso",
      approvato: "Approvato",
      firmato: "Firmato dal cliente",
    }) as Record<string, string>
  )[status] ?? status;

export function CalendarEventPayments({
  orderId,
  onNavigate,
}: {
  orderId: string;
  onNavigate: () => void;
}) {
  const q = useCalendarOrderFinance(orderId);
  if (!q.allowed)
    return (
      <p className="text-sm text-muted-foreground">
        Incassi riservati al tuo ruolo.
      </p>
    );
  if (q.isPending)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Caricamento incassi e SAL…
      </p>
    );
  if (q.isError)
    return (
      <div role="alert" className="space-y-3 text-sm">
        Incassi non disponibili. Nessun importo è stato ricostruito.
        <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
          Riprova incassi
        </Button>
      </div>
    );
  if (!q.data) return null;
  const m = q.data;
  return (
    <section aria-label="Incassi e SAL della commessa" className="space-y-5">
      <div>
        <h4 className="text-sm font-semibold">
          Incassi attuali della commessa
        </h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Piano pagamenti, fatture e verbali SAL della commessa. Gli incassi
          parziali sono inclusi una sola volta.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/20 p-4">
        <div>
          <dt className="text-xs text-muted-foreground">Incassato</dt>
          <dd className="mt-1 text-lg font-semibold text-emerald-700">
            {formatCurrency(m.collected)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Residuo</dt>
          <dd className="mt-1 text-lg font-semibold">
            {formatCurrency(m.remaining)}
          </dd>
        </div>
      </dl>
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Verbali SAL
        </h4>
        {m.sals.map((sal) => {
          const rate = m.rates.find((r) => r.id === sal.installment_id);
          return (
            <article key={sal.id} className="rounded-lg border p-3 text-sm">
              <div className="flex justify-between gap-2">
                <h5 className="font-medium">SAL #{sal.numero_sal}</h5>
                <span className="text-xs">{statusLabel(sal.stato)}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {date(sal.data_emissione)} · Cumulativo netto{" "}
                {formatCurrency(sal.importo_totale)}
              </p>
              <p className="mt-2 text-xs">
                {rate
                  ? `${rate.label}: ${rate.status}`
                  : "Nessuna rata collegata: incasso da verificare"}
              </p>
            </article>
          );
        })}
        {!m.sals.length && (
          <p className="text-sm text-muted-foreground">
            Nessun verbale SAL registrato. Le rate al SAL possono essere ancora
            in attesa di emissione.
          </p>
        )}
      </div>
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Rate del piano
        </h4>
        {m.rates.map((rate) => (
          <article key={rate.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h5 className="text-sm font-medium">
                {rate.label || `Rata ${rate.position + 1}`}
              </h5>
              <span className="text-sm font-semibold">
                {formatCurrency(rate.amount)}
              </span>
            </div>
            <p className="text-xs font-medium">
              {rate.status}
              {rate.sal &&
                ` · SAL #${rate.sal.numero_sal}: ${statusLabel(rate.sal.stato)}`}
            </p>
            {rate.collected > 0 && (
              <p className="text-xs text-muted-foreground">
                Registrato {formatCurrency(rate.collected)} · Residuo{" "}
                {formatCurrency(rate.remaining)}
              </p>
            )}
            {rate.paid_date ? (
              <p className="text-xs text-muted-foreground">
                Incasso registrato il {date(rate.paid_date)}
              </p>
            ) : rate.data_attesa ? (
              <p className="text-xs text-muted-foreground">
                Data prevista {date(rate.data_attesa)}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Scadenza legata all’evento, ancora da definire
              </p>
            )}
          </article>
        ))}
        {!m.rates.length && (
          <p className="text-sm text-muted-foreground">
            Nessun piano rate registrato.
          </p>
        )}
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link
          to={calendarOrderSectionLocation(orderId, "section-sal")}
          onClick={onNavigate}
        >
          Apri SAL e piano pagamenti
        </Link>
      </Button>
    </section>
  );
}

export function CalendarEventPresence({
  orderId,
  day,
  scope,
  onNavigate,
}: {
  orderId: string;
  day: string;
  scope: CalendarScope;
  onNavigate: () => void;
}) {
  const q = useCalendarOrderPresence(orderId, day, scope);
  if (!q.allowed) return null;
  if (q.isPending)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Caricamento presenze del giorno…
      </p>
    );
  if (q.isError)
    return (
      <div role="alert" className="space-y-3 text-sm">
        Presenze non disponibili.
        <Button size="sm" variant="outline" onClick={() => void q.refetch()}>
          Riprova presenze
        </Button>
      </div>
    );
  return (
    <section aria-label="Presenze registrate in cantiere" className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold">
          Presenze registrate · {date(day)}
        </h4>
        <p className="mt-1 text-xs text-muted-foreground">
          {q.team
            ? "Timbrature delle persone in questa commessa."
            : "Le tue timbrature in questa commessa."}{" "}
          Le presenze sono riferite al cantiere; l’attribuzione alle fasi e le
          ore approvate arrivano dai rapportini.
        </p>
      </div>
      {q.data?.people.map((person) => (
        <article key={person.id} className="space-y-2 rounded-xl border p-4">
          <h5 className="text-sm font-semibold">{person.name}</h5>
          <p className="text-xs font-medium">
            {person.open
              ? person.state === "paused"
                ? "In pausa"
                : "In cantiere"
              : person.incomplete
                ? "Uscita da verificare"
                : "Presenza registrata"}
            {person.minutes > 0 &&
              ` · ${(person.minutes / 60).toLocaleString("it-IT", { maximumFractionDigits: 2 })} h${person.provisional ? " provvisorie" : " da timbrature"}`}
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {person.segments.map((segment, i) => (
              <li key={i}>
                {time(segment.start)}–{time(segment.end)} ·{" "}
                {segment.kind === "pause" ? "Pausa" : "Lavoro"}
                {segment.provisional ? " (in corso)" : ""}
              </li>
            ))}
          </ul>
          {person.issues > 0 && (
            <p className="text-xs text-amber-700">
              Timbrature da verificare: le ore non sostituiscono i rapportini
              approvati.
            </p>
          )}
        </article>
      ))}
      {!!q.data?.unassignedCount && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-800"
        >
          {q.data.unassignedCount} timbrature senza persona associata nel giorno
          selezionato. Gli orari per persona richiedono un collegamento valido;
          verifica i dati storici della commessa.
        </div>
      )}
      {!q.data?.people.length && !q.data?.unassignedCount && (
        <p className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
          Nessuna timbratura visibile registrata per questa commessa nel giorno
          selezionato.
        </p>
      )}
      <Button size="sm" variant="outline" asChild>
        <Link
          to={calendarOrderSectionLocation(orderId, "section-rapportini")}
          onClick={onNavigate}
        >
          Apri diario e rapportini
        </Link>
      </Button>
    </section>
  );
}
