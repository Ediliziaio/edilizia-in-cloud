import {
  fishActionConsent,
  fishHasOptoutRequest,
  fishCallbackNumberAllowed,
} from "../../../supabase/functions/_shared/fishActionConsent";
import {
  FISH_DEMO_HANDOFF_SCENARIOS,
  FISH_DEMO_HANDOFF_MS,
  firstFishDemoOperator,
  fishDemoHandoffResult,
  type FishDemoOperator,
  type FishDemoOutcome,
} from "../../../supabase/functions/_shared/fishDemoHandoff";
import { FISH_LEAD_DEMO } from "../../../supabase/functions/_shared/fishScenarioExtras";
import {
  FishHandoffSimulation,
  type HandoffDemoState,
} from "./FishHandoffSimulation";
import { FishVoiceActions, type FishVoiceAction } from "./FishVoiceActions";
import { useEffect, useRef, useState } from "react";
import type { AgentSession, SessionToken } from "@fishaudio/agent-client";
import {
  AudioLines,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Volume2,
} from "lucide-react";
import {
  FISH_SCENARIOS,
  FISH_CUSTOMER_DEMO,
} from "../../../supabase/functions/_shared/fishSimulation";
import { callFishAgent } from "@/lib/fishAgentProxy";
import { Button } from "@/components/ui/button";
import { VoiceActivity } from "@/components/ui/fish-agent-pipeline";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

export type FishVoiceSegment = {
  segmentId: string;
  role: "user" | "agent";
  text: string;
  final: boolean;
};
export type FishVoicePreview = {
  session_token: SessionToken;
  mock_tools: Record<string, unknown>;
  simulation: boolean;
  crm_trial_id?: string;
  local_trial_id?: string;
  transcript_key?: string;
};
export type LocalLeadVoice = {
  day: string;
  open: (scenario: string) => Promise<FishVoicePreview>;
  execute: (
    id: string,
    tool: string,
    parameters: Record<string, unknown>,
    transcript: FishVoiceSegment[],
  ) => Promise<unknown>;
  save: (id: string, transcript: FishVoiceSegment[]) => Promise<unknown>;
};
const modes: Record<string, string> = {
  listening: "Ti ascolto",
  thinking: "Sto preparando la risposta",
  speaking: "L’agente sta parlando",
};
function voiceError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === "mic_permission_denied")
    return "Consenti il microfono al gestionale per parlare, oppure avvia la prova senza microfono.";
  if (code === "mic_not_found")
    return "Nessun microfono trovato. Puoi usare la prova con messaggi scritti e risposta a voce.";
  return code
    ? "Connessione vocale non riuscita. Verifica microfono e rete, poi riprova."
    : error instanceof Error
      ? error.message
      : "Prova vocale non disponibile.";
}
export function FishLiveVoice({
  companyId,
  agentId,
  ready,
  initialScenario = "appointment",
  onConnected,
  crmTrial,
  onTicketCreated,
  onCaseMemory,
  availableScenarios,
  localLead,
}: {
  companyId: string;
  agentId: string;
  ready: boolean;
  initialScenario?: string;
  onConnected?: () => void;
  crmTrial?: string;
  onTicketCreated?: (id: string, action?: "created" | "updated") => void;
  onCaseMemory?: (memory: any) => void;
  availableScenarios?: string[];
  localLead?: LocalLeadVoice;
}) {
  const t = useT();
  const session = useRef<AgentSession | null>(null);
  const generation = useRef(0);
  const [status, setStatus] = useState("ready");
  const [mode, setMode] = useState("listening");
  const [muted, setMuted] = useState(false);
  const [scenario, setScenario] = useState(initialScenario);
  const [segments, setSegments] = useState<FishVoiceSegment[]>([]);
  const [actions, setActions] = useState<FishVoiceAction[]>([]);
  const actionId = useRef(0);
  const transcriptView = useRef<HTMLDivElement>(null);
  const followTranscript = useRef(true);
  useEffect(() => {
    const pane = transcriptView.current;
    if (followTranscript.current && pane) pane.scrollTop = pane.scrollHeight;
  }, [segments]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [handoff, setHandoff] = useState<HandoffDemoState | null>(null);
  const demoPending = useRef<{
    resolve: (result: unknown) => void;
    operator: FishDemoOperator;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const demoAttempted = useRef(false);

  function finishDemo(outcome: FishDemoOutcome, showOutcome = true) {
    const pending = demoPending.current;
    if (!pending) return;
    demoPending.current = null;
    clearTimeout(pending.timer);
    if (showOutcome) {
      setHandoff((old) =>
        old
          ? { phase: outcome, operator: old.operator, reason: old.reason }
          : old,
      );
    }
    pending.resolve(fishDemoHandoffResult(pending.operator, outcome));
  }

  function demoTransfer(parameters: Record<string, unknown>) {
    if (demoAttempted.current) {
      return Promise.resolve({
        simulazione: true,
        trovato: false,
        risposta:
          "Il tentativo dimostrativo è già terminato. Non ripetere il passaggio; continua con il prossimo passo concordato.",
      });
    }
    demoAttempted.current = true;
    const operator = firstFishDemoOperator();
    if (!operator)
      return Promise.resolve(fishDemoHandoffResult(null, "no_answer"));
    setHandoff({
      phase: "ringing",
      deadline: Date.now() + FISH_DEMO_HANDOFF_MS,
      operator: operator.name,
      reason: String(parameters.riassunto || "").slice(0, 1200),
    });
    return new Promise((resolve) => {
      demoPending.current = {
        resolve,
        operator,
        timer: setTimeout(() => finishDemo("no_answer"), FISH_DEMO_HANDOFF_MS),
      };
    });
  }

  function settlePendingActions() {
    setActions((previous) =>
      previous.map((action) =>
        action.phase === "pending"
          ? { ...action, phase: "unconfirmed" }
          : action,
      ),
    );
  }
  const spoken = useRef<FishVoiceSegment[]>([]);
  const transcriptKey = useRef("");
  const localTrialId = useRef("");
  const transcriptRevision = useRef(0);
  const transcriptQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [transcriptError, setTranscriptError] = useState("");
  const [transcriptSaved, setTranscriptSaved] = useState(false);
  function saveTranscript(completed = false) {
    const localId = localTrialId.current;
    const saveLocally = !!localLead && !!localId && completed;
    if (!saveLocally && (!crmTrial || !transcriptKey.current))
      return Promise.resolve();
    const snapshot = spoken.current.map((item) => ({ ...item })),
      key = transcriptKey.current,
      revision = ++transcriptRevision.current;
    const next = transcriptQueue.current
      .catch(() => {})
      .then(() =>
        saveLocally
          ? localLead.save(localId, snapshot)
          : callFishAgent(companyId, agentId, "crm_trial_transcript", {
              trial_id: crmTrial,
              transcript_key: key,
              revision,
              transcript: snapshot,
              completed,
            }),
      );
    transcriptQueue.current = next;
    return next.then(
      () => {
        setTranscriptSaved(true);
        setTranscriptError("");
      },
      (err) => {
        setTranscriptError(
          t("La conversazione non è ancora salvata. Riprova prima di chiudere."),
        );
        throw err;
      },
    );
  }
  useEffect(
    () => () => {
      generation.current++;
      finishDemo("cancelled", false);
      void saveTranscript(true).catch(() => {});
      void session.current?.end();
      session.current = null;
    },
    [],
  );
  const upsert = (value: FishVoiceSegment) => {
    spoken.current = spoken.current.some(
      (item) => item.segmentId === value.segmentId,
    )
      ? spoken.current.map((item) =>
          item.segmentId === value.segmentId ? value : item,
        )
      : [...spoken.current, value];
    setSegments(spoken.current);
  };
  async function start(microphone: boolean) {
    const attempt = ++generation.current;
    finishDemo("cancelled");
    demoAttempted.current = false;
    setHandoff(null);
    setStatus("connecting");
    setError("");
    setSegments([]);
    spoken.current = [];
    transcriptKey.current = "";
    localTrialId.current = "";
    transcriptRevision.current = 0;
    setTranscriptSaved(false);
    setTranscriptError("");
    setActions([]);
    followTranscript.current = true;
    setMode("listening");
    setMuted(!microphone);
    try {
      const { AgentSession } = await import("@fishaudio/agent-client");
      const preview = localLead
        ? await localLead.open(scenario)
        : await callFishAgent<FishVoicePreview>(
            companyId,
            agentId,
            crmTrial ? "crm_trial_session" : "preview_session",
            crmTrial ? { trial_id: crmTrial } : { scenario },
          );
      if (attempt !== generation.current) return;
      transcriptKey.current = preview.transcript_key || "";
      localTrialId.current = preview.local_trial_id || "";
      const stopped = { esito: "cancelled", risposta: "La prova è terminata." };

      async function runTool(
        name: string,
        result: unknown,
        parameters: Record<string, unknown>,
      ) {
        if (
          localLead &&
          preview.local_trial_id &&
          name !== "passa_a_operatore"
        ) {
          return localLead.execute(
            preview.local_trial_id,
            name,
            parameters,
            spoken.current,
          );
        }
        if (preview.crm_trial_id) {
          await saveTranscript();
          if (attempt !== generation.current) return stopped;
          const actual = await callFishAgent<{
            verificato?: boolean;
            tickets?: unknown[];
            creato?: boolean;
            aggiornato?: boolean;
            ticket_id?: string;
          }>(companyId, agentId, "crm_trial_tool", {
            trial_id: preview.crm_trial_id,
            tool: name,
            parameters,
          });
          if (
            name === "memoria_pratica" &&
            actual.verificato &&
            Array.isArray(actual.tickets)
          ) {
            onCaseMemory?.(actual);
          }
          if ((actual.creato || actual.aggiornato) && actual.ticket_id) {
            onTicketCreated?.(
              actual.ticket_id,
              actual.aggiornato ? "updated" : "created",
            );
          }
          return actual;
        }
        if (
          [
            "fissa_appuntamento",
            "richiesta_richiamo",
            "aggiorna_opportunita",
          ].includes(name)
        ) {
          const consent = fishActionConsent(spoken.current, name, parameters);
          if (!consent.ok)
            return { creato: false, aggiornata: false, ...consent };
        }
        if (
          name === "non_richiamare" &&
          !fishHasOptoutRequest(
            spoken.current.filter((m) => m.role === "user" && m.final).at(-1)
              ?.text || "",
          )
        ) {
          return {
            registrato: false,
            risposta:
              "Manca una richiesta esplicita di non essere più chiamato.",
          };
        }
        if (
          name === "richiesta_richiamo" &&
          !fishCallbackNumberAllowed(
            spoken.current,
            "+390000000002",
            String(parameters.recapito || ""),
          )
        ) {
          return {
            creato: false,
            risposta:
              "Questo recapito non è stato dichiarato. Usa quello della sessione o chiedi di dettarlo.",
          };
        }
        if (
          name === "passa_a_operatore" &&
          FISH_DEMO_HANDOFF_SCENARIOS.includes(scenario)
        ) {
          const handoffResult = await demoTransfer(parameters);
          if (localLead && preview.local_trial_id && attempt === generation.current &&
            typeof handoffResult === "object" && handoffResult && "esito" in handoffResult &&
            handoffResult.esito !== "cancelled") {
            await localLead.execute(preview.local_trial_id, name, { esito: handoffResult.esito }, spoken.current);
          }
          return handoffResult;
        }
        return result;
      }

      function recordResult(action: FishVoiceAction) {
        if (attempt === generation.current) {
          setActions((previous) =>
            previous.map((item) => (item.id === action.id ? action : item)),
          );
        }
      }

      const clientTools = Object.fromEntries(
        Object.entries(preview.mock_tools).map(([name, fixture]) => [
          name,
          async (parameters: Record<string, unknown>) => {
            if (attempt !== generation.current) return stopped;
            const id = ++actionId.current;
            setActions((previous) => [
              ...previous,
              { id, name, phase: "pending" },
            ]);
            try {
              const result = await runTool(name, fixture, parameters);
              recordResult({ id, name, phase: "result", result });
              return result;
            } catch (error) {
              recordResult({ id, name, phase: "failed" });
              throw error;
            }
          },
        ]),
      );
      const live = await AgentSession.start({
        sessionToken: preview.session_token,
        microphone,
        wakeLock: false,
        clientTools,
        callbacks: {
          onModeChange: (value) => {
            if (attempt === generation.current) setMode(value);
          },
          onUserTranscript: (value) => {
            if (attempt === generation.current) {
              upsert({ ...value, role: "user" });
              if (value.final) void saveTranscript().catch(() => {});
            }
          },
          onAgentResponseDelta: (value) => {
            if (attempt === generation.current)
              upsert({ ...value, role: "agent", final: false });
          },
          onAgentResponse: (value) => {
            if (attempt === generation.current) {
              upsert({ ...value, role: "agent", final: true });
              void saveTranscript().catch(() => {});
            }
          },
          onDisconnect: () => {
            if (attempt !== generation.current) return;
            generation.current++;
            void saveTranscript(true).catch(() => {});
            finishDemo("cancelled");
            settlePendingActions();
            session.current = null;
            setStatus("ended");
          },
          onError: (value) => {
            if (attempt === generation.current) setError(t(voiceError(value)));
          },
        },
      });
      if (attempt !== generation.current) {
        await live.end();
        return;
      }
      session.current = live;
      spoken.current = live.getTranscript();
      setSegments(spoken.current);
      setStatus("connected");
      onConnected?.();
      try {
        await live.startAudio();
      } catch {
        setError(t("Premi Attiva audio per ascoltare l’agente."));
      }
    } catch (err) {
      if (attempt === generation.current) {
        setError(t(voiceError(err)));
        setStatus("ready");
      }
    }
  }
  async function end() {
    generation.current++;
    finishDemo("cancelled");
    settlePendingActions();
    const live = session.current;
    session.current = null;
    await saveTranscript(true).catch(() => {});
    try {
      await live?.end();
    } catch (error) {
      setError(t(voiceError(error)));
    } finally {
      setStatus("ended");
    }
  }
  async function toggleMic() {
    try {
      await session.current?.setMicMuted(!muted);
      setMuted(!muted);
    } catch (err) {
      setError(t(voiceError(err)));
    }
  }
  function send() {
    if (!text.trim() || !session.current) return;
    session.current.sendUserMessage(text.trim(), { audio: true });
    setText("");
  }
  const live = status === "connected";
  return (
    <section
      className="min-w-0 space-y-2.5"
      aria-label={t("Conversazione vocale con l’agente")}
    >
      <div className="flex min-w-0 items-center gap-2.5 rounded-lg border bg-muted/20 p-2.5">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-100 via-blue-100 to-blue-200 dark:from-sky-950 dark:via-blue-950 dark:to-blue-900`}
        >
          {live && mode === "speaking" ? (
            <VoiceActivity />
          ) : (
            <AudioLines className="size-5 text-sky-700 dark:text-blue-300" />
          )}
        </div>
        <div>
          <p className="font-semibold" role="status">
            {status === "connecting"
              ? t("Preparo la prova vocale…")
              : live
                ? (modes[mode] ? t(modes[mode]) : t("Connesso"))
                : status === "ended"
                  ? t("Prova terminata")
                  : t("Il tuo agente è pronto")}
          </p>
          <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
            {t("Fish Audio · fino a 5 min · {dati}", { dati: crmTrial ? t("Cliente del gestionale") : t("Dati dimostrativi") })}
          </p>
        </div>
      </div>
      {crmTrial && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs leading-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          {t("Verifica nome e indirizzo, poi conferma il riepilogo per creare o aggiornare il ticket di prova.")}
        </p>
      )}
      {!crmTrial &&
        [
          "customer_support",
          "natural_service",
          "unknown_customer",
          "returning_customer",
        ].includes(scenario) && (
          <div className="rounded-lg border bg-muted/20 p-2.5 text-xs leading-5">
            <p className="font-medium">{t("Cliente fittizio · {name}", { name: String(FISH_CUSTOMER_DEMO.name ?? "") })}</p>
            <p>
              {scenario === "returning_customer"
                ? t("Richiama per il ticket {ticket}: la maniglia della finestra è ancora dura. Chiedi di aggiornare la segnalazione esistente, poi conferma il riepilogo.", { ticket: String(FISH_CUSTOMER_DEMO.ticket ?? "") })
                : scenario !== "unknown_customer"
                  ? t("Numero associato a una sola scheda di prova. Chiedi lo stato dell’ordine, poi segnala la finestra che non si chiude.")
                  : t("Numero non riconosciuto o condiviso: il nome non basta per consultare gli ordini.")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t("Indirizzo da dichiarare: {address} · Ordine {order}. Nessun dato cliente reale.", { address: String(FISH_CUSTOMER_DEMO.address ?? ""), order: String(FISH_CUSTOMER_DEMO.order ?? "") })}</p>
          </div>
        )}
      {!crmTrial && FISH_DEMO_HANDOFF_SCENARIOS.includes(scenario) && (
        <FishHandoffSimulation state={handoff} onOutcome={finishDemo} />
      )}
      {!crmTrial && scenario.startsWith("lead_") && (
        <div className="rounded-lg border bg-muted/20 p-2.5 text-xs leading-5">
          <p className="font-medium">{t("Lead fittizio · {name}", { name: String(FISH_LEAD_DEMO.name ?? "") })}</p>
          <p>
            {scenario === "lead_appointment"
              ? localLead
                ? t("Chiedi un sopralluogo per il {valore}. Scegli un orario proposto e conferma il riepilogo.", { valore: String(new Intl.DateTimeFormat(intlCampo()).format(new Date(localLead.day + "T12:00:00")) ?? "") })
                : t("Chiedi un sopralluogo il 18 novembre 2026 alle 10:00. Aspetta il riepilogo prima di confermare.")
              : scenario === "lead_handoff"
                ? t("Chiedi di parlare con un consulente per le finestre. Per provare il ritorno all’AI, lascia passare lo squillo.")
                : scenario === "lead_declined"
                  ? t("Spiega che non sei interessato e osserva come l’agente chiude la conversazione.")
                  : t("Rispondi come lead di prova, seguendo lo scenario scelto.")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("Immobile fittizio: {quantity} finestre, {address}. Recapito dimostrativo {phone}.", { quantity: String(FISH_LEAD_DEMO.quantity ?? ""), address: String(FISH_LEAD_DEMO.address ?? ""), phone: String(FISH_LEAD_DEMO.phone ?? "") })}</p>
        </div>
      )}
      {!live && status !== "connecting" && (
        <>
          {!crmTrial && (
            <Select value={scenario} onValueChange={setScenario}>
              <SelectTrigger aria-label={t("Scenario della prova vocale")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FISH_SCENARIOS.filter(
                  (item) =>
                    item.id !== "handoff" &&
                    (!availableScenarios ||
                      availableScenarios.includes(item.id)),
                ).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={!ready} onClick={() => start(true)}>
              <Mic className="mr-2 h-4 w-4" />
              {t("Avvia con microfono")}
            </Button>
            <Button
              disabled={!ready}
              variant="outline"
              onClick={() => start(false)}
            >
              <Volume2 className="mr-2 h-4 w-4" />
              {t("Ascolta senza microfono")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("La prova usa credito Fish. Con il microfono invii il parlato a Fish. La registrazione delle chiamate è disabilitata.")}
          </p>
        </>
      )}
      {status === "connecting" && (
        <div className="flex items-center gap-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t("Al primo avvio preparo anche gli strumenti di prova.")}</span>
          <Button size="sm" variant="ghost" onClick={end}>
            {t("Annulla")}
          </Button>
        </div>
      )}
      {live && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={toggleMic}>
            {muted ? (
              <MicOff className="mr-2 h-4 w-4" />
            ) : (
              <Mic className="mr-2 h-4 w-4" />
            )}
            {muted ? t("Attiva microfono") : t("Silenzia microfono")}
          </Button>
          <Button
            variant="outline"
            onClick={() => session.current?.startAudio()}
          >
            <Volume2 className="mr-2 h-4 w-4" />
            {t("Attiva audio")}
          </Button>
          <Button variant="destructive" onClick={end}>
            <PhoneOff className="mr-2 h-4 w-4" />
            {t("Termina")}
          </Button>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {(crmTrial || localLead) &&
        (transcriptError ? (
          <div
            role="alert"
            className="rounded-xl border border-amber-200 p-3 text-sm"
          >
            <p>{transcriptError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void saveTranscript(!live).catch(() => {})}
            >
              {t("Riprova salvataggio conversazione")}
            </Button>
          </div>
        ) : transcriptSaved ? (
          <p role="status" className="text-xs text-muted-foreground">
            {localLead
              ? t("Conversazione salvata nei dati del collaudo.")
              : t("Conversazione salvata. Quando apri la segnalazione la trovi anche nel ticket.")}
          </p>
        ) : null)}
      {(segments.length > 0 || live) && (
        <div
          ref={transcriptView}
          onScroll={(event) => {
            const pane = event.currentTarget;
            followTranscript.current =
              pane.scrollHeight - pane.scrollTop - pane.clientHeight < 40;
          }}
          className="max-h-[min(32dvh,18rem)] space-y-2 overflow-y-auto rounded-lg border bg-muted/20 p-2.5"
          aria-label={t("Trascrizione della prova vocale")}
        >
          {segments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("In attesa del saluto dell’agente…")}
            </p>
          ) : (
            segments.map((item) => (
              <div
                key={item.segmentId}
                className={`max-w-[94%] break-words rounded-lg border px-2.5 py-2 text-sm leading-5 ${item.role === "user" ? "ml-auto border-sky-100 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/30" : "bg-background"}`}
              >
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {item.role === "user" ? t("Tu") : t("Agente")}
                </p>
                <p>{item.text}</p>
              </div>
            ))
          )}
        </div>
      )}
      <FishVoiceActions actions={actions} crmTrial={!!(crmTrial || localLead)} />
      {live && (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <Input
            aria-label={t("Messaggio all’agente vocale")}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("Scrivi: vorrei prenotare un sopralluogo")}
            maxLength={2000}
          />
          <Button
            type="submit"
            disabled={!text.trim()}
            aria-label={t("Invia e ascolta")}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      )}
    </section>
  );
}
