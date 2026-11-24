import {
  CalendarDays,
  Check,
  ShieldCheck,
  UserRound,
  Ticket,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export type AssistanceCalendar = {
  id: string;
  name: string;
  duration_minutes: number;
};
export function FishAssistanceSetup({
  calendarId,
  calendars,
  loading,
  error,
  disabled,
  onCalendarChange,
  onRetry,
}: {
  calendarId: string;
  calendars: AssistanceCalendar[];
  loading?: boolean;
  error?: boolean;
  disabled?: boolean;
  onCalendarChange: (id: string) => void;
  onRetry?: () => void;
}) {
  const t = useT();
  return (
    <section
      className="space-y-5 rounded-2xl border border-emerald-200 bg-emerald-50/30 p-5"
      aria-label={t("Assistenza completa con Silvio")}
    >
      <div>
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
          <ShieldCheck className="h-3.5 w-3.5" /> {t("Collegata a Silvio")}
        </div>
        <h2 className="text-lg font-semibold">{t("Dal problema all’appuntamento")}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {t("Le regole sono già pronte. Scegli l’agenda in cui l’assistente può prenotare.")}
        </p>
      </div>
      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          [
            UserRound,
            "Riconosce il cliente",
            "Verifica numero, nome e indirizzo.",
          ],
          [
            Ticket,
            "Salva la segnalazione",
            "Riprende la pratica o apre un ticket dopo il sì.",
          ],
          [
            CalendarDays,
            "Concorda l’appuntamento",
            "Propone orari liberi e chiede una nuova conferma.",
          ],
        ].map(([Icon, title, description]) => {
          const StepIcon = Icon as typeof Check;
          return (
            <li
              key={String(title)}
              className="rounded-xl border bg-background p-3"
            >
              <StepIcon className="mb-2 h-4 w-4 text-emerald-700" />
              <p className="text-sm font-medium">{t(String(title))}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t(String(description))}
              </p>
            </li>
          );
        })}
      </ol>
      <div>
        <Label htmlFor="assistance-calendar">{t("Calendario per l’assistenza")}</Label>
        <select
          id="assistance-calendar"
          className="mt-2 h-11 w-full rounded-lg border bg-background px-3 text-sm"
          value={calendarId}
          onChange={(e) => onCalendarChange(e.target.value)}
          disabled={disabled || loading || error}
          aria-describedby="assistance-calendar-help"
        >
          <option value="">{t("Scegli un calendario")}</option>
          {calendars.map((c) => (
            <option key={c.id} value={c.id}>{t("{name} · {duration_minutes} min", { name: String(c.name ?? ""), duration_minutes: String(c.duration_minutes ?? "") })}</option>
          ))}
        </select>
        <p
          id="assistance-calendar-help"
          className="mt-2 text-xs leading-5 text-muted-foreground"
        >
          {t("Rispetta orari, durata e impegni del titolare. Se non riesce a prenotare, il ticket resta nel centro attività per l’ufficio.")}
        </p>
        {loading && (
          <p role="status" className="mt-2 text-xs">
            {t("Carico i calendari…")}
          </p>
        )}
        {error && (
          <div role="alert" className="mt-2 text-sm text-destructive">
            {t("Non riesco a leggere i calendari.")}{" "}
            <Button variant="link" onClick={onRetry}>
              {t("Riprova")}
            </Button>
          </div>
        )}
        {!loading && !error && !calendars.length && (
          <a
            href="/azienda/impostazioni/calendari"
            className="mt-2 inline-block text-sm underline"
          >
            {t("Crea un calendario per l’assistenza")}
          </a>
        )}
      </div>
      <p className="flex items-start gap-2 text-xs leading-5 text-emerald-900">
        <Check className="mt-0.5 h-4 w-4 shrink-0" /> {t("Cliente, ticket, conversazione e appuntamento restano collegati. Se serve una persona, l’assistente propone il passaggio o concorda un richiamo.")}
      </p>
    </section>
  );
}
