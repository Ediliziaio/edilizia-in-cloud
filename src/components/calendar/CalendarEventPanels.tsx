import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  useCalendarOrderFinance,
  useCalendarOrderPresence,
} from "@/hooks/useCalendarOrderDetails";
import { formatCurrency } from "@/lib/formatters";
import { format, parseISO } from "date-fns";
import { calendarOrderSectionLocation } from "@/lib/calendar/navigation";
import type { CalendarScope } from "@/types/calendar";
import { dateFnsCampo, intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

const date = (d: string) => format(parseISO(d), "d MMM yyyy", { locale: dateFnsCampo() });
const time = (ms: number) =>
  new Intl.DateTimeFormat(intlCampo(), {
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
  const t = useT();
  const q = useCalendarOrderFinance(orderId);
  if (!q.allowed)
    return (
      <p className="text-sm text-muted-foreground">
        {t("Incassi riservati al tuo ruolo.")}
      </p>
    );
  if (q.isPending)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("Caricamento incassi e SAL…")}
      </p>
    );
  if (q.isError)
    return (
      <div role="alert" className="space-y-3 text-sm">
        {t("Incassi non disponibili. Nessun importo è stato ricostruito.")}
        <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
          {t("Riprova incassi")}
        </Button>
      </div>
    );
  if (!q.data) return null;
  const m = q.data;
  return (
    <section aria-label={t("Incassi e SAL della commessa")} className="space-y-5">
      <div>
        <h4 className="text-sm font-semibold">
          {t("Incassi attuali della commessa")}
        </h4>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("Piano pagamenti, fatture e verbali SAL della commessa. Gli incassi parziali sono inclusi una sola volta.")}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/20 p-4">
        <div>
          <dt className="text-xs text-muted-foreground">{t("Incassato")}</dt>
          <dd className="mt-1 text-lg font-semibold text-emerald-700">
            {formatCurrency(m.collected)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("Residuo")}</dt>
          <dd className="mt-1 text-lg font-semibold">
            {formatCurrency(m.remaining)}
          </dd>
        </div>
      </dl>
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("Verbali SAL")}
        </h4>
        {m.sals.map((sal) => {
          const rate = m.rates.find((r) => r.id === sal.installment_id);
          return (
            <article key={sal.id} className="rounded-lg border p-3 text-sm">
              <div className="flex justify-between gap-2">
                <h5 className="font-medium">{t("SAL #{n}", { n: sal.numero_sal })}</h5>
                <span className="text-xs">{t(statusLabel(sal.stato))}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {date(sal.data_emissione)}
                {sal.importo_totale != null && <> · {t("Cumulativo netto {importo}", { importo: formatCurrency(sal.importo_totale) })}</>}
              </p>
              <p className="mt-2 text-xs">
                {rate
                  ? `${rate.label}: ${rate.status}`
                  : t("Nessuna rata collegata: incasso da verificare")}
              </p>
            </article>
          );
        })}
        {!m.sals.length && (
          <p className="text-sm text-muted-foreground">
            {t("Nessun verbale SAL registrato. Le rate al SAL possono essere ancora in attesa di emissione.")}
          </p>
        )}
      </div>
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("Rate del piano")}
        </h4>
        {m.rates.map((rate) => (
          <article key={rate.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h5 className="text-sm font-medium">
                {rate.label || t("Rata {n}", { n: rate.position + 1 })}
              </h5>
              <span className="text-sm font-semibold">
                {formatCurrency(rate.amount)}
              </span>
            </div>
            <p className="text-xs font-medium">
              {rate.status}
              {rate.sal &&
                " · " + t("SAL #{n}: {stato}", { n: rate.sal.numero_sal, stato: t(statusLabel(rate.sal.stato)) })}
            </p>
            {rate.collected > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("Registrato {incassato} · Residuo {residuo}", {
                  incassato: formatCurrency(rate.collected),
                  residuo: formatCurrency(rate.remaining),
                })}
              </p>
            )}
            {rate.paid_date ? (
              <p className="text-xs text-muted-foreground">
                {t("Incasso registrato il {data}", { data: date(rate.paid_date) })}
              </p>
            ) : rate.data_attesa ? (
              <p className="text-xs text-muted-foreground">
                {t("Data prevista {data}", { data: date(rate.data_attesa) })}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("Scadenza legata all’evento, ancora da definire")}
              </p>
            )}
          </article>
        ))}
        {!m.rates.length && (
          <p className="text-sm text-muted-foreground">
            {t("Nessun piano rate registrato.")}
          </p>
        )}
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link
          to={calendarOrderSectionLocation(orderId, "section-sal")}
          onClick={onNavigate}
        >
          {t("Apri SAL e piano pagamenti")}
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
  const t = useT();
  const q = useCalendarOrderPresence(orderId, day, scope);
  if (!q.allowed) return null;
  if (q.isPending)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("Caricamento presenze del giorno…")}
      </p>
    );
  if (q.isError)
    return (
      <div role="alert" className="space-y-3 text-sm">
        {t("Presenze non disponibili.")}
        <Button size="sm" variant="outline" onClick={() => void q.refetch()}>
          {t("Riprova presenze")}
        </Button>
      </div>
    );
  return (
    <section aria-label={t("Presenze registrate in cantiere")} className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold">
          {t("Presenze registrate · {data}", { data: date(day) })}
        </h4>
        <p className="mt-1 text-xs text-muted-foreground">
          {q.team
            ? t("Timbrature delle persone in questa commessa.")
            : t("Le tue timbrature in questa commessa.")}{" "}
          {t("Le presenze sono riferite al cantiere; l’attribuzione alle fasi e le ore approvate arrivano dai rapportini.")}
        </p>
      </div>
      {q.data?.people.map((person) => (
        <article key={person.id} className="space-y-2 rounded-xl border p-4">
          <h5 className="text-sm font-semibold">{person.name}</h5>
          <p className="text-xs font-medium">
            {person.open
              ? person.state === "paused"
                ? t("In pausa")
                : t("In cantiere")
              : person.incomplete
                ? t("Uscita da verificare")
                : t("Presenza registrata")}
            {person.minutes > 0 &&
              " · " + t(person.provisional ? "{ore} h provvisorie" : "{ore} h da timbrature", { ore: (person.minutes / 60).toLocaleString(intlCampo(), { maximumFractionDigits: 2 }) })}
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {person.segments.map((segment, i) => (
              <li key={i}>
                {time(segment.start)}–{time(segment.end)} ·{" "}
                {segment.kind === "pause" ? t("Pausa") : t("Lavoro")}
                {segment.provisional ? " " + t("(in corso)") : ""}
              </li>
            ))}
          </ul>
          {person.issues > 0 && (
            <p className="text-xs text-amber-700">
              {t("Timbrature da verificare: le ore non sostituiscono i rapportini approvati.")}
            </p>
          )}
        </article>
      ))}
      {!!q.data?.unassignedCount && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-800"
        >
          {t("{n} timbrature senza persona associata nel giorno selezionato. Gli orari per persona richiedono un collegamento valido; verifica i dati storici della commessa.", { n: q.data.unassignedCount })}
        </div>
      )}
      {!q.data?.people.length && !q.data?.unassignedCount && (
        <p className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
          {t("Nessuna timbratura visibile registrata per questa commessa nel giorno selezionato.")}
        </p>
      )}
      <Button size="sm" variant="outline" asChild>
        <Link
          to={calendarOrderSectionLocation(orderId, "section-rapportini")}
          onClick={onNavigate}
        >
          {t("Apri diario e rapportini")}
        </Link>
      </Button>
    </section>
  );
}
