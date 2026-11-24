import { useFishAssistanceCapabilities } from "@/lib/fishAssistanceCapabilities";
import { FishAssistanceSetup } from "./FishAssistanceSetup";
import { FISH_ASSISTANCE_TOOLS } from "../../../shared/fish/assistance";
import { FishLeadBusinessSettings } from "./FishLeadBusinessSettings";
import { fishLeadBusiness } from "../../../supabase/functions/_shared/fishLeadBusiness";
import {
  FISH_SCENARIOS,
  buildFishSimulation,
} from "../../../supabase/functions/_shared/fishSimulation";
import {
  enabledFishTools,
  fishSpeechModel,
} from "../../../supabase/functions/_shared/fishAgentConfig";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Bot,
  FlaskConical,
  Globe2,
  Loader2,
  MessageSquare,
  Mic,
  Phone,
  Save,
  Settings2,
  Wrench,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { callFishAgent } from "@/lib/fishAgentProxy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { WorkspaceTabs } from "@/components/ui/workspace-tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FishAgentPanel } from "./FishAgentPanel";
import { FishSimulationPanel } from "./FishSimulationPanel";
import { FishVoicePreview } from "./FishVoicePreview";
import { FishCrmTrialPanel } from "./FishCrmTrialPanel";
import { FishLiveVoice } from "./FishLiveVoice";
import { FishOnboardingWizard } from "./FishOnboardingWizard";
import { FishFlowPicker } from "./FishFlowPicker";
import {
  connectionStatusLabel,
  fishDefaultGreeting,
  fishScenarioForFlow,
  fishUsesAvailableOperators,
  onboardingPhone,
} from "@/lib/fishOnboarding";
import { FishNumberConnectionRequest } from "./FishNumberConnectionRequest";
import {
  fishNumberConnectionKey,
  useFishNumberConnectionStatus,
} from "@/hooks/useFishNumberConnectionStatus";
import { ConversazioniTab } from "./ConversazioniTab";
import { FISH_PUBLIC_VOICES } from "../../../supabase/functions/_shared/fishVoiceCatalog";
import { FISH_LLM_MODELS } from "../../../supabase/functions/_shared/fishAgentConfig";
import { FISH_FLOW_PRESETS, fishFlowPrompt } from "@/lib/fishFlows";
import { toast } from "sonner";
import { FishOperatorRules } from "./FishOperatorRules";
import { validateFishRouting } from "../../../supabase/functions/_shared/fishOperatorRouting";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const GIULIA = "0e36e185d0654d5bac3d24331562a0cc";
const TOOLS = [
  [
    "non_richiamare",
    "Non richiamare più",
    "Registra l’opposizione esplicita nel contatto e blocca le successive chiamate Fish.",
  ],
  [
    "get_lead_info",
    "Riconosci il cliente",
    "Consulta la scheda del chiamante e le sue richieste.",
  ],
  [
    "stato_consegna",
    "Stato della commessa",
    "Risponde sull’avanzamento del lavoro usando il gestionale.",
  ],
  [
    "stato_preventivo",
    "Stato del preventivo",
    "Verifica se il preventivo è stato inviato o accettato.",
  ],
  [
    "get_availability",
    "Disponibilità agenda",
    "Controlla gli orari prima di proporre un appuntamento.",
  ],
  [
    "create_appointment",
    "Prenota un sopralluogo",
    "Registra l’appuntamento dopo la conferma del cliente.",
  ],
  [
    "memoria_pratica",
    "Ricorda le pratiche",
    "Dopo la verifica recupera ticket, commesse e conversazioni recenti del cliente.",
  ],
  [
    "aggiorna_ticket",
    "Aggiorna una segnalazione aperta",
    "Riprende il ticket scelto dal cliente e salva una nota dopo il consenso, senza duplicarlo.",
  ],
  [
    "crea_ticket",
    "Apri una segnalazione",
    "Raccoglie il problema e prepara una richiesta di assistenza.",
  ],
  [
    "assign_to_user",
    "Richiesta di richiamo",
    "Raccoglie nome, motivo e recapito concordato.",
  ],
  [
    "search_products",
    "Cerca nel catalogo",
    "Consulta prodotti e materiali dell’azienda.",
  ],
  [
    "passa_a_operatore",
    "Trova un operatore",
    "Verifica chi può rispondere e prepara il riepilogo.",
  ],
  [
    "aggiorna_opportunita",
    "Registra esito commerciale",
    "Nelle chiamate in uscita aggiunge una nota e il prossimo passo all’unica opportunità aperta del contatto. Non modifica fase o importo.",
  ],
] as const;
type Binding = {
  voice_id: string;
  fish_agent_id: string | null;
  enabled: boolean;
  published: boolean;
  test_batches?: string[];
  test_ids?: Record<string, string>;
};
type Status = {
  binding: Binding | null;
  keyConfigured: boolean;
  synchronized?: boolean;
  localPreview?: boolean;
};
type Voice = { id: string; name: string; languages?: string[] };
const panel = "eic-workspace-card min-w-0 rounded-xl border bg-card p-3 sm:p-4";
const NAV = [
  { id: "configurazione", label: "Istruzioni e voce", icon: Settings2 },
  { id: "flussi", label: "Flussi", icon: Bot },
  { id: "strumenti", label: "Strumenti e operatori", icon: Wrench },
  { id: "simulazioni", label: "Prove", icon: FlaskConical },
  { id: "telefonia", label: "Numero", icon: Phone },
  { id: "chiamate", label: "Storico chiamate", icon: MessageSquare },
] as const;
export type FishWorkspaceTab = (typeof NAV)[number]["id"];

export function FishAgentWorkspace({
  agent,
  companyId,
  onBack,
  initialTab = "configurazione",
  requestedTab,
  onTabChange,
  onClosePreview,
  backLabel = "Torna agli agenti",
  historyHref,
}: {
  agent: any;
  companyId: string;
  onBack: () => void;
  initialTab?: FishWorkspaceTab;
  requestedTab?: string | null;
  onTabChange?: (tab: FishWorkspaceTab) => void;
  onClosePreview?: (mode: "ascolta" | "voce") => void;
  backLabel?: string;
  historyHref?: string;
}) {
  const t = useT();
  const client = useQueryClient();
  const { isAdmin } = usePermissions();
  const auth = useAuth();
  const isSuperAdmin = auth.role === "super_admin" && !auth.viewAsRole;
  const canManage = isAdmin || isSuperAdmin;
  const [localTab, setLocalTab] = useState<FishWorkspaceTab>(initialTab);
  const tabs = NAV.filter(({ id }) => !historyHref || id !== "chiamate").map((voce) => ({ ...voce, label: t(voce.label) }));
  const routeTab = requestedTab === "conversazioni" ? "chiamate" : requestedTab;
  const tab = requestedTab === undefined ? localTab : tabs.find(({ id }) => id === routeTab)?.id ?? initialTab;

  function setTab(value: string) {
    const next = tabs.find(({ id }) => id === value);
    if (!next) return;
    if (onTabChange) onTabChange(next.id);
    else setLocalTab(next.id);
  }
  const [flowPreviewId, setFlowPreviewId] = useState<string | null>(null);
  const numberStatus = useFishNumberConnectionStatus(
    companyId,
    agent.id,
    canManage,
  );
  const [voiceOpen, setVoiceOpen] = useState(
    () => new URLSearchParams(window.location.search).get("prova") === "ascolta",
  );
  const [liveOpen, setLiveOpen] = useState(
    () => new URLSearchParams(window.location.search).get("prova") === "voce",
  );
  const [voiceScenario, setVoiceScenario] = useState(
    () =>
      new URLSearchParams(window.location.search).get("scenario") ||
      fishScenarioForFlow(agent.tools_config?.fish?.flow_id),
  );
  const [crmOpen, setCrmOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [voiceDraft, setVoice] = useState<string | null>(null);
  const [form, setForm] = useState(() => ({
    leadCompany: fishLeadBusiness(agent).company_name,
    leadServices: fishLeadBusiness(agent).services.join(", "),
    leadAreas: fishLeadBusiness(agent).areas.join(", "),
    leadMode: fishLeadBusiness(agent).appointment_mode,
    flowId: agent.tools_config?.fish?.flow_id || "complete",
    name: agent.nome || "",
    description: agent.descrizione || "",
    prompt: agent.system_prompt || "",
    first: agent.primo_messaggio || "",
    language: agent.lingua || "it",
    model: agent.llm_model || "gemini-2.5-flash",
    duration: agent.durata_max_secondi || 300,
    recording: agent.registra_chiamate === true,
    transcript: agent.trascrivi_chiamate !== false,
    timezone: agent.tools_config?.fish?.timezone || "Europe/Rome",
    transfer: agent.tools_config?.system_tools?.transfer_number === true,
    calendarId: agent.tools_config?.fish?.calendar_id || "",
    routing: agent.tools_config?.fish?.routing || "fixed",
    routingDepartment: agent.tools_config?.fish?.routing_department || "",
    routingSelection: Array.isArray(
      agent.tools_config?.fish?.routing_member_ids,
    )
      ? "selected"
      : "all",
    routingMembers: (agent.tools_config?.fish?.routing_member_ids ||
      []) as string[],
    routingHoursEnabled:
      agent.tools_config?.fish?.routing_hours?.enabled === true,
    routingDays: (agent.tools_config?.fish?.routing_hours?.days || [
      1, 2, 3, 4, 5,
    ]) as number[],
    routingStart: agent.tools_config?.fish?.routing_hours?.start || "09:00",
    routingEnd: agent.tools_config?.fish?.routing_hours?.end || "18:00",
    ttsModel: fishSpeechModel(agent),
    expressive: agent.tools_config?.fish?.voice?.expressive ?? true,
    speed: agent.tools_config?.fish?.voice?.speed ?? 1,
    effect: agent.tools_config?.fish?.voice?.effect || "none",
    ambience:
      agent.tools_config?.fish?.voice?.background_sound?.preset || "off",
    ambienceVolume:
      agent.tools_config?.fish?.voice?.background_sound?.volume ?? 0.08,
    operator: agent.tools_config?.trasferimento?.numero || "",
    tools: Object.fromEntries(
      TOOLS.map(([id]) => [
        id,
        agent.tools_config?.edilizia_tools?.[id]?.enabled === true,
      ]),
    ),
  }));
  const assistance = useFishAssistanceCapabilities(
    companyId,
    form.flowId === "support_appointment",
  );
  const [saved, setSaved] = useState(() => JSON.stringify(form));
  const [savedVoiceDraft, setSavedVoice] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((old) => ({ ...old, [key]: value }));
  const status = useQuery({
    queryKey: ["fish-agent", companyId, agent.id],
    retry: false,
    queryFn: () => callFishAgent<Status>(companyId, agent.id, "status"),
  });
  const localPreview = import.meta.env.DEV && status.data?.localPreview === true;
  const binding = status.data?.binding;
  const configuredVoice = agent.tools_config?.fish?.voice_id;
  const initialVoice =
    status.data?.synchronized === false
      ? configuredVoice || binding?.voice_id || GIULIA
      : binding?.voice_id || configuredVoice || GIULIA;
  const voice = voiceDraft ?? initialVoice;
  const savedVoice = savedVoiceDraft ?? initialVoice;
  const voices = useQuery({
    queryKey: ["fish-voices", companyId, agent.id],
    enabled: canManage && !!status.data?.keyConfigured,
    retry: false,
    staleTime: 60_000,
    queryFn: () =>
      callFishAgent<{ voices: Voice[] }>(
        companyId,
        agent.id,
        "available_voices",
      ),
  });
  const calendars = useQuery({
    queryKey: ["fish-agent-calendars", companyId],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_calendars")
        .select("id,name,duration_minutes")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });
  const choices = useMemo(() => {
    const map = new Map<string, Voice>(
      FISH_PUBLIC_VOICES.map((voice) => [voice.id, voice]),
    );
    for (const item of voices.data?.voices || [])
      if (!map.has(item.id)) map.set(item.id, item);
    if (voice && !map.has(voice))
      map.set(voice, { id: voice, name: t("Voce personalizzata") });
    return [...map.values()];
  }, [voices.data, voice, t]);
  const dirty = saved !== JSON.stringify(form) || voice !== savedVoice;
  const save = useMutation({
    mutationFn: async () => {
      if (!canManage)
        throw new Error(t("Solo l’amministratore può modificare l’agente."));
      if (!form.name.trim() || form.prompt.trim().length < 20 || !voice.trim())
        throw new Error(t("Completa nome, istruzioni e voce dell’agente."));
      if (
        !Number.isFinite(form.duration) ||
        form.duration < 30 ||
        form.duration > 3600
      )
        throw new Error(
          t("La durata massima deve essere compresa fra 0,5 e 60 minuti."),
        );
      if (
        form.transfer &&
        form.routing !== "first_available" &&
        !/^\+\d{8,15}$/.test(onboardingPhone(form.operator))
      )
        throw new Error(
          t("Indica il numero dell’operatore con prefisso internazionale."),
        );
      if (
        form.transfer &&
        (!form.tools.passa_a_operatore || !form.tools.assign_to_user)
      )
        throw new Error(
          t("Per il passaggio abilita Trova un operatore e Richiesta di richiamo."),
        );
      if (
        form.flowId === "support_appointment" &&
        (!assistance.data?.ready || assistance.data.version < 1)
      )
        throw new Error(
          t("Il collegamento a Silvio deve essere pronto prima di salvare il flusso completo."),
        );
      if (
        form.flowId === "support_appointment" &&
        (!form.calendarId ||
          !calendars.data?.some((c) => c.id === form.calendarId))
      )
        throw new Error(t("Scegli un calendario attivo per l’assistenza."));
      if (
        form.flowId === "support_appointment" &&
        FISH_ASSISTANCE_TOOLS.some((id) => !form.tools[id])
      )
        throw new Error(
          t("Riapplica il flusso Assistenza completa per ripristinare gli strumenti richiesti."),
        );
      const routing = {
        routing_member_ids:
          form.routingSelection === "selected" ? form.routingMembers : null,
        routing_department: form.routingDepartment.trim(),
        routing_hours: {
          enabled: form.routingHoursEnabled,
          days: form.routingDays,
          start: form.routingStart,
          end: form.routingEnd,
        },
      };
      validateFishRouting({ tools_config: { fish: routing } });
      if (binding?.fish_agent_id)
        await callFishAgent(companyId, agent.id, "pause");
      const old = agent.tools_config || {};
      const config = {
        ...old,
        voice_provider: "fish_audio",
        fish: {
          ...old.fish,
          flow_id: form.flowId,
          voice_id: voice.trim(),
          lead_profile: {
            company_name: form.leadCompany.trim(),
            services: form.leadServices
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            areas: form.leadAreas
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            appointment_mode: form.leadMode,
          },
          timezone: form.timezone,
          calendar_id: form.calendarId || null,
          routing: form.routing,
          ...routing,
          voice: {
            ...old.fish?.voice,
            tts_model: form.ttsModel,
            expressive: form.expressive,
            speed: form.speed,
            effect: form.effect,
            background_sound: {
              preset: form.ambience,
              volume: form.ambienceVolume,
            },
          },
        },
        edilizia_tools: {
          ...old.edilizia_tools,
          ...Object.fromEntries(
            TOOLS.map(([id]) => [
              id,
              { ...old.edilizia_tools?.[id], enabled: form.tools[id] },
            ]),
          ),
        },
        system_tools: { ...old.system_tools, transfer_number: form.transfer },
        trasferimento: {
          ...old.trasferimento,
          numero: onboardingPhone(form.operator),
        },
      };
      const { data, error } = await supabase
        .from("ai_agents_v2")
        .update({
          nome: form.name.trim(),
          descrizione: form.description.trim() || null,
          system_prompt: form.prompt.trim(),
          primo_messaggio: form.first.trim() || null,
          lingua: form.language,
          llm_model: form.model,
          durata_max_secondi: Math.max(
            30,
            Math.min(3600, Number(form.duration) || 300),
          ),
          registra_chiamate: form.recording,
          trascrivi_chiamate: form.transcript,
          tools_config: config,
        } as never)
        .eq("id", agent.id)
        .eq("company_id", companyId)
        .select("id")
        .single();
      if (error || !data) throw error || new Error(t("Bozza non salvata."));
      if (localPreview) return { formSnapshot: JSON.stringify(form), voiceSnapshot: voice };
      try {
        await callFishAgent(companyId, agent.id, "configure", {
          voice_id: voice.trim(),
        });
      } catch (error) {
        throw new Error(
          t("Bozza salvata nel gestionale; sincronizzazione Fish da ripetere. {dettaglio}", { dettaglio: error instanceof Error ? error.message : "" }),
          { cause: error },
        );
      }
      return { formSnapshot: JSON.stringify(form), voiceSnapshot: voice };
    },
    onSuccess: (result) => {
      setSaved(result.formSnapshot);
      setSavedVoice(result.voiceSnapshot);
      toast.success(
        localPreview ? t("Bozza salvata nel gestionale locale.") : t("Bozza salvata e sincronizzata. Puoi provarla dalle simulazioni."),
      );
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => {
      for (const key of [
        ["fish-agent", companyId, agent.id],
        fishNumberConnectionKey(companyId, agent.id),
        ["agent-detail", companyId, agent.id],
        ["unified-ai-agents"],
      ])
        client.invalidateQueries({ queryKey: key });
    },
  });
  const ready =
    canManage &&
    !!status.data?.keyConfigured &&
    status.data?.synchronized !== false &&
    !!binding?.fish_agent_id;
  const voiceReady = ready || (canManage && localPreview && !!status.data?.keyConfigured);
  const activeFlow = FISH_FLOW_PRESETS.find((item) => item.id === form.flowId);
  const previewFlow =
    FISH_FLOW_PRESETS.find((item) => item.id === flowPreviewId) ??
    activeFlow ??
    FISH_FLOW_PRESETS[0];
  const line = numberStatus.data?.line;
  const requestStatus = numberStatus.data?.request?.status;
  const lineLabel = !canManage
    ? "Gestito dall’amministratore"
    : numberStatus.isError
      ? "Stato da verificare"
      : numberStatus.isPending
        ? "Verifica in corso…"
        : line
          ? line.outbound
            ? "Entrata e uscita configurate"
            : "Solo entrata configurata"
          : requestStatus === "ready"
            ? "Collegamento da verificare"
            : requestStatus && requestStatus !== "cancelled"
              ? connectionStatusLabel[requestStatus] || "Richiesta in corso"
              : "Da collegare";
  const shortcuts = [
    {
      id: "flussi",
      icon: Bot,
      title: t("Flusso"),
      detail: activeFlow?.title ? t(activeFlow.title) : t("Personalizzato"),
      action: t("Scegli il flusso"),
    },
    {
      id: "simulazioni",
      icon: Mic,
      title: t("Voce e prova"),
      detail: localPreview
        ? "Giulia · Drama 3"
        : dirty
        ? t("Salva le modifiche prima della prova")
        : ready
          ? t("Pronta da provare")
          : status.isPending
            ? t("Verifica in corso…")
            : t("Da preparare"),
      action: t("Apri le prove"),
    },
    {
      id: "telefonia",
      icon: Phone,
      title: t("Numero aziendale"),
      detail: line ? line.number + " · " + t(lineLabel) : t(lineLabel),
      action: t("Vedi il collegamento"),
    },
  ];

  const simulationDraft = {
    ...agent,
    tools_config: {
      ...agent.tools_config,
      fish: { ...agent.tools_config?.fish, flow_id: form.flowId },
      edilizia_tools: {
        ...agent.tools_config?.edilizia_tools,
        ...Object.fromEntries(
          Object.entries(form.tools).map(([id, enabled]) => [id, { enabled }]),
        ),
      },
      trasferimento: {
        numero:
          form.transfer && form.routing === "fixed"
            ? onboardingPhone(form.operator)
            : "",
      },
    },
  };

  function applyFlow() {
    const flow = previewFlow;
    set("flowId", flow.id);
    setVoiceScenario(fishScenarioForFlow(flow.id));
    set("prompt", fishFlowPrompt(flow.id));
    if (fishUsesAvailableOperators(flow.id)) {
      set("routing", "first_available");
      set("transfer", true);
    }
    const companyName = auth.effectiveCompany?.name;
    if (
      !form.first.trim() ||
      form.first === fishDefaultGreeting(form.flowId, companyName) ||
      form.first === fishDefaultGreeting(form.flowId)
    ) {
      set("first", fishDefaultGreeting(flow.id, companyName));
    }
    set(
      "tools",
      Object.fromEntries(TOOLS.map(([id]) => [id, flow.tools.includes(id)])),
    );
    setFlowPreviewId(null);
    setTab("configurazione");
    toast.success(
      t("Flusso caricato nella bozza. Personalizza e salva prima della prova."),
    );
  }
  return (
    <div className="eic-workspace min-w-0 text-foreground">
      <header className="eic-workspace-header eic-motion-enter px-2.5 py-3 sm:px-4">
        <div className="mx-auto flex max-w-[1432px] flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="size-9 shrink-0"
              onClick={onBack}
              aria-label={t(backLabel)}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <span className="eic-workspace-icon"><AudioLines aria-hidden="true" className="size-5" /></span>
            <div className="min-w-0">
              <h1 className="break-words text-lg font-semibold leading-tight tracking-tight sm:text-xl">
                {form.name || t("Il tuo agente")}
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("Agente vocale · Fish Audio · {stato}", { stato: binding?.enabled ? t("Attivo") : t("Bozza") })}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 max-sm:pl-1">
            {tab !== "simulazioni" && (
              <Button size="sm" variant="outline" onClick={() => setTab("simulazioni")}>
                <FlaskConical className="mr-1.5 size-3.5" /> {t("Prova agente")}
              </Button>
            )}
            {historyHref && (
              <Button asChild size="sm" variant="outline">
                <Link to={historyHref}><MessageSquare className="mr-1.5 size-3.5" /> {t("Chiamate nel Centralino")}</Link>
              </Button>
            )}
            <span
              role="status"
              className={
                dirty
                  ? "rounded-md bg-orange-100 px-2 py-1 text-xs font-medium text-orange-900 dark:bg-orange-950 dark:text-orange-200"
                  : "text-xs text-muted-foreground"
              }
            >
              {save.isPending
                ? t("Salvataggio…")
                : dirty
                  ? t("Modifiche da salvare")
                  : status.isPending
                    ? t("Caricamento…")
                    : localPreview
                      ? t("Bozza locale")
                      : binding?.fish_agent_id
                      ? status.data?.synchronized === false
                        ? t("Da preparare")
                        : t("Bozza sincronizzata")
                      : t("Da collegare")}
            </span>
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={
                !canManage ||
                save.isPending ||
                (!status.data?.keyConfigured && !localPreview) ||
                (binding?.enabled && !dirty && ready)
              }
              className="eic-motion-button"
            >
              {save.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              {binding?.enabled ? t("Metti in pausa e salva") : t("Salva bozza")}
            </Button>
          </div>
        </div>
        {binding?.enabled && dirty && (
          <p className="mx-auto mt-3 max-w-[1432px] rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900 dark:bg-orange-950/50 dark:text-orange-200">
            {t("Salvando, metti in pausa l’agente sulla linea. Dopo la prova, la versione aggiornata va pubblicata e riattivata.")}
          </p>
        )}
      </header>
      <Tabs value={tab} onValueChange={setTab}>
        <div className="mt-3 min-w-0 overflow-x-auto px-1 pb-1 pt-0.5">
          <WorkspaceTabs items={tabs} selected={tab} label={t("Gestione dell’agente")} />
        </div>
        <div className="mx-auto max-w-[1464px] p-2.5 sm:p-4">
          {status.isError && (
            <div
              role="alert"
              className="mb-4 flex items-center justify-between rounded-xl border bg-background p-4 text-sm"
            >
              <span>{status.error.message}</span>
              <Button variant="outline" onClick={() => status.refetch()}>
                {t("Riprova")}
              </Button>
            </div>
          )}
          {status.data && !status.data.keyConfigured && !localPreview && (
            <div
              role="status"
              className="mb-4 rounded-xl border bg-background p-4 text-sm"
            >
              {t("Collega la chiave Fish nel backend per provare la voce e le simulazioni. La chiave resta sul server.")}
            </div>
          )}
          {localPreview && (
            <p className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-100">
              {t("Collaudo locale di Giulia · Drama 3. Voce di prova Fish, numero e bozza dimostrativi.")}
            </p>
          )}
          <TabsContent value="configurazione" className="eic-motion-enter mt-0">
            <div className="eic-stagger mb-4 grid gap-2.5 sm:grid-cols-3">
              {shortcuts.map(({ id, icon: Icon, title, detail, action }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  data-tone={id === "telefonia" ? "orange" : "blue"}
                  className="eic-workspace-card eic-motion-button flex min-w-0 items-center gap-2.5 rounded-xl border bg-card p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                >
                  <span className="eic-workspace-icon !size-9"><Icon aria-hidden="true" className="size-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold">{title}</span>
                    <span className="block break-words text-xs leading-4 text-muted-foreground">
                      {detail}
                    </span>
                  </span>
                  <span className="sr-only">{action}</span>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-sky-700 dark:text-sky-300"
                  />
                </button>
              ))}
            </div>
            <div className="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="order-2 space-y-3 lg:order-1">
                {form.flowId === "support_appointment" && (
                  <FishAssistanceSetup
                    calendarId={form.calendarId}
                    calendars={calendars.data || []}
                    loading={calendars.isPending}
                    error={calendars.isError}
                    disabled={!canManage}
                    onCalendarChange={(id) => set("calendarId", id)}
                    onRetry={() => calendars.refetch()}
                  />
                )}
                <section className={panel}>
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="font-semibold">{t("Primo messaggio")}</h2>
                    <Badge variant="secondary" className="font-normal">
                      {t("Saluto fisso")}
                    </Badge>
                  </div>

                  <Textarea
                    aria-label={t("Primo messaggio")}
                    value={form.first}
                    onChange={(e) => set("first", e.target.value)}
                    disabled={!canManage}
                    rows={2}
                    className="resize-y border-border/60 bg-background shadow-none"
                  />
                </section>
                <details
                  className={panel}
                  open={form.flowId !== "support_appointment"}
                >
                  <summary className="cursor-pointer text-sm font-semibold">
                    {t("Istruzioni dell’agente")}
                  </summary>
                  <p className="mb-2 mt-2 text-xs text-muted-foreground">
                    {t("Obiettivi, domande e regole per passare a una persona.")}
                  </p>
                  <Textarea
                    aria-label={t("Prompt di sistema")}
                    value={form.prompt}
                    onChange={(e) => set("prompt", e.target.value)}
                    disabled={!canManage}
                    maxLength={32000}
                    className="min-h-36 resize-y border-border/60 bg-background p-2.5 text-sm leading-5 shadow-none sm:min-h-52"
                  />
                  <p className="mt-1 text-right text-xs tabular-nums text-muted-foreground">
                    {form.prompt.length.toLocaleString(intlCampo())} / 32.000
                  </p>
                </details>
                {form.flowId === "lead_qualification" && (
                  <FishLeadBusinessSettings
                    value={form}
                    onChange={(patch) =>
                      setForm((old) => ({ ...old, ...patch }))
                    }
                    disabled={!canManage}
                  />
                )}
                {form.flowId !== "support_appointment" && (
                  <section className={panel}>
                    <h2 className="mb-2 font-semibold">{t("Agenda dell’agente")}</h2>
                    <p className="mb-4 text-sm leading-6 text-muted-foreground">
                      {t("Le prenotazioni rispettano orari, durata, margini e impegni del titolare del calendario.")}
                    </p>
                    <Select
                      value={form.calendarId || "none"}
                      onValueChange={(v) =>
                        set("calendarId", v === "none" ? "" : v)
                      }
                      disabled={!canManage}
                    >
                      <SelectTrigger aria-label={t("Calendario per gli appuntamenti")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          {t("Scegli un calendario")}
                        </SelectItem>
                        {calendars.data?.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{t("{name} · {duration_minutes} min", { name: String(c.name ?? ""), duration_minutes: String(c.duration_minutes ?? "") })}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {calendars.isError ? (
                      <p className="mt-2 text-xs text-destructive">
                        {t("Impossibile leggere i calendari. Riprova ricaricando la pagina.")}
                      </p>
                    ) : !form.calendarId ? (
                      <p className="mt-3 text-xs leading-5 text-muted-foreground">
                        {t("Puoi già fare le simulazioni. Prima delle prenotazioni reali scegli un calendario attivo dell’azienda.")}
                      </p>
                    ) : null}
                  </section>
                )}
                <details className={panel}>
                  <summary className="cursor-pointer text-sm font-medium">
                    {t("Nome e descrizione")}
                  </summary>
                  <div className="mt-4 space-y-4">
                    <div>
                      <Label htmlFor="fish-agent-name">{t("Nome agente")}</Label>
                      <Input
                        id="fish-agent-name"
                        value={form.name}
                        onChange={(e) => set("name", e.target.value)}
                        disabled={!canManage}
                      />
                    </div>
                    <div>
                      <Label htmlFor="fish-agent-description">
                        {t("Descrizione")}
                      </Label>
                      <Textarea
                        id="fish-agent-description"
                        value={form.description}
                        onChange={(e) => set("description", e.target.value)}
                        disabled={!canManage}
                      />
                    </div>
                  </div>
                </details>
              </div>
              <aside
                className="order-1 space-y-3 lg:order-2"
                aria-label={t("Impostazioni vocali e conversazione")}
              >
                <section className={panel}>
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-semibold">{t("Voce")}</h2>
                    <AudioLines className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-2.5">
                    <span className="text-xs font-medium">Fish Audio · {form.ttsModel === "drama-3" ? "Drama 3" : "S2.1 Pro"}</span>
                    <Button size="sm" variant="outline" disabled={!voiceReady} onClick={() => setVoiceOpen(true)}>
                      <AudioLines className="mr-1.5 size-4" /> {t("Ascolta")}
                    </Button>
                  </div>
                  <Label>{t("Voce dell’agente")}</Label>
                  <Select
                    value={voice || GIULIA}
                    onValueChange={setVoice}
                    disabled={!canManage}
                  >
                    <SelectTrigger aria-label={t("Voce dell’agente")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {choices.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <details className="mt-3 rounded-md border px-2.5 py-2">
                    <summary className="cursor-pointer text-xs font-medium">{t("Lingua e modello vocale")}</summary>
                  <div className="mt-3">
                    <Label>{t("Modello vocale")}</Label>
                    <Select
                      value={form.ttsModel}
                      onValueChange={(v) =>
                        set("ttsModel", v as ReturnType<typeof fishSpeechModel>)
                      }
                      disabled={!canManage}
                    >
                      <SelectTrigger aria-label={t("Modello vocale")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="drama-3">Drama 3</SelectItem>
                        <SelectItem value="s2.1-pro">S2.1 Pro</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("Usato nella conversazione e nella prova voce dopo il salvataggio.")}
                    </p>
                  </div>
                  <div className="mt-4">
                    <Label>{t("Lingua parlata")}</Label>
                    <Select
                      value={form.language}
                      onValueChange={(v) => set("language", v)}
                      disabled={!canManage}
                    >
                      <SelectTrigger aria-label={t("Lingua parlata")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          ["it", "Italiano"],
                          ["en", "English"],
                          ["fr", "Français"],
                          ["de", "Deutsch"],
                          ["es", "Español"],
                        ].map(([v, l]) => (
                          <SelectItem key={v} value={v}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  </details>
                  <details className="mt-3 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">
                      {t("Collega un’altra voce")}
                    </summary>
                    <p className="my-3">
                      {t("Qui trovi le voci disponibili per la tua azienda. Per un clone privato, chiedi alla piattaforma di associarlo all’agente.")}
                    </p>
                    <Input
                      aria-label={t("ID di un’altra voce Fish")}
                      value={voice}
                      onChange={(e) => setVoice(e.target.value)}
                      disabled={!canManage}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2"
                      onClick={() => voices.refetch()}
                    >
                      {t("Aggiorna le mie voci")}
                    </Button>
                    {voices.isError && (
                      <p className="mt-2">{voices.error.message}</p>
                    )}
                  </details>
                </section>
                <details className={panel}>
                  <summary className="cursor-pointer text-sm font-medium">{t("Naturalezza ed effetti")}</summary>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <Label htmlFor="fish-expressive">{t("Voce espressiva")}</Label>
                    <Switch
                      id="fish-expressive"
                      checked={form.expressive}
                      onCheckedChange={(v) => set("expressive", v)}
                      disabled={!canManage}
                    />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {t("Pause, enfasi e intonazione adattate al dialogo. Per il centralino conviene uno stile naturale e sobrio.")}
                  </p>
                  <Label htmlFor="fish-speed" className="mt-3 block">{t("Velocità · {speed}×", { speed: form.speed.toFixed(2) })}</Label>
                  <input
                    id="fish-speed"
                    aria-label={t("Velocità della voce")}
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.05"
                    value={form.speed}
                    onChange={(e) => set("speed", Number(e.target.value))}
                    disabled={!canManage}
                    className="mt-3 w-full accent-emerald-700"
                  />
                  <div className="mt-3">
                    <Label>{t("Filtro audio web")}</Label>
                    <Select
                      value={form.effect}
                      onValueChange={(v) => set("effect", v)}
                      disabled={!canManage}
                    >
                      <SelectTrigger aria-label={t("Filtro audio web")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("Voce pulita")}</SelectItem>
                        <SelectItem value="phone">{t("Telefono")}</SelectItem>
                        <SelectItem value="intercom">{t("Interfono")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="mt-4">
                    <Label>{t("Sottofondo")}</Label>
                    <Select
                      value={form.ambience}
                      onValueChange={(v) => set("ambience", v)}
                      disabled={!canManage}
                    >
                      <SelectTrigger aria-label={t("Sottofondo vocale")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">{t("Nessuno")}</SelectItem>
                        <SelectItem value="office">{t("Ufficio")}</SelectItem>
                        <SelectItem value="call_center">{t("Centralino")}</SelectItem>
                        <SelectItem value="cafe">{t("Bar")}</SelectItem>
                        <SelectItem value="phone_line">
                          {t("Linea analogica")}
                        </SelectItem>
                        <SelectItem value="phone_line_digital">
                          {t("Linea digitale")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.ambience !== "off" && (
                    <div className="mt-4">
                      <Label htmlFor="fish-ambience-volume">{t("Volume sottofondo · {valore}%", { valore: Math.round(form.ambienceVolume * 100) })}</Label>
                      <input
                        id="fish-ambience-volume"
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={form.ambienceVolume}
                        onChange={(e) =>
                          set("ambienceVolume", Number(e.target.value))
                        }
                        disabled={!canManage}
                        className="mt-3 w-full accent-emerald-700"
                      />
                    </div>
                  )}
                  <p className="mt-4 text-xs leading-5 text-muted-foreground">
                    {t("Salva e avvia una nuova conversazione per sentire gli effetti. Pause e sospiri specifici si possono confrontare nella Prova voce.")}
                  </p>
                </details>
                <section className={panel}>
                  <h2 className="mb-2 font-semibold">{t("Modello")}</h2>
                  <p className="mb-4 text-sm text-muted-foreground">
                    {t("Il modello che comprende la richiesta e prepara la risposta.")}
                  </p>
                  <Select
                    value={form.model}
                    onValueChange={(v) => set("model", v)}
                    disabled={!canManage}
                  >
                    <SelectTrigger aria-label={t("Modello dell’agente")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FISH_LLM_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </section>
                <section className={panel}>
                  <h2 className="mb-4 font-semibold">{t("Conversazione")}</h2>
                  <Label htmlFor="fish-call-minutes">{t("Durata massima")}</Label>
                  <div className="mt-2 flex items-center gap-3">
                    <Input
                      id="fish-call-minutes"
                      type="number"
                      min={0.5}
                      max={60}
                      step={0.5}
                      value={form.duration / 60}
                      onChange={(e) =>
                        set("duration", Number(e.target.value) * 60)
                      }
                      disabled={!canManage}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">
                      {t("minuti")}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("La chiamata termina quando raggiunge questo limite.")}
                  </p>
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label htmlFor="fish-record-audio">
                          {t("Registra audio")}
                        </Label>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("Conserva la registrazione della chiamata.")}
                        </p>
                      </div>
                      <Switch
                        id="fish-record-audio"
                        checked={form.recording}
                        onCheckedChange={(v) => set("recording", v)}
                        disabled={!canManage}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label htmlFor="fish-save-transcript">
                          {t("Salva trascrizione")}
                        </Label>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("Mostra il dialogo nello storico.")}
                        </p>
                      </div>
                      <Switch
                        id="fish-save-transcript"
                        checked={form.transcript}
                        onCheckedChange={(v) => set("transcript", v)}
                        disabled={!canManage}
                      />
                    </div>
                  </div>
                </section>
                <section className={panel}>
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-semibold">{t("Contesto")}</h2>
                    <Globe2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <Label>{t("Fuso orario")}</Label>
                  <Select
                    value={form.timezone}
                    onValueChange={(v) => set("timezone", v)}
                    disabled={!canManage}
                  >
                    <SelectTrigger aria-label={t("Fuso orario")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Europe/Rome">{t("Europa / Roma")}</SelectItem>
                      <SelectItem value="Europe/London">
                        {t("Europa / Londra")}
                      </SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                    </SelectContent>
                  </Select>
                </section>
              </aside>
            </div>
          </TabsContent>
          <TabsContent value="flussi" className="eic-motion-enter mt-0">
            <div className="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_17rem]">
              <section className={panel}>
                <h2 className="text-lg font-semibold">
                  {t("Cosa deve fare l’agente?")}
                </h2>
                <p className="mb-3 mt-1 text-sm text-muted-foreground">
                  {t("In bozza:")} <strong>{activeFlow?.title ? t(activeFlow.title) : t("Personalizzato")}</strong>
                </p>
                <FishFlowPicker
                  value={previewFlow.id}
                  onChange={setFlowPreviewId}
                  quickStart
                />
              </section>
              <section className={panel} aria-labelledby="fish-flow-preview">
                <h2 id="fish-flow-preview" className="font-semibold">
                  {previewFlow.title}
                </h2>
                {previewFlow.id === form.flowId && (
                  <p className="mt-1 text-xs font-medium text-sky-800 dark:text-sky-300">
                    {t("Flusso della bozza")}
                  </p>
                )}
                <p className="mt-1 text-xs leading-4 text-muted-foreground">
                  {previewFlow.description}
                </p>
                <ol className="my-2 list-decimal space-y-1 pl-4 text-xs leading-4 text-muted-foreground">
                  {previewFlow.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p className="mb-3 text-xs leading-5 text-muted-foreground">
                  {t("Applicare il flusso sostituisce le istruzioni e la selezione degli strumenti nella bozza.")}
                </p>
                <Button
                  className="eic-motion-button"
                  disabled={!canManage}
                  onClick={applyFlow}
                >
                  {t("Applica alla bozza")}
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </section>
            </div>
          </TabsContent>
          <TabsContent value="strumenti" className="eic-motion-enter mt-0">
            <div className="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_19rem]">
              <section className={panel}>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="font-semibold">{t("Strumenti del gestionale")}</h2>
                  <Badge variant="secondary">{t("{n} attivi", { n: Object.values(form.tools).filter(Boolean).length })}</Badge>
                </div>
                <p className="mb-3 text-sm text-muted-foreground">
                  {t("Scegli le azioni che l’agente può eseguire. Salva la bozza, poi prova il flusso nelle simulazioni.")}
                </p>
                <div className="divide-y">
                  {TOOLS.map(([id, label, description]) => (
                    <div
                      key={id}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div>
                        <Label
                          htmlFor={`fish-tool-${id}`}
                          className="text-sm font-medium"
                        >
                          {t(label)}
                        </Label>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t(description)}
                        </p>
                      </div>
                      <Switch
                        id={`fish-tool-${id}`}
                        checked={form.tools[id]}
                        disabled={!canManage}
                        onCheckedChange={(enabled) =>
                          set("tools", { ...form.tools, [id]: enabled })
                        }
                      />
                    </div>
                  ))}
                </div>
              </section>
              <section className={panel}>
                <h2 className="mb-2 font-semibold">{t("Passaggio a una persona")}</h2>
                <p className="mb-3 text-sm text-muted-foreground">
                  {t("L’agente verifica la disponibilità, presenta il motivo e attende l’accettazione dell’operatore.")}
                </p>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="fish-human-transfer">
                    {t("Abilita il passaggio")}
                  </Label>
                  <Switch
                    id="fish-human-transfer"
                    checked={form.transfer}
                    onCheckedChange={(v) => set("transfer", v)}
                    disabled={!canManage}
                  />
                </div>
                {form.transfer && (
                  <div className="mt-3 space-y-4">
                    <div>
                      <Label>{t("Chi deve rispondere?")}</Label>
                      <Select
                        value={form.routing}
                        onValueChange={(value) => set("routing", value)}
                        disabled={!canManage}
                      >
                        <SelectTrigger aria-label={t("Modalità passaggio operatore")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">
                            {t("Un numero specifico")}
                          </SelectItem>
                          <SelectItem value="first_available">
                            {t("Primo operatore disponibile")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.routing === "first_available" ? (
                      <p className="text-sm leading-6 text-muted-foreground">
                        {t("Usa i numeri con prefisso internazionale già configurati dagli operatori nel centralino. Sceglie un collega libero e presente, evita doppie assegnazioni e gli mostra il motivo. Se nessuno risponde torna all’assistente per il richiamo. Dopo una modifica ai numeri salva di nuovo questa bozza.")}
                      </p>
                    ) : (
                      <div>
                        <Label htmlFor="fish-human-number">
                          {t("Numero dell’operatore")}
                        </Label>
                        <Input
                          id="fish-human-number"
                          value={form.operator}
                          onChange={(e) => set("operator", e.target.value)}
                          placeholder="+39…"
                          disabled={!canManage}
                        />
                      </div>
                    )}
                    {form.routing === "first_available" && (
                      <FishOperatorRules
                        companyId={companyId}
                        agentId={agent.id}
                        value={form}
                        onChange={(patch) =>
                          setForm((old) => ({ ...old, ...patch }))
                        }
                        disabled={!canManage}
                      />
                    )}
                    <p className="text-xs leading-5 text-muted-foreground">
                      {t("Attiva anche Trova un operatore e Richiesta di richiamo. Il trasferimento effettivo richiede una linea collegata che lo supporti.")}
                    </p>
                  </div>
                )}
              </section>
            </div>
          </TabsContent>
          <TabsContent value="simulazioni" className="eic-motion-enter mt-0">
            <div className="mx-auto max-w-4xl">
              <section className={panel}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-md bg-sky-50 p-1.5 text-sky-700 dark:bg-sky-950 dark:text-sky-200">
                    <FlaskConical aria-hidden="true" className="size-4" />
                  </span>
                  <h2 className="text-base font-semibold">
                    {t("Prova il tuo agente")}
                  </h2>
                </div>
                {dirty && (
                  <p className="mb-2 rounded-md bg-orange-50 px-2.5 py-2 text-xs text-orange-900 dark:bg-orange-950/50 dark:text-orange-200">
                    {t("L’anteprima usa la bozza corrente. Salva per provare il dialogo con Fish.")}
                  </p>
                )}
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {localPreview ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/azienda/centralino/collaudo-locale?agente=${encodeURIComponent(agent.id)}`}>
                        <Mic className="mr-1.5 size-4" /> {t("Dialogo di collaudo")}
                      </Link>
                    </Button>
                  ) : <Button
                    size="sm"
                    onClick={() => setLiveOpen(true)}
                    disabled={!ready || dirty}
                    className="eic-motion-button"
                  >
                    <Mic className="mr-1.5 size-4" />
                    {t("Parla con l’agente")}
                  </Button>}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVoiceOpen(true)}
                    disabled={!voiceReady}
                  >
                    <AudioLines className="mr-1.5 size-4" />
                    {t("Ascolta la voce")}
                  </Button>
                </div>
                <details className="mb-3 rounded-lg border px-2.5 py-2">
                  <summary className="cursor-pointer text-xs font-medium">
                    {t("Altre opzioni di prova")}
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCrmOpen(true)}
                      disabled={!ready || dirty}
                    >
                      {t("Prova con un cliente del gestionale")}
                    </Button>
                    {canManage && !binding?.enabled && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={dirty}
                        onClick={() => setOnboardingOpen(true)}
                      >
                        {t("Completa configurazione")}
                      </Button>
                    )}
                  </div>
                </details>
                <FishSimulationPanel
                  onTryVoice={(scenario) => {
                    setVoiceScenario(scenario);
                    setLiveOpen(true);
                  }}
                  companyId={companyId}
                  agentId={agent.id}
                  agent={simulationDraft}
                  remoteReady={ready && !dirty}
                  initialBatchId={binding?.test_batches?.at(-1)}
                  testIds={binding?.test_ids}
                />
              </section>
            </div>
          </TabsContent>
          <TabsContent value="telefonia" className="eic-motion-enter mt-0">
            <div className="mx-auto max-w-4xl">
              <section className={panel}>
                <FishNumberConnectionRequest
                  companyId={companyId}
                  agentId={agent.id}
                  localPreview={localPreview}
                />
              </section>
              {isSuperAdmin && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    {t("Configurazione tecnica della piattaforma")}
                  </summary>
                  <div className="mt-4">
                    <FishAgentPanel companyId={companyId} agentId={agent.id} />
                  </div>
                </details>
              )}
            </div>
          </TabsContent>
          {!historyHref && <TabsContent value="chiamate" className="eic-motion-enter mt-0">
            <section className={panel}>
              <ConversazioniTab agentIdFilter={agent.id} />
            </section>
          </TabsContent>}
        </div>
      </Tabs>
      {onboardingOpen && (
        <FishOnboardingWizard
          key={agent.id}
          open
          existingAgent={agent}
          onClose={() => setOnboardingOpen(false)}
          onSuccess={() => {
            setOnboardingOpen(false);
            client.invalidateQueries({
              queryKey: ["agent-detail", companyId, agent.id],
            });
          }}
        />
      )}
      <Dialog open={crmOpen} onOpenChange={setCrmOpen}>
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("Prova con un cliente del gestionale")}</DialogTitle>
          </DialogHeader>
          {crmOpen && (
            <FishCrmTrialPanel
              companyId={companyId}
              agentId={agent.id}
              ready={ready && !dirty}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={liveOpen} onOpenChange={open => {
        setLiveOpen(open);
        if (!open) onClosePreview?.("voce");
      }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("Parla con il tuo agente")}</DialogTitle>
            <DialogDescription>
              {t("Prova la conversazione al microfono con uno scenario dimostrativo.")}
            </DialogDescription>
          </DialogHeader>
          {liveOpen && (
            <FishLiveVoice
              companyId={companyId}
              agentId={agent.id}
              ready={ready && !dirty}
              initialScenario={voiceScenario}
              availableScenarios={FISH_SCENARIOS.filter((item) => {
                try {
                  if (
                    item.id.startsWith("lead_") &&
                    agent.tools_config?.fish?.flow_id !== "lead_qualification"
                  )
                    return false;
                  const names = enabledFishTools(agent);
                  buildFishSimulation(
                    agent,
                    {
                      fish_agent_id: "preview",
                      tool_ids: Object.fromEntries(
                        names.map((name) => [name, name]),
                      ),
                      transfer_destinations: [],
                    },
                    item.id,
                  );
                  return true;
                } catch {
                  return false;
                }
              }).map((item) => item.id)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={voiceOpen} onOpenChange={open => {
        setVoiceOpen(open);
        if (!open) onClosePreview?.("ascolta");
      }}>
        <DialogContent className="eic-workspace-dialog max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{localPreview ? t("Ascolta Giulia · Drama 3") : t("Prova la voce dell’agente")}</DialogTitle>
            <DialogDescription className="sr-only">{t("Genera e ascolta un esempio di voce Fish Audio.")}</DialogDescription>
          </DialogHeader>
          {dirty && !localPreview && (
            <p className="text-sm text-muted-foreground">
              {t("La prova usa la voce dell’ultima bozza salvata.")}
            </p>
          )}
          <FishVoicePreview
            companyId={companyId}
            agentId={agent.id}
            ready={voiceReady}
            firstMessage={form.first}
            localPreview={localPreview}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
