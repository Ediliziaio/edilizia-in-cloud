import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  AudioLines,
  Bot,
  Check,
  Clock3,
  Headphones,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AgentPipeline,
  VoiceActivity,
  type PipelineStep,
} from "@/components/ui/fish-agent-pipeline";
import { LocalSipPilotSetup } from "@/components/telephony/LocalSipPilotSetup";
import {
  createLocalAssistanceClient,
  type LocalLabBootstrap,
  type LocalPhoneAction,
  type LocalPhoneSettings,
  type LocalPhoneTrial,
} from "@/lib/localAssistanceClient";

const phaseCopy: Record<LocalPhoneTrial["phase"], [string, string]> = {
  office_ringing: [
    "Sta squillando l’ufficio",
    "Rispondi come operatore oppure lascia scadere l’attesa.",
  ],
  office_answered: [
    "Ha risposto l’ufficio",
    "L’operatore gestisce la chiamata. La prova finisce qui.",
  ],
  ai: [
    "Ha risposto l’assistente",
    "L’AI riceve il numero del cliente e chiede il permesso di richiamare.",
  ],
  consented: [
    "Richiamo concordato",
    "Chiudi la chiamata in corso per proseguire.",
  ],
  declined: [
    "Chiamata chiusa",
    "Il cliente ha scelto di non essere richiamato.",
  ],
  callback_ringing: [
    "Squilla il telefono del cliente",
    "Controlla quale numero compare sul display.",
  ],
  callback_blocked: [
    "Richiamo da gestire in ufficio",
    "Per chiamare dallo stesso numero serve l’uscita SIP.",
  ],
  callback_answered: [
    "Il cliente ha risposto",
    "L’AI riprende la conversazione dal richiamo.",
  ],
  callback_unanswered: [
    "Richiamo senza risposta",
    "L’esito è visibile nella cronologia della prova.",
  ],
};

function callSteps(
  phase: LocalPhoneTrial["phase"] | undefined,
  wait: number,
): PipelineStep[] {
  const ongoingAI = phase === "ai" || phase === "consented";
  const viaAI =
    phase && phase !== "office_ringing" && phase !== "office_answered";
  const needOffice = phase === "callback_blocked";
  const noAnswer = phase === "callback_unanswered";
  return [
    {
      id: "inbound",
      label: "Chiamata in entrata",
      detail: phase ? "Ricevuta" : "In attesa",
      icon: PhoneIncoming,
      state: phase ? "done" : "waiting",
    },
    {
      id: "office",
      label: "Ufficio",
      detail:
        phase === "office_ringing"
          ? "Sta squillando"
          : phase === "office_answered"
            ? "Ha risposto"
            : viaAI
              ? "Nessuna risposta"
              : `Squilla per ${wait} s`,
      icon: UsersRound,
      state:
        phase === "office_ringing"
          ? "active"
          : viaAI
            ? "attention"
            : phase === "office_answered"
              ? "done"
              : "waiting",
    },
    {
      id: "ai",
      label: "Giulia · AI",
      detail:
        phase === "ai"
          ? "Chiede il consenso"
          : phase === "consented"
            ? "Richiamo concordato"
            : phase === "office_answered"
              ? "Gestita dall’ufficio"
              : viaAI
                ? "Ha risposto"
                : "Se l’ufficio non risponde",
      icon: Bot,
      state: ongoingAI
        ? "active"
        : viaAI
          ? "done"
          : phase === "office_answered"
            ? "skipped"
            : "waiting",
    },
    {
      id: "callback",
      label: "Richiamo",
      detail: needOffice
        ? "Da gestire in ufficio"
        : noAnswer
          ? "Cliente non raggiunto"
          : phase === "callback_ringing"
            ? "Squilla il cliente"
            : phase === "callback_answered"
              ? "Cliente in linea"
              : phase === "declined"
                ? "Rifiutato dal cliente"
                : phase === "office_answered"
                  ? "Non necessario"
                  : "Dopo il consenso",
      icon: PhoneOutgoing,
      state:
        phase === "callback_ringing"
          ? "active"
          : phase === "callback_answered"
            ? "done"
            : needOffice || noAnswer
              ? "attention"
              : phase === "declined" || phase === "office_answered"
                ? "skipped"
                : "waiting",
    },
  ];
}

export default function LocalPhoneTrialPage({
  standalone = false,
}: {
  standalone?: boolean;
}) {
  const [client] = useState(createLocalAssistanceClient);
  const [bootstrap, setBootstrap] = useState<LocalLabBootstrap>();
  const [settings, setSettings] = useState<LocalPhoneSettings>();
  const [view, setView] = useState<{
    trial: LocalPhoneTrial;
    clientDeadline: number;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [audioSrc, setAudioSrc] = useState<string>();
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioError, setAudioError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const audioRequest = useRef<AbortController | null>(null);
  const setup = bootstrap?.phoneSetup;
  const selected = settings ?? setup?.defaultSettings;
  const trial = view?.trial;
  const phase = trial?.phase;
  const clientDeadline = view?.clientDeadline;
  const id = trial?.id;
  const version = trial?.version;
  const ringingMs =
    trial && phase === "office_ringing"
      ? Math.max(0, trial.deadline - trial.now)
      : 0;

  function applyTrial(next: LocalPhoneTrial) {
    const remaining = Math.max(0, next.deadline - next.now);
    setView((previous) => {
      if (
        previous?.trial.id === next.id &&
        previous.trial.version >= next.version
      )
        return previous;
      return { trial: next, clientDeadline: Date.now() + remaining };
    });
    setSeconds(Math.ceil(remaining / 1000));
  }

  useEffect(() => {
    let current = true;
    client
      .bootstrap()
      .then((data) => {
        if (!current) return;
        if (!data.phoneSetup)
          setError(
            "Riavvia il backend locale per caricare il collaudo telefonico.",
          );
        else setBootstrap(data);
      })
      .catch(() => {
        if (current)
          setError(
            "Il backend locale non risponde. Avvialo e ricarica questa pagina.",
          );
      });
    return () => {
      current = false;
    };
  }, [client]);

  useEffect(() => {
    if (!id || phase !== "office_ringing" || clientDeadline === undefined)
      return;
    let current = true;
    const tick = window.setInterval(() => {
      setSeconds(Math.max(0, Math.ceil((clientDeadline - Date.now()) / 1000)));
    }, 200);
    const timeout = window.setTimeout(
      () => {
        client
          .phoneTrial(id)
          .then(({ trial: next }) => {
            if (current) applyTrial(next);
          })
          .catch(() => {
            if (current)
              setError("Non riesco a leggere l’esito. Premi Aggiorna esito.");
          });
      },
      Math.max(0, clientDeadline - Date.now()) + 40,
    );
    return () => {
      current = false;
      window.clearInterval(tick);
      window.clearTimeout(timeout);
    };
  }, [client, id, phase, clientDeadline]);

  useEffect(
    () => () => {
      audioRequest.current?.abort();
    },
    [id, version],
  );
  useEffect(
    () => () => {
      if (audioSrc) URL.revokeObjectURL(audioSrc);
    },
    [audioSrc],
  );

  function clearAudio() {
    audioRequest.current?.abort();
    setAudioSrc(undefined);
    setAudioBusy(false);
    setAudioPlaying(false);
    setAudioError("");
  }

  async function start() {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      applyTrial(
        (
          await client.startPhoneTrial({
            ...selected,
            requestId: requestId.current,
          })
        ).trial,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Avvio non riuscito.");
    } finally {
      setBusy(false);
    }
  }

  async function move(action?: LocalPhoneAction) {
    if (!trial || busy) return;
    setBusy(true);
    setError("");
    clearAudio();
    try {
      const result = action
        ? await client.advancePhoneTrial(trial.id, trial.version, action)
        : await client.phoneTrial(trial.id);
      applyTrial(result.trial);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operazione non riuscita.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    clearAudio();
    requestId.current = crypto.randomUUID();
    setView(undefined);
    setError("");
  }

  async function listen() {
    if (!trial?.prompt || audioBusy) return;
    const controller = new AbortController();
    audioRequest.current?.abort();
    audioRequest.current = controller;
    setAudioBusy(true);
    setAudioError("");
    try {
      const blob = await client.phoneSpeech(
        trial.id,
        trial.version,
        controller.signal,
      );
      if (!controller.signal.aborted) setAudioSrc(URL.createObjectURL(blob));
    } catch (e) {
      if (!controller.signal.aborted)
        setAudioError(
          e instanceof Error ? e.message : "Audio non disponibile.",
        );
    } finally {
      if (!controller.signal.aborted) setAudioBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="eic-motion-enter flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
            Centralino · Collaudo locale
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Prova il tuo numero aziendale
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Simula l’arrivo di una chiamata, il passaggio all’AI e il richiamo
            dallo stesso numero.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <a href="#configurazione-sip">Prepara SIP</a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a
              href={
                standalone ? "./assistance-local.html" : "/azienda/centralino"
              }
            >
              {standalone ? "Collaudo assistenza" : "Torna al centralino"}
            </a>
          </Button>
        </div>
      </header>

      <AgentPipeline
        title="Percorso della chiamata"
        steps={callSteps(phase, selected?.officeSeconds ?? 15)}
      />

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
        >
          {error}
          {trial && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void move()}
            >
              Aggiorna esito
            </Button>
          )}
        </div>
      )}

      {setup && selected ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)]">
          <section
            className="eic-motion-panel space-y-5 rounded-2xl border bg-card p-5"
            aria-labelledby="phone-settings-title"
          >
            <h2 id="phone-settings-title" className="font-semibold">
              Impostazioni della linea di test
            </h2>
            <dl className="space-y-3 rounded-xl bg-muted/50 p-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Numero aziendale</dt>
                <dd className="mt-1 font-mono text-base font-semibold">
                  {setup.companyNumber}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Cliente che chiama</dt>
                <dd className="mt-1 font-mono">{setup.callerNumber}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Prima destinazione</dt>
                <dd className="mt-1 font-medium">{setup.officeGroup}</dd>
              </div>
            </dl>
            <fieldset disabled={!!trial || busy} className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="office-wait"
                  className="block text-sm font-medium"
                >
                  Quanto squilla l’ufficio
                </label>
                <select
                  id="office-wait"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={selected.officeSeconds}
                  onChange={(event) => {
                    requestId.current = crypto.randomUUID();
                    setSettings({
                      ...selected,
                      officeSeconds: Number(event.target.value),
                    });
                  }}
                >
                  {setup.durations.map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {seconds} secondi
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-blue-700"
                  checked={selected.outboundEnabled}
                  onChange={(event) => {
                    requestId.current = crypto.randomUUID();
                    setSettings({
                      ...selected,
                      outboundEnabled: event.target.checked,
                    });
                  }}
                />
                <span>
                  <span className="block font-medium">
                    Uscita SIP abilitata
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    Permette all’AI di richiamare mostrando il numero aziendale.
                  </span>
                </span>
              </label>
            </fieldset>
            {!trial ? (
              <Button
                type="button"
                className="w-full"
                disabled={busy}
                onClick={() => void start()}
              >
                <Phone className="mr-2 size-4" />
                {busy ? "Avvio in corso…" : "Simula chiamata in entrata"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={reset}
              >
                Nuova prova
              </Button>
            )}
            <p className="text-xs leading-5 text-muted-foreground">
              I numeri sono fittizi. Gli squilli e gli esiti sono simulati nel
              browser.
            </p>
          </section>

          <div className="space-y-5">
            <section
              className="eic-motion-panel overflow-hidden rounded-2xl border bg-card"
              aria-label="Chiamata di test"
            >
              <div className="eic-call-display p-5 text-white sm:p-6">
                <div className="flex items-start gap-4">
                  <span
                    key={phase ?? "idle"}
                    className={`rounded-xl bg-white/10 p-3 text-blue-200 ${phase === "office_ringing" || phase === "callback_ringing" ? "eic-motion-pulse" : ""}`}
                  >
                    {trial?.callback ? (
                      <PhoneOutgoing className="size-5" />
                    ) : phase === "ai" || phase === "consented" ? (
                      <Bot className="size-5" />
                    ) : (
                      <PhoneIncoming className="size-5" />
                    )}
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold" aria-live="polite">
                      <span
                        key={phase ?? "idle"}
                        className="eic-motion-enter inline-block"
                      >
                        {phase
                          ? phaseCopy[phase][0]
                          : "Pronto a ricevere la chiamata"}
                      </span>
                    </h2>
                    <p className="mt-1 text-sm text-slate-300">
                      {phase
                        ? phaseCopy[phase][1]
                        : "L’ufficio risponde per primo. L’assistente interviene dopo l’attesa impostata."}
                    </p>
                  </div>
                </div>
                {phase === "office_ringing" && trial && (
                  <div className="mt-4 space-y-2">
                    <p
                      className={`flex items-center gap-2 text-sm tabular-nums ${seconds <= 4 ? "text-orange-200" : "text-blue-200"}`}
                    >
                      <Clock3 className="size-4" /> Tempo residuo {seconds} s
                    </p>
                    <div
                      aria-hidden="true"
                      className="h-1.5 overflow-hidden rounded-full bg-white/15"
                    >
                      <div
                        className="eic-timer-fill h-full rounded-full"
                        data-ending={seconds <= 4}
                        style={
                          {
                            "--eic-timer-value":
                              seconds / trial.settings.officeSeconds,
                            "--eic-timer-start": Math.min(
                              1,
                              ringingMs / (trial.settings.officeSeconds * 1000),
                            ),
                            "--eic-timer-duration": `${ringingMs}ms`,
                          } as CSSProperties
                        }
                      />
                    </div>
                  </div>
                )}
                {trial?.callback && (
                  <div className="eic-motion-enter mt-5 space-y-3 rounded-xl bg-white/10 p-4">
                    <dl className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-slate-300">
                          Numero sul display del cliente
                        </dt>
                        <dd className="mt-1 font-mono text-lg font-semibold">
                          {trial.callback.from}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-300">
                          Cliente richiamato
                        </dt>
                        <dd className="mt-1 font-mono text-lg">
                          {trial.callback.to}
                        </dd>
                      </div>
                    </dl>
                    {trial.callback.from === trial.inbound.to && (
                      <p className="flex items-center gap-2 text-xs text-emerald-200">
                        <Check className="size-4" /> Coincide con il numero
                        chiamato in entrata
                      </p>
                    )}
                  </div>
                )}
              </div>
              {trial && (
                <div className="space-y-4 p-5">
                  {trial.prompt && (
                    <div
                      key={phase}
                      className="eic-motion-enter space-y-3 rounded-xl border bg-muted/40 p-4 text-sm leading-6"
                    >
                      <p className="flex items-center gap-2 font-semibold">
                        {audioPlaying ? (
                          <VoiceActivity />
                        ) : (
                          <Headphones className="size-4" />
                        )}{" "}
                        Giulia · assistente virtuale
                      </p>
                      <p>{trial.prompt}</p>
                      {bootstrap?.voice?.configured && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={audioBusy || busy}
                          onClick={() => void listen()}
                        >
                          <AudioLines className="mr-2 size-4" />
                          {audioBusy
                            ? "Generazione audio…"
                            : "Ascolta con Drama 3"}
                        </Button>
                      )}
                      {audioSrc && (
                        <audio
                          className="eic-motion-enter w-full"
                          controls
                          autoPlay
                          src={audioSrc}
                          onPlaying={() => setAudioPlaying(true)}
                          onPause={() => setAudioPlaying(false)}
                          onEnded={() => setAudioPlaying(false)}
                          aria-label="Risposta di Giulia"
                        />
                      )}
                      {audioError && (
                        <p
                          role="alert"
                          className="text-amber-700 dark:text-amber-300"
                        >
                          {audioError}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {phase === "office_ringing" && (
                      <>
                        <Button
                          disabled={busy}
                          onClick={() => void move("office_answer")}
                        >
                          Rispondi dall’ufficio
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => void move("skip_wait")}
                        >
                          Simula mancata risposta
                        </Button>
                      </>
                    )}
                    {phase === "ai" && (
                      <>
                        <Button
                          disabled={busy}
                          onClick={() => void move("accept_callback")}
                        >
                          Sì, richiamami
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => void move("decline_callback")}
                        >
                          No, grazie
                        </Button>
                      </>
                    )}
                    {phase === "consented" && (
                      <Button
                        disabled={busy}
                        onClick={() => void move("hang_up")}
                      >
                        {trial.settings.outboundEnabled
                          ? "Chiudi e avvia il richiamo"
                          : "Chiudi e lascia la richiesta"}
                      </Button>
                    )}
                    {phase === "callback_ringing" && (
                      <>
                        <Button
                          disabled={busy}
                          onClick={() => void move("answer_callback")}
                        >
                          Rispondi al richiamo
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => void move("miss_callback")}
                        >
                          Non rispondere
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </section>
            {trial && (
              <section
                className="eic-motion-panel rounded-2xl border bg-card p-5"
                aria-labelledby="phone-timeline-title"
              >
                <h2 id="phone-timeline-title" className="font-semibold">
                  Cronologia della prova
                </h2>
                <ol className="mt-3 divide-y text-sm">
                  {trial.events.map((event) => (
                    <li
                      key={event.version}
                      className={`flex items-start gap-3 py-2.5 ${trial.version === event.version ? "eic-event-new" : ""}`}
                    >
                      <time className="min-w-[3rem] font-mono text-xs leading-5 text-muted-foreground">
                        +{Math.floor((event.at - trial.events[0].at) / 1000)} s
                      </time>
                      <span>{event.label}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        </div>
      ) : (
        !error && (
          <p role="status" className="text-sm text-muted-foreground">
            Preparazione del collaudo…
          </p>
        )
      )}
      <LocalSipPilotSetup />
    </main>
  );
}
