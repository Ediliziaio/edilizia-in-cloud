import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bot,
  CalendarDays,
  Check,
  Circle,
  ClipboardList,
  Phone,
  RefreshCw,
  Ticket,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FishAssistanceActivity } from "@/lib/fishAssistanceActivities";
import {
  ASSISTANCE_REASON_LABELS,
  ASSISTANCE_STAGE_LABELS,
} from "../../../shared/fish/assistance";

const cancelled = (row: FishAssistanceActivity) =>
  (row.stage === "scheduled" && !row.appointment_id) ||
  (!!row.appointment &&
    ["annullato", "cancellato", "cancelled", "disdetto"].includes(
      row.appointment.status,
    ));
const needsOffice = (row: FishAssistanceActivity) =>
  row.stage === "needs_office" || cancelled(row);
function dateLabel(date: string, time: string | null) {
  const parsed = new Date(`${date}T12:00:00`);
  if (!Number.isFinite(parsed.getTime())) return "Data da verificare";
  return `${new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(parsed)}${time ? ` alle ${time.slice(0, 5)}` : ""}`;
}
export function SilvioAssistanceActivitiesView({
  activities,
  loading = false,
  error = false,
  onRefresh,
  canViewCustomers = true,
  canViewCalendar = true,
  canConfigure = true,
  showRecordLinks = true,
}: {
  activities: FishAssistanceActivity[];
  loading?: boolean;
  error?: boolean;
  onRefresh: () => void;
  canViewCustomers?: boolean;
  canViewCalendar?: boolean;
  canConfigure?: boolean;
  showRecordLinks?: boolean;
}) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const filtered = activities.filter(
    (row) =>
      (filter !== "office" || needsOffice(row)) &&
      `${row.customerName || ""} ${row.problem || ""} ${row.ticket_id || ""}`
        .toLocaleLowerCase("it")
        .includes(search.trim().toLocaleLowerCase("it")),
  );
  return (
    <section className="space-y-5" aria-label="Assistenza dal centralino">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-emerald-700">
            <Phone className="h-3.5 w-3.5" /> Centralino + Silvio
          </div>
          <h2 className="text-lg font-semibold">
            Ogni richiesta, fino al prossimo passo
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Cliente, ticket e appuntamento nello stesso percorso. Qui trovi
            anche le richieste che hanno bisogno dell’ufficio.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
          Aggiorna
        </Button>
      </div>
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          Non riesco a caricare le attività di assistenza. Controlla che il
          collegamento a Silvio sia disponibile e riprova. Lo storico delle
          chiamate resta nel centralino.
        </div>
      ) : loading ? (
        <p role="status" className="p-5 text-sm text-muted-foreground">
          Carico i percorsi di assistenza…
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex rounded-lg border p-1"
              aria-label="Filtra attività"
            >
              <Button
                size="sm"
                variant={filter === "all" ? "secondary" : "ghost"}
                aria-pressed={filter === "all"}
                onClick={() => setFilter("all")}
              >
                Tutte ({activities.length})
              </Button>
              <Button
                size="sm"
                variant={filter === "office" ? "secondary" : "ghost"}
                aria-pressed={filter === "office"}
                onClick={() => setFilter("office")}
              >
                Da seguire ({activities.filter(needsOffice).length})
              </Button>
            </div>
            <Input
              className="min-w-48 flex-1 sm:max-w-sm"
              aria-label="Cerca attività di assistenza"
              placeholder="Cliente, problema o riferimento ticket"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {!filtered.length ? (
            <div className="rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
              <ClipboardList className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
              <p className="font-medium">
                {activities.length
                  ? "Nessuna richiesta con questi filtri"
                  : "Le richieste di assistenza arriveranno qui"}
              </p>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                {activities.length
                  ? "Cambia filtro o cerca un altro riferimento."
                  : "Configura il flusso Assistenza completa. Quando riceve una chiamata, Silvio segue la verifica del cliente, la segnalazione e l’appuntamento."}
              </p>
              {!activities.length && canConfigure && (
                <Button asChild className="mt-4" variant="outline">
                  <Link to="/azienda/agenti-ai?crea=assistenza">
                    Configura l’assistenza
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((row) => (
                <article
                  key={row.id}
                  id={`assistenza-${row.id}`}
                  className="overflow-hidden rounded-2xl border bg-card shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <Bot className="h-4 w-4 shrink-0 text-emerald-700" />
                        {row.customerName ||
                          (row.identity_verified_at
                            ? "Cliente verificato"
                            : "Chiamante da verificare")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat("it-IT", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(row.created_at))}
                        {row.ticket_id
                          ? ` · Ticket ${row.ticket_id.slice(0, 8).toUpperCase()}`
                          : " · Richiesta dal centralino"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        needsOffice(row)
                          ? "border-amber-200 bg-amber-50 text-amber-900"
                          : row.stage === "scheduled"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : ""
                      }
                    >
                      {cancelled(row)
                        ? "Appuntamento da verificare"
                        : ASSISTANCE_STAGE_LABELS[row.stage]}
                    </Badge>
                  </div>
                  {row.problem && (
                    <p className="line-clamp-2 px-5 text-sm leading-6 text-muted-foreground">
                      {row.problem}
                    </p>
                  )}
                  <ol
                    className="grid gap-2 p-5 sm:grid-cols-3"
                    aria-label="Avanzamento della richiesta"
                  >
                    {[
                      {
                        icon: UserRound,
                        label: "Cliente verificato",
                        done: !!row.identity_verified_at,
                        note: row.identity_verified_at
                          ? "Nome e indirizzo verificati"
                          : "Dati da verificare",
                      },
                      {
                        icon: Ticket,
                        label: "Segnalazione",
                        done: !!row.ticket_id,
                        note: row.ticket_id
                          ? row.ticket_action === "updated"
                            ? "Pratica esistente aggiornata"
                            : "Ticket salvato"
                          : "In attesa della conferma",
                      },
                      {
                        icon: CalendarDays,
                        label: "Appuntamento",
                        done: !!row.appointment_id && !cancelled(row),
                        note: cancelled(row)
                          ? "Da verificare in agenda"
                          : row.appointment
                            ? dateLabel(
                                row.appointment.date,
                                row.appointment.time,
                              )
                            : row.appointment_id
                              ? "Prenotazione salvata"
                              : "Da concordare con il cliente",
                      },
                    ].map((step) => (
                      <li
                        key={step.label}
                        className={`rounded-xl p-3 ${step.done ? "bg-emerald-50/70" : "bg-muted/40"}`}
                      >
                        <p className="flex items-center gap-2 text-xs font-medium">
                          {step.done ? (
                            <Check className="h-4 w-4 text-emerald-700" />
                          ) : (
                            <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          {step.label}
                        </p>
                        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                          {step.note}
                        </p>
                      </li>
                    ))}
                  </ol>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3">
                    <p className="max-w-xl text-xs leading-5 text-muted-foreground">
                      {cancelled(row)
                        ? "La prenotazione richiede una verifica. Concordare il seguito senza riprenotare automaticamente."
                        : row.reason
                          ? ASSISTANCE_REASON_LABELS[row.reason]
                          : row.stage === "scheduled"
                            ? "Percorso completato. Il ticket resta disponibile per seguire l’intervento."
                            : "La richiesta resta salvata anche se la chiamata si interrompe."}
                    </p>
                    <div
                      className={
                        showRecordLinks
                          ? "flex flex-wrap gap-3 text-xs font-medium"
                          : "hidden"
                      }
                    >
                      {row.customer_id && canViewCustomers && (
                        <Link
                          className="underline underline-offset-4"
                          to={`/azienda/clienti/${row.customer_id}`}
                        >
                          Scheda cliente
                        </Link>
                      )}
                      {row.ticket_id && (
                        <Link
                          className="underline underline-offset-4"
                          to={`/azienda/assistenza/${row.ticket_id}`}
                        >
                          Ticket e conversazione
                        </Link>
                      )}
                      {row.appointment_id && canViewCalendar && (
                        <Link
                          className="underline underline-offset-4"
                          to="/azienda/calendario"
                        >
                          Apri calendario
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
