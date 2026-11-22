import { useFishAssistanceCapabilities } from "@/lib/fishAssistanceCapabilities";
import { FishAssistanceSetup } from "./FishAssistanceSetup";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Loader2,
  Phone,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useCreateUnifiedAgent } from "@/hooks/useUnifiedAgents";
import { callFishAgent } from "@/lib/fishAgentProxy";
import { FISH_FLOW_PRESETS } from "@/lib/fishFlows";
import {
  FISH_DEFAULT_VOICE,
  fishDefaultGreeting,
  fishOnboardingInput,
  fishScenarioForFlow,
  fishUsesAvailableOperators,
  onboardingPhone,
  type FishOnboardingValues,
} from "@/lib/fishOnboarding";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FISH_PUBLIC_VOICES } from "../../../supabase/functions/_shared/fishVoiceCatalog";
import { FishFlowPicker } from "./FishFlowPicker";
import "@/components/ui/fish-agent-pipeline.css";
import { FishLiveVoice } from "./FishLiveVoice";
import { FishNumberConnectionRequest } from "./FishNumberConnectionRequest";

const STEPS = ["Attività", "Agenda", "Voce", "Prova", "Numero"];
export function FishOnboardingWizard({
  open,
  onClose,
  onSuccess,
  onChangeType,
  existingAgent,
  initialFlowId,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (id: string) => void;
  onChangeType?: () => void;
  existingAgent?: any;
  initialFlowId?: string;
}) {
  const companyId = useEffectiveCompanyId();
  const auth = useAuth();
  const { isAdmin } = usePermissions();
  const canManage =
    isAdmin || (auth.role === "super_admin" && !auth.viewAsRole);
  const companyName = auth.effectiveCompany?.name;
  const initialFlow =
    existingAgent?.tools_config?.fish?.flow_id || initialFlowId || "complete";
  const cache = useQueryClient();
  const draftId = useRef(crypto.randomUUID());
  const [step, setStep] = useState(existingAgent ? 3 : 0);
  const [agentId, setAgentId] = useState<string | null>(
    existingAgent?.id || null,
  );
  const [tested, setTested] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState<FishOnboardingValues>(() => ({
    name: existingAgent?.nome || "Assistente telefonico",
    flowId: initialFlow,
    calendarId: existingAgent?.tools_config?.fish?.calendar_id || "",
    operatorNumber: existingAgent?.tools_config?.trasferimento?.numero || "",
    greeting:
      existingAgent?.primo_messaggio ||
      fishDefaultGreeting(initialFlow, companyName),
    voiceId: existingAgent?.tools_config?.fish?.voice_id || FISH_DEFAULT_VOICE,
    expressive: existingAgent?.tools_config?.fish?.voice?.expressive ?? true,
  }));
  const update = (patch: Partial<FishOnboardingValues>) =>
    setValues((old) => ({ ...old, ...patch }));
  const flow =
    FISH_FLOW_PRESETS.find((item) => item.id === values.flowId) ||
    FISH_FLOW_PRESETS[0];
  const assistance = useFishAssistanceCapabilities(
    companyId,
    values.flowId === "support_appointment",
  );
  const assistanceReady =
    assistance.data?.ready === true && assistance.data.version >= 1;
  const needsCalendar = flow.tools.includes("create_appointment");
  const availableOperators = fishUsesAvailableOperators(values.flowId);
  const create = useCreateUnifiedAgent();
  const calendars = useQuery({
    queryKey: ["fish-agent-calendars", companyId],
    enabled: !!companyId && canManage,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_calendars")
        .select("id,name,duration_minutes")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });
  const statusKey = ["fish-agent", companyId, agentId];
  const status = useQuery({
    queryKey: statusKey,
    enabled: !!agentId && !!companyId,
    retry: false,
    queryFn: () =>
      callFishAgent<{
        binding: { fish_agent_id: string | null; voice_id?: string } | null;
        keyConfigured: boolean;
        synchronized: boolean;
      }>(companyId!, agentId!, "status"),
  });
  const prepare = useMutation({
    mutationFn: () =>
      callFishAgent(companyId!, agentId!, "configure", {
        voice_id:
          status.data?.binding?.voice_id ||
          values.voiceId ||
          FISH_DEFAULT_VOICE,
      }),
    onSuccess: () => cache.invalidateQueries({ queryKey: statusKey }),
  });
  const ready =
    !!status.data?.keyConfigured &&
    !!status.data.synchronized &&
    !!status.data.binding?.fish_agent_id;
  const busy = create.isPending;
  const close = () => {
    if (busy) return;
    if (agentId) onSuccess(agentId);
    else onClose();
  };
  async function next() {
    setError("");
    if (step === 0 && !values.name.trim()) {
      setError("Dai un nome all’assistente per continuare.");
      return;
    }
    if (
      step === 1 &&
      !availableOperators &&
      values.operatorNumber.trim() &&
      !/^\+[1-9]\d{7,14}$/.test(onboardingPhone(values.operatorNumber))
    ) {
      setError(
        "Per l’operatore inserisci un numero con prefisso internazionale, per esempio +39.",
      );
      return;
    }
    if (
      step === 1 &&
      values.flowId === "support_appointment" &&
      (!values.calendarId ||
        !calendars.data?.some((c) => c.id === values.calendarId))
    ) {
      setError(
        "Scegli un calendario attivo per completare il flusso di assistenza.",
      );
      return;
    }
    if (
      step === 2 &&
      values.flowId === "support_appointment" &&
      !assistanceReady
    ) {
      setError(
        "Il collegamento a Silvio è in preparazione. La configurazione è qui: completa il collegamento prima di creare il flusso completo.",
      );
      return;
    }
    if (step === 2) {
      try {
        const input = fishOnboardingInput({
          ...values,
          greeting:
            values.greeting.trim() ||
            fishDefaultGreeting(values.flowId, companyName),
        });
        const created = await create.mutateAsync({
          ...input,
          client_id: draftId.current,
        });
        setAgentId(created.id);
        setStep(3);
      } catch {
        setError(
          "Non sono riuscito a salvare l’assistente. I dati sono qui: riprova senza ricominciare.",
        );
      }
    } else setStep((value) => Math.min(4, value + 1));
  }
  const selectedVoice = FISH_PUBLIC_VOICES.find(
    ({ id }) => id === (status.data?.binding?.voice_id || values.voiceId),
  );
  const calendarName = calendars.data?.find(
    ({ id }) => id === values.calendarId,
  )?.name;
  const agendaLabel = !needsCalendar
    ? "Non richiesta"
    : calendarName ||
      (values.calendarId && calendars.isPending
        ? "Caricamento…"
        : "Da scegliere");
  const operatorLabel = availableOperators
    ? "Primo operatore disponibile"
    : values.operatorNumber || "Richiesta di richiamo";
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) close();
      }}
    >
      <DialogContent
        className="flex max-h-[94dvh] flex-col gap-0 overflow-hidden p-0 motion-reduce:!animate-none sm:max-w-[52rem]"
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader className="shrink-0 border-b py-2.5 pl-3 pr-12 sm:pl-4">
          <DialogTitle className="flex items-center gap-2 text-base leading-tight">
            <span className="shrink-0 rounded-md bg-sky-50 p-1.5 text-sky-700 dark:bg-sky-950 dark:text-sky-200">
              <Bot className="size-4" />
            </span>
            {agentId
              ? "Completa il tuo assistente"
              : "Crea il tuo assistente telefonico"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Scegli cosa farà l’assistente e provalo a voce prima di collegare il
            numero.
          </DialogDescription>
        </DialogHeader>
        <ol
          className="grid shrink-0 grid-cols-5 gap-1 border-b bg-muted/20 px-2 py-1.5 sm:px-4"
          aria-label="Passaggi della configurazione"
        >
          {STEPS.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                aria-current={step === index ? "step" : undefined}
                disabled={index >= step || !!agentId || busy}
                onClick={() => {
                  setError("");
                  setStep(index);
                }}
                className={`flex min-h-9 w-full flex-col items-center justify-center gap-1 rounded-md text-[11px] enabled:hover:bg-sky-50 dark:enabled:hover:bg-sky-950 sm:min-h-7 sm:flex-row sm:gap-1.5 sm:text-xs ${step === index ? "font-semibold text-sky-800 dark:text-sky-200" : "text-muted-foreground"}`}
              >
                <span
                  className={`flex size-5 items-center justify-center rounded-full ${step === index ? "bg-sky-700 text-white" : index < step ? "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-200" : "border bg-background"}`}
                >
                  {index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ol>
        <div className="min-h-0 flex-1 overflow-y-auto" key={step}>
          <div className="grid items-start gap-3 p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_12.75rem]">
            <div className="eic-motion-enter min-w-0 space-y-3">
              {!canManage && (
                <p role="alert" className="rounded-lg border p-3 text-sm">
                  La creazione e il collegamento degli assistenti sono riservati
                  all’amministratore dell’azienda.
                </p>
              )}
              {step === 0 && (
                <>
                  <h2 className="text-base font-semibold">
                    Che cosa deve fare?
                  </h2>
                  <div>
                    <Label htmlFor="onboarding-agent-name">
                      Nome dell’assistente
                    </Label>
                    <Input
                      id="onboarding-agent-name"
                      value={values.name}
                      onChange={(e) => update({ name: e.target.value })}
                      maxLength={100}
                    />
                  </div>
                  <FishFlowPicker
                    value={values.flowId}
                    onChange={(flowId) =>
                      setValues((previous) => ({
                        ...previous,
                        flowId,
                        greeting:
                          !previous.greeting.trim() ||
                          previous.greeting ===
                            fishDefaultGreeting(previous.flowId, companyName)
                            ? fishDefaultGreeting(flowId, companyName)
                            : previous.greeting,
                      }))
                    }
                    disabled={!canManage}
                  />
                </>
              )}
              {step === 1 && (
                <>
                  <div>
                    <h2 className="text-base font-semibold">
                      Agenda e persone
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Collega le risorse che l’assistente può usare.
                    </p>
                  </div>
                  {values.flowId === "support_appointment" ? (
                    <FishAssistanceSetup
                      calendarId={values.calendarId}
                      calendars={calendars.data || []}
                      loading={calendars.isPending}
                      error={calendars.isError}
                      onCalendarChange={(calendarId) => update({ calendarId })}
                      onRetry={() => calendars.refetch()}
                    />
                  ) : needsCalendar ? (
                    <div className="rounded-lg border p-3">
                      <Label>Calendario per gli appuntamenti</Label>
                      {calendars.isError ? (
                        <div role="alert" className="mt-3 text-sm">
                          Non riesco a leggere i calendari.
                          <Button
                            variant="ghost"
                            onClick={() => calendars.refetch()}
                          >
                            Riprova
                          </Button>
                        </div>
                      ) : (
                        <Select
                          value={values.calendarId || "later"}
                          onValueChange={(value) =>
                            update({
                              calendarId: value === "later" ? "" : value,
                            })
                          }
                        >
                          <SelectTrigger
                            aria-label="Calendario dell’assistente"
                            className="mt-2"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="later">
                              Lo configuro più tardi
                            </SelectItem>
                            {calendars.data?.map((calendar) => (
                              <SelectItem key={calendar.id} value={calendar.id}>
                                {calendar.name} · {calendar.duration_minutes}{" "}
                                min
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <p className="mt-3 text-xs leading-5 text-muted-foreground">
                        L’agenda rispetta disponibilità, durata e impegni del
                        titolare. Puoi già fare una prova; per prenotare davvero
                        serve un calendario attivo.
                      </p>
                      {!calendars.isLoading &&
                        !calendars.isError &&
                        !calendars.data?.length && (
                          <a
                            className="mt-2 inline-block text-xs underline"
                            href="/azienda/impostazioni/calendari"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Apri la gestione dei calendari
                          </a>
                        )}
                    </div>
                  ) : (
                    <div className="rounded-lg bg-muted/30 p-3 text-sm">
                      Questo flusso non prenota appuntamenti. Non serve
                      scegliere un calendario.
                    </div>
                  )}
                  {availableOperators ? (
                    <div className="rounded-lg border p-3 text-sm leading-6">
                      <b>Primo operatore disponibile</b>
                      <p className="mt-2">
                        Usa gli operatori presenti e liberi nel centralino, con
                        numero completo già configurato. Se nessuno può
                        rispondere raccoglie una richiesta di richiamo. Puoi
                        provare il dialogo anche prima di collegare la linea.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border p-3">
                      <Label htmlFor="onboarding-operator">
                        Numero dell’operatore, facoltativo
                      </Label>
                      <Input
                        id="onboarding-operator"
                        value={values.operatorNumber}
                        onChange={(e) =>
                          update({ operatorNumber: e.target.value })
                        }
                        placeholder="+39…"
                        type="tel"
                        className="mt-2"
                        maxLength={30}
                      />
                      <p className="mt-3 text-xs leading-5 text-muted-foreground">
                        È la persona a cui passare le chiamate dopo la verifica
                        di disponibilità. Se lo lasci vuoto, l’assistente
                        raccoglie una richiesta di richiamo.
                      </p>
                    </div>
                  )}
                </>
              )}
              {step === 2 && (
                <>
                  <div>
                    <h2 className="text-base font-semibold">
                      Come si presenta?
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Scegli la voce e la frase da cui parte ogni conversazione.
                    </p>
                  </div>
                  <div className="space-y-2 rounded-lg border bg-sky-50/50 p-3 dark:bg-sky-950/25">
                    <Label htmlFor="onboarding-voice">
                      Voce dell’assistente
                    </Label>
                    <Select
                      value={values.voiceId || FISH_DEFAULT_VOICE}
                      onValueChange={(voiceId) => update({ voiceId })}
                      disabled={!canManage}
                    >
                      <SelectTrigger
                        id="onboarding-voice"
                        aria-label="Voce dell’assistente"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FISH_PUBLIC_VOICES.map(({ id, name }) => (
                          <SelectItem key={id} value={id}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Potrai ascoltarla nel passaggio successivo.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="onboarding-greeting">Primo messaggio</Label>
                    <Textarea
                      id="onboarding-greeting"
                      value={values.greeting}
                      onChange={(e) => update({ greeting: e.target.value })}
                      maxLength={500}
                      rows={3}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <Label htmlFor="onboarding-expressive">
                        Voce naturale ed espressiva
                      </Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Adatta pause ed enfasi alla conversazione.
                      </p>
                    </div>
                    <Switch
                      id="onboarding-expressive"
                      checked={values.expressive}
                      onCheckedChange={(expressive) => update({ expressive })}
                    />
                  </div>
                </>
              )}
              {step === 3 && agentId && (
                <>
                  <div>
                    <h2 className="text-base font-semibold">
                      Prova il tuo assistente
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      La bozza è salvata. Ascolta come gestisce una richiesta
                      prima di collegare il numero.
                    </p>
                  </div>
                  {status.isPending ? (
                    <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Preparo la conversazione…
                    </div>
                  ) : ready ? (
                    <FishLiveVoice
                      companyId={companyId!}
                      agentId={agentId}
                      ready
                      initialScenario={fishScenarioForFlow(values.flowId)}
                      onConnected={() => setTested(true)}
                    />
                  ) : (
                    <div className="space-y-3 rounded-lg border p-3">
                      <p className="text-sm">
                        L’assistente è salvato. La prova vocale non è ancora
                        pronta; puoi riprovare la preparazione senza creare un
                        altro agente.
                      </p>
                      <Button
                        variant="outline"
                        disabled={prepare.isPending || !canManage}
                        onClick={() => prepare.mutate()}
                      >
                        {prepare.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 h-4 w-4" />
                        )}
                        Prepara la prova
                      </Button>
                      {prepare.isError && (
                        <p role="alert" className="text-xs text-destructive">
                          La preparazione non è riuscita. Riprova più tardi; la
                          bozza rimane salvata.
                        </p>
                      )}
                    </div>
                  )}
                  {tested && (
                    <p className="flex items-center gap-2 text-sm text-emerald-800">
                      <CheckCircle2 className="h-4 w-4" />
                      Collegamento vocale verificato.
                    </p>
                  )}
                </>
              )}
              {step === 4 && agentId && (
                <FishNumberConnectionRequest
                  companyId={companyId!}
                  agentId={agentId}
                />
              )}
              {values.flowId === "support_appointment" &&
                step < 3 &&
                !assistance.isPending &&
                !assistanceReady && (
                  <p
                    role="status"
                    className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                  >
                    Collegamento a Silvio in preparazione. Puoi scegliere le
                    impostazioni; la creazione del flusso completo sarà
                    disponibile dopo il collegamento.
                    <Button variant="link" onClick={() => assistance.refetch()}>
                      Ricontrolla
                    </Button>
                  </p>
                )}
              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                >
                  {error}
                </p>
              )}
            </div>
            <aside
              aria-labelledby="onboarding-summary"
              className="min-w-0 space-y-2 rounded-lg border bg-muted/30 p-2.5 md:sticky md:top-0"
            >
              <div>
                <h2
                  id="onboarding-summary"
                  className="text-xs font-semibold text-sky-700 dark:text-sky-300"
                >
                  Riepilogo assistente
                </h2>
                <p className="mt-1 break-words text-sm font-semibold">
                  {values.name.trim() || "Assistente senza nome"}
                </p>
                <p className="mt-0.5 text-xs font-medium">{flow.title}</p>
                <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
                  {flow.description}
                </p>
              </div>
              <ol className="hidden space-y-1 border-y py-2 text-xs leading-4 md:block">
                {flow.steps.map((label) => (
                  <li key={label} className="flex items-start gap-2">
                    <Check
                      aria-hidden="true"
                      className="mt-0.5 size-3 shrink-0 text-sky-700 dark:text-sky-300"
                    />
                    {label}
                  </li>
                ))}
              </ol>
              <dl className="space-y-1.5 text-xs max-md:[&>div]:grid max-md:[&>div]:grid-cols-[7rem_minmax(0,1fr)] max-md:[&>div]:gap-2">
                <div>
                  <dt className="text-muted-foreground">Agenda</dt>
                  <dd className="break-words font-medium">{agendaLabel}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Voce</dt>
                  <dd className="break-words font-medium">
                    {selectedVoice?.name ||
                      existingAgent?.voice_nome ||
                      "Voce personalizzata"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Passaggio a una persona
                  </dt>
                  <dd className="break-words font-medium">{operatorLabel}</dd>
                </div>
              </dl>
            </aside>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-background px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4">
          <div>
            {step === 0 ? (
              onChangeType && (
                <Button variant="ghost" onClick={onChangeType}>
                  Altri tipi di agente
                </Button>
              )
            ) : (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (agentId && step === 3) onSuccess(agentId);
                  else {
                    setError("");
                    setStep((value) => value - 1);
                  }
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {agentId && step === 3 ? "Apri impostazioni" : "Indietro"}
              </Button>
            )}
          </div>
          {step === 4 ? (
            <Button onClick={() => onSuccess(agentId!)}>
              Apri il mio assistente
              <Check className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              className="eic-motion-button bg-sky-700 text-white hover:bg-sky-800"
              disabled={busy || !canManage || !companyId}
              onClick={next}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creo l’assistente…
                </>
              ) : step === 2 ? (
                "Crea e prova"
              ) : step === 3 ? (
                <>
                  <Phone className="mr-2 h-4 w-4" />
                  Collega il numero
                </>
              ) : (
                <>
                  Continua
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
