import { useEffect, useRef, useState } from "react";
import {
  Bot,
  CalendarDays,
  CheckCircle2,
  Database,
  FlaskConical,
  Loader2,
  Send,
  Ticket,
  UserRound,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AgentPipeline,
  type PipelineStep,
} from "@/components/ui/fish-agent-pipeline";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SilvioAssistanceActivitiesView } from "@/components/silvio/SilvioAssistanceActivitiesView";
import { LocalFishVoicePanel } from "@/components/agenti/LocalFishVoicePanel";
import {
  createLocalAssistanceClient,
  type LocalLabBootstrap,
  type LocalLabSnapshot,
} from "@/lib/localAssistanceClient";
const selectClass =
  "mt-2 h-11 w-full rounded-lg border bg-background px-3 text-sm";
const ref = (id: string) => id.slice(0, 8).toUpperCase();
const done = (state: LocalLabSnapshot | null) =>
  !!state && ["done", "needs_office"].includes(state.session.phase);

function assistanceSteps(snapshot: LocalLabSnapshot | null): PipelineStep[] {
  const customer = !!snapshot?.customer;
  const ticket = !!snapshot?.ticket;
  const appointment = !!snapshot?.appointment;
  const office = snapshot?.session.phase === "needs_office";
  const running = !!snapshot && !done(snapshot);
  return [
    {
      id: "customer",
      label: "Cliente",
      detail: customer
        ? "Identità verificata"
        : office
          ? "Da verificare in ufficio"
          : "Verifica numero, nome e indirizzo",
      icon: UserRound,
      state: customer
        ? "done"
        : office
          ? "attention"
          : running
            ? "active"
            : "waiting",
    },
    {
      id: "ticket",
      label: "Ticket",
      detail: ticket
        ? "Segnalazione collegata"
        : office && customer
          ? "Da gestire in ufficio"
          : "Dopo la conferma del cliente",
      icon: Ticket,
      state: ticket
        ? "done"
        : office && customer
          ? "attention"
          : customer && running
            ? "active"
            : "waiting",
    },
    {
      id: "appointment",
      label: "Appuntamento",
      detail: appointment
        ? "Prenotazione salvata"
        : office && ticket
          ? "Da concordare con l’ufficio"
          : "Scelta e conferma dell’orario",
      icon: CalendarDays,
      state: appointment
        ? "done"
        : office && ticket
          ? "attention"
          : ticket && running
            ? "active"
            : "waiting",
    },
  ];
}
export default function LocalAssistanceLabPage() {
  const [client] = useState(createLocalAssistanceClient);
  const [bootstrap, setBootstrap] = useState<LocalLabBootstrap | null>(null);
  const [snapshot, setSnapshot] = useState<LocalLabSnapshot | null>(null);
  const [customer, setCustomer] = useState("");
  const [calendar, setCalendar] = useState("");
  const [scenario, setScenario] = useState("new");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [view, setView] = useState("risultati");
  const [localVoice, setLocalVoice] = useState<SpeechSynthesisVoice | null>(
    () =>
      window.speechSynthesis
        ?.getVoices()
        .find((v) => v.localService && v.lang.toLowerCase().startsWith("it")) ||
      null,
  );
  const [retryTurn, setRetryTurn] = useState<{
    requestId: string;
    text: string;
  } | null>(null);
  const startKey = useRef(crypto.randomUUID());
  const bottom = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let live = true;
    client
      .bootstrap()
      .then((data) => {
        if (live) {
          setBootstrap(data);
          setCustomer(data.customers[0]?.id || "");
          setCalendar(data.defaultCalendarId);
          setLoading(false);
        }
      })
      .catch(() => {
        if (live) {
          setError(
            "Il backend locale non risponde. Avvialo con npm run centralino:assistenza-local, poi ricarica questa pagina.",
          );
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [client]);
  useEffect(() => {
    if (!window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    const update = () =>
      setLocalVoice(
        synth
          .getVoices()
          .find(
            (v) => v.localService && v.lang.toLowerCase().startsWith("it"),
          ) || null,
      );
    synth.addEventListener("voiceschanged", update);
    return () => synth.removeEventListener("voiceschanged", update);
  }, []);
  useEffect(() => {
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    bottom.current?.scrollIntoView?.({
      behavior: reduce ? "instant" : "smooth",
      block: "nearest",
    });
  }, [snapshot?.session.messages.length]);
  const finish = (state: LocalLabSnapshot) => {
    setSnapshot(state);
    setError("");
    setText("");
    setRetryTurn(null);
  };
  async function start() {
    if (!bootstrap || busy) return;
    setBusy(true);
    setError("");
    try {
      finish(
        await client.start({
          requestId: startKey.current,
          customerId: customer,
          calendarId: calendar,
          scenario,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Avvio non riuscito.");
    } finally {
      setBusy(false);
    }
  }
  async function send(
    value: string,
    pending?: { requestId: string; text: string },
  ) {
    if (!snapshot || busy || !value.trim()) return;
    const request = pending || {
      requestId: crypto.randomUUID(),
      text: value.trim(),
    };
    setBusy(true);
    setError("");
    try {
      finish(await client.turn(snapshot.session.id, request));
      window.requestAnimationFrame?.(() => inputRef.current?.focus());
    } catch (e) {
      setRetryTurn(request);
      setError(
        e instanceof Error
          ? e.message
          : "Invio non riuscito. Puoi riprovare lo stesso messaggio.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    if (!snapshot || busy) return;
    setBusy(true);
    try {
      finish(await client.snapshot(snapshot.session.id));
    } catch {
      setError("Non riesco a rileggere la prova locale.");
    } finally {
      setBusy(false);
    }
  }
  async function reopen(id: string) {
    if (!id || busy) return;
    setBusy(true);
    setError("");
    try {
      const state = await client.snapshot(id);
      finish(state);
      setScenario(state.session.scenario);
      setCalendar(
        state.activity?.calendar_id || bootstrap?.defaultCalendarId || "",
      );
      const fixture = bootstrap?.customers.find(
        (c) => c.name === state.fixture?.name,
      );
      if (fixture) setCustomer(fixture.id);
    } catch {
      setError("Non riesco a riaprire il collaudo locale.");
    } finally {
      setBusy(false);
    }
  }
  function newTrial() {
    startKey.current = crypto.randomUUID();
    setSnapshot(null);
    setRetryTurn(null);
    setText("");
    setError("");
    setView("risultati");
    client
      .bootstrap()
      .then(setBootstrap)
      .catch(() => setError("Non riesco a rileggere il backend locale."));
  }
  function speak() {
    const last = snapshot?.session.messages
      .filter((m) => m.role === "agent")
      .at(-1);
    if (!localVoice || !last) return;
    const utterance = new SpeechSynthesisUtterance(last.text);
    utterance.voice = localVoice;
    utterance.lang = "it-IT";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }
  const fixture =
    snapshot?.fixture || bootstrap?.customers.find((c) => c.id === customer);
  return (
    <main className="mx-auto max-w-7xl space-y-5 p-3 sm:p-6">
      <div className="eic-motion-enter flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-emerald-700">
            <FlaskConical className="h-4 w-4" /> Collaudo locale
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Prova l’assistenza dall’inizio alla fine
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Un cliente di test, un ticket e un appuntamento collegati davvero.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href="/azienda/centralino">Torna al centralino</a>
        </Button>
      </div>
      <AgentPipeline
        title="Percorso dell’assistenza"
        steps={assistanceSteps(snapshot)}
      />
      <div
        role="status"
        className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-900"
      >
        <Database className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-medium">
            {bootstrap
              ? "Backend locale attivo · dati di test"
              : "Collegamento al backend locale…"}
          </p>
          <p className="mt-1 text-xs leading-5">
            Questa prova salva cliente, ticket e appuntamento solo nel database
            del computer. Attivando la voce, audio e testi delle risposte
            vengono elaborati da Fish. La conversazione segue una procedura
            guidata; non effettua telefonate o sincronizzazioni esterne.
          </p>
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          {error}
          {retryTurn && (
            <Button
              className="ml-3"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => send(retryTurn.text, retryTurn)}
            >
              Riprova lo stesso invio
            </Button>
          )}
        </div>
      )}
      {loading ? (
        <p className="flex items-center gap-2 p-5 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparo il collaudo…
        </p>
      ) : (
        bootstrap && (
          <>
            <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
              <aside className="space-y-4">
                <section className="eic-motion-panel space-y-4 rounded-2xl border bg-card p-5">
                  <h2 className="font-semibold">Imposta la prova</h2>
                  <div>
                    <Label htmlFor="local-customer">Cliente di test</Label>
                    <select
                      id="local-customer"
                      className={selectClass}
                      value={customer}
                      disabled={!!snapshot || busy}
                      onChange={(e) => {
                        setCustomer(e.target.value);
                        startKey.current = crypto.randomUUID();
                      }}
                    >
                      {bootstrap.customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="local-scenario">Caso da provare</Label>
                    <select
                      id="local-scenario"
                      className={selectClass}
                      value={scenario}
                      disabled={!!snapshot || busy}
                      onChange={(e) => {
                        setScenario(e.target.value);
                        startKey.current = crypto.randomUUID();
                      }}
                    >
                      {bootstrap.scenarios.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="local-calendar">Agenda di test</Label>
                    <select
                      id="local-calendar"
                      className={selectClass}
                      value={calendar}
                      disabled={!!snapshot || busy}
                      onChange={(e) => {
                        setCalendar(e.target.value);
                        startKey.current = crypto.randomUUID();
                      }}
                    >
                      {bootstrap.calendars.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.duration_minutes} min
                        </option>
                      ))}
                    </select>
                  </div>
                  {snapshot ? (
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={newTrial}
                      disabled={busy}
                    >
                      Nuovo collaudo
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={start}
                      disabled={busy || !customer || !calendar}
                    >
                      {busy ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <FlaskConical className="mr-2 h-4 w-4" />
                      )}
                      Avvia collaudo
                    </Button>
                  )}
                </section>
                {!!bootstrap.sessions.length && (
                  <section className="rounded-2xl border bg-card p-5">
                    <Label htmlFor="local-resume">
                      Riapri una prova salvata
                    </Label>
                    <select
                      id="local-resume"
                      className={selectClass}
                      value=""
                      disabled={busy}
                      onChange={(e) => void reopen(e.target.value)}
                    >
                      <option value="">Scegli una prova</option>
                      {bootstrap.sessions.map((saved) => (
                        <option key={saved.id} value={saved.id}>
                          {new Intl.DateTimeFormat("it-IT", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(saved.created_at))}{" "}
                          · {ref(saved.id)}
                        </option>
                      ))}
                    </select>
                  </section>
                )}
                {fixture && (
                  <section className="rounded-2xl border bg-muted/20 p-5">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <UserRound className="h-4 w-4" />
                      Dati da dichiarare
                    </h2>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Usa questi dati quando interpreti il cliente. Puoi anche
                      sbagliarli per verificare il blocco.
                    </p>
                    <dl className="mt-4 space-y-3 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Nome e cognome
                        </dt>
                        <dd className="mt-1 font-medium">{fixture.name}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Indirizzo
                        </dt>
                        <dd className="mt-1">{fixture.address}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Numero della prova
                        </dt>
                        <dd className="mt-1 font-mono text-xs">
                          {fixture.phone}
                        </dd>
                      </div>
                    </dl>
                  </section>
                )}
              </aside>
              <section
                className="overflow-hidden rounded-2xl border bg-card shadow-sm"
                aria-label="Conversazione di collaudo"
              >
                <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="rounded-xl bg-blue-50 p-2 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                      <Bot className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="font-semibold">
                        Parla con l’assistente di test
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Scrivi o scegli una risposta. Ogni azione viene
                        verificata prima del salvataggio.
                      </p>
                    </div>
                  </div>
                  {snapshot && localVoice && !bootstrap.voice?.configured && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={speak}
                      title="Legge la risposta con una voce locale del dispositivo, senza Fish"
                    >
                      <Volume2 className="mr-2 h-4 w-4" />
                      Ascolta
                    </Button>
                  )}
                </div>
                {bootstrap.voice && (
                  <LocalFishVoicePanel
                    client={client}
                    status={bootstrap.voice}
                    snapshot={snapshot}
                    disabled={busy || !!retryTurn}
                    onTranscript={setText}
                  />
                )}
                <div
                  className="max-h-[480px] min-h-[230px] space-y-4 overflow-y-auto bg-muted/10 p-4 sm:p-5"
                  aria-live="polite"
                  aria-relevant="additions text"
                >
                  {!snapshot ? (
                    <div className="p-8 text-center">
                      <Bot className="mx-auto mb-3 h-8 w-8 text-blue-400" />
                      <p className="text-sm font-medium">Pronto quando vuoi</p>
                      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                        Avvia il collaudo e descrivi il problema. L’assistente
                        verifica il cliente e chiede due conferme distinte, per
                        ticket e appuntamento.
                      </p>
                    </div>
                  ) : (
                    snapshot.session.messages.map((m, index, messages) => (
                      <div
                        key={m.id}
                        className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} ${index >= messages.length - 2 ? "eic-motion-enter" : ""}`}
                      >
                        <div
                          className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 ${m.role === "user" ? "bg-blue-600 text-white" : "border bg-background"}`}
                        >
                          <p
                            className={`mb-1 text-[11px] font-medium ${m.role === "user" ? "text-blue-100" : "text-muted-foreground"}`}
                          >
                            {m.role === "user"
                              ? "Tu · cliente di test"
                              : "Assistente virtuale"}
                          </p>
                          {m.text}
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={bottom} />
                </div>
                {snapshot && !done(snapshot) && (
                  <div className="space-y-3 border-t p-4">
                    <div
                      className="flex flex-wrap gap-2"
                      aria-label="Risposte rapide"
                    >
                      {snapshot.session.suggestions.map((reply) => (
                        <Button
                          key={reply}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-auto max-w-full whitespace-normal text-left"
                          disabled={busy || !!retryTurn}
                          onClick={() => send(reply)}
                        >
                          {snapshot.session.phase === "day" &&
                          /^\d{4}-\d{2}-\d{2}$/.test(reply)
                            ? reply.split("-").reverse().join("/")
                            : reply}
                        </Button>
                      ))}
                    </div>
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void send(text);
                      }}
                    >
                      <Input
                        ref={inputRef}
                        aria-label="La tua risposta"
                        placeholder={
                          snapshot.session.phase === "day"
                            ? "Domani oppure gg/mm/aaaa"
                            : "Scrivi la tua risposta…"
                        }
                        type="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        disabled={busy || !!retryTurn}
                        maxLength={2000}
                      />
                      <Button
                        type="submit"
                        disabled={busy || !text.trim() || !!retryTurn}
                        aria-label="Invia risposta"
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </form>
                  </div>
                )}
                {done(snapshot) && (
                  <div className="eic-motion-enter flex items-center gap-2 border-t bg-emerald-50/50 p-4 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                    {snapshot?.session.phase === "done"
                      ? "Percorso completato. Controlla i record salvati qui sotto."
                      : "Richiesta lasciata all’ufficio. Le azioni non confermate non sono state eseguite."}
                  </div>
                )}
              </section>
            </div>
            {snapshot && (
              <section className="eic-motion-enter eic-motion-panel rounded-2xl border bg-card p-4 sm:p-5">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div
                    className="flex flex-wrap gap-2"
                    aria-label="Dati del collaudo"
                  >
                    {[
                      ["risultati", "Record salvati"],
                      ["attivita", "Attività di Silvio"],
                      ["conversazione", "Conversazione nel ticket"],
                    ].map(([id, label]) => (
                      <Button
                        key={id}
                        variant={view === id ? "secondary" : "ghost"}
                        size="sm"
                        aria-pressed={view === id}
                        onClick={() => setView(id)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={refresh}
                    disabled={busy}
                  >
                    Rileggi dal database
                  </Button>
                </div>
                {view === "attivita" ? (
                  <SilvioAssistanceActivitiesView
                    activities={snapshot.activity ? [snapshot.activity] : []}
                    onRefresh={refresh}
                    canConfigure={false}
                    showRecordLinks={false}
                  />
                ) : view === "conversazione" ? (
                  <div>
                    <h2 className="font-semibold">
                      Conversazione collegata alla segnalazione
                    </h2>
                    {snapshot.ticket ? (
                      <div className="mt-4 space-y-2">
                        {snapshot.ticket.transcript.map((m) => (
                          <p
                            key={m.id}
                            className="rounded-lg bg-muted/30 p-3 text-sm leading-6"
                          >
                            <b>
                              {m.role === "user" ? "Cliente" : "Assistente"}:
                            </b>{" "}
                            {m.text}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Comparirà qui dopo la creazione o l’aggiornamento del
                        ticket.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-3">
                    <article className="rounded-xl border p-4">
                      <h2 className="text-sm font-semibold">Cliente</h2>
                      {snapshot.customer &&
                      snapshot.activity?.identity_verified_at ? (
                        <>
                          <Badge className="mt-3" variant="secondary">
                            Identità verificata
                          </Badge>
                          <p className="mt-3 text-sm font-medium">
                            {snapshot.customer.first_name}{" "}
                            {snapshot.customer.last_name}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {snapshot.customer.address},{" "}
                            {snapshot.customer.city}
                          </p>
                          <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                            Scheda {ref(snapshot.customer.id)}
                          </p>
                        </>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">
                          In attesa di nome e indirizzo coincidenti.
                        </p>
                      )}
                    </article>
                    <article className="rounded-xl border p-4">
                      <h2 className="text-sm font-semibold">Ticket</h2>
                      {snapshot.ticket ? (
                        <>
                          <Badge className="mt-3" variant="secondary">
                            {snapshot.activity?.ticket_action === "updated"
                              ? "Aggiornato"
                              : "Salvato"}{" "}
                            · {ref(snapshot.ticket.id)}
                          </Badge>
                          <p className="mt-3 text-sm">
                            {snapshot.ticket.descrizione}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Indirizzo: {snapshot.ticket.indirizzo_intervento}
                          </p>
                          <p className="mt-2 text-xs text-emerald-800">
                            {snapshot.ticket.customer_id ===
                            snapshot.customer?.id
                              ? "Collegato alla scheda cliente"
                              : "Collegamento da verificare"}
                          </p>
                          {snapshot.ticket.notes.map((note) => (
                            <p
                              key={note.id}
                              className="mt-2 rounded-lg bg-muted/30 p-2 text-xs"
                            >
                              Nota: {note.note}
                            </p>
                          ))}
                        </>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">
                          Nessun ticket salvato prima della conferma.
                        </p>
                      )}
                    </article>
                    <article className="rounded-xl border p-4">
                      <h2 className="text-sm font-semibold">Appuntamento</h2>
                      {snapshot.appointment ? (
                        <>
                          <Badge className="mt-3" variant="secondary">
                            Confermato · {ref(snapshot.appointment.id)}
                          </Badge>
                          <p className="mt-3 text-sm font-medium">
                            {snapshot.appointment.appointment_date
                              .split("-")
                              .reverse()
                              .join("/")}{" "}
                            ·{" "}
                            {snapshot.appointment.appointment_time.slice(0, 5)}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Operatore Locale · agenda di test
                          </p>
                          <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                            {snapshot.appointment.description}
                          </p>
                        </>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">
                          Nessuna prenotazione prima della seconda conferma.
                        </p>
                      )}
                    </article>
                  </div>
                )}
                <details className="mt-5 border-t pt-4">
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    Passaggi verificati e riferimenti della prova
                  </summary>
                  <p className="mt-3 break-all font-mono text-[11px] text-muted-foreground">
                    Sessione locale {snapshot.session.id}
                  </p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {snapshot.steps.map((step) => (
                      <li key={step.ordine}>
                        {
                          ["Verifica cliente", "Segnalazione", "Appuntamento"][
                            step.ordine
                          ]
                        }
                        : {step.stato}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {snapshot.session.tools.length} strumenti eseguiti sul
                    database locale.
                  </p>
                </details>
              </section>
            )}
          </>
        )
      )}
    </main>
  );
}
