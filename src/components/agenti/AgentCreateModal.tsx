import { useEffect, useState, useMemo } from "react";
import { ELEVENLABS_VOICES_IT } from "@/constants/elevenlabsVoices";
import { VOICE_AGENT_TEMPLATES } from "@/lib/voice-agent-templates";

/** Nome canonico dello strumento (come nei prompt) → id del toggle in UI. */
const CANONICO_A_UI: Record<string, string> = {
  info_cliente: "get_lead_info", stato_consegna: "stato_consegna", stato_preventivo: "stato_preventivo",
  fissa_appuntamento: "create_appointment", disponibilita: "get_availability", crea_ticket: "crea_ticket",
  richiesta_richiamo: "assign_to_user", info_prodotto: "search_products",
};
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Phone,
  MessageSquare,
  Users,
  Megaphone,
  ArrowLeft,
  ArrowRight,
  Check,
  Bot,
  Mic,
  Palette,
} from "lucide-react";
import { useCreateUnifiedAgent } from "@/hooks/useUnifiedAgents";
import type { TipoAgente, UnifiedAgentInsert } from "@/types/unifiedAgent.types";
import { LANGUAGE_OPTIONS } from "@/modules/ai-agents/types/agent.types";
import { Badge } from "@/components/ui/badge";

// ─── Type card definitions ───
const TIPO_OPTIONS: { value: TipoAgente; label: string; icon: typeof Phone; desc: string; examples: string }[] = [
  { value: "vocale", label: "Vocale", icon: Phone, desc: "Gestisce chiamate in/out via AI", examples: "Assistente clienti, prenotazioni, qualificazione lead" },
  { value: "chat", label: "Chat", icon: MessageSquare, desc: "Widget chat per il sito web", examples: "Supporto live, FAQ, raccolta contatti" },
  { value: "whatsapp", label: "WhatsApp", icon: MessageSquare, desc: "Bot per WhatsApp Business", examples: "Notifiche, supporto, ordini" },
  { value: "interno", label: "Interno", icon: Users, desc: "Assistente AI per il team", examples: "Ricerca documenti, FAQ interne, onboarding" },
  { value: "campagna", label: "Campagna", icon: Megaphone, desc: "Outbound automatizzato", examples: "Follow-up, recall, sondaggi" },
];

// ─── Purpose chips with default prompts ───
const PURPOSE_OPTIONS: Record<TipoAgente, { id: string; label: string; prompt: string }[]> = {
  vocale: [
    { id: "assistenza", label: "Assistenza clienti", prompt: "Sei un assistente vocale professionale per l'assistenza clienti. Rispondi in modo cortese, risolvi i problemi e, se necessario, trasferisci la chiamata a un operatore umano." },
    { id: "prenotazioni", label: "Prenotazioni", prompt: "Sei un assistente vocale specializzato nella gestione delle prenotazioni. Raccogli data, ora e tipo di servizio richiesto, conferma la disponibilità e fissa l'appuntamento." },
    { id: "qualificazione", label: "Qualificazione lead", prompt: "Sei un assistente vocale per la qualificazione dei lead. Fai domande per capire le esigenze del potenziale cliente, raccogli i dati di contatto e valuta il livello di interesse." },
  ],
  chat: [
    { id: "supporto", label: "Supporto", prompt: "Sei un assistente chat per il supporto clienti. Rispondi alle domande frequenti, guida l'utente nella risoluzione dei problemi e raccogli feedback." },
    { id: "lead", label: "Raccolta contatti", prompt: "Sei un assistente chat per la raccolta di contatti. Presenta i servizi dell'azienda, rispondi alle domande e raccogli nome, email e telefono del visitatore." },
    { id: "faq", label: "FAQ automatiche", prompt: "Sei un assistente chat specializzato nelle FAQ. Rispondi alle domande più frequenti in modo preciso e conciso, utilizzando la knowledge base aziendale." },
  ],
  whatsapp: [
    { id: "notifiche", label: "Notifiche", prompt: "Sei un bot WhatsApp per l'invio di notifiche e aggiornamenti ai clienti. Comunica in modo chiaro e conciso." },
    { id: "ordini", label: "Gestione ordini", prompt: "Sei un bot WhatsApp per la gestione degli ordini. Aiuta i clienti a verificare lo stato degli ordini, effettuare resi e richiedere assistenza." },
  ],
  interno: [
    { id: "knowledge", label: "Knowledge base", prompt: "Sei un assistente interno per il team. Rispondi alle domande utilizzando la documentazione aziendale e aiuta i colleghi a trovare le informazioni di cui hanno bisogno." },
    { id: "onboarding", label: "Onboarding", prompt: "Sei un assistente per l'onboarding dei nuovi membri del team. Guida i nuovi colleghi attraverso le procedure aziendali e rispondi alle loro domande." },
  ],
  campagna: [
    { id: "followup", label: "Follow-up", prompt: "Sei un agente per campagne di follow-up telefonico. Ricontatta i clienti che hanno mostrato interesse, rispondi alle domande e cerca di fissare un appuntamento." },
    { id: "sondaggio", label: "Sondaggi", prompt: "Sei un agente per sondaggi telefonici. Fai le domande del sondaggio in modo naturale, registra le risposte e ringrazia il partecipante." },
  ],
};

// ─── Steps config per tipo ───
type StepId = "tipo" | "identita" | "voce" | "comportamento" | "chat_config" | "review";

const STEPS_PER_TIPO: Record<TipoAgente, StepId[]> = {
  vocale: ["tipo", "identita", "voce", "comportamento", "review"],
  chat: ["tipo", "identita", "chat_config", "review"],
  whatsapp: ["tipo", "identita", "review"],
  interno: ["tipo", "identita", "review"],
  campagna: ["tipo", "identita", "voce", "review"],
};

const STEP_LABELS: Record<StepId, string> = {
  tipo: "Tipo",
  identita: "Identità",
  voce: "Voce",
  comportamento: "Comportamento",
  chat_config: "Widget Chat",
  review: "Riepilogo",
};

// ─── Wizard state ───
interface WizardState {
  tipo: TipoAgente;
  nome: string;
  scopo: string;
  system_prompt: string;
  primo_messaggio: string;
  /** Strumenti (nomi canonici) portati dal template scelto. */
  strumenti: string[];
  lingua: string;
  temperatura: number;
  voice_id: string;
  voice_nome: string;
  risposta_automatica: boolean;
  registra_chiamate: boolean;
  trascrivi_chiamate: boolean;
  rileva_segreteria: boolean;
  squillo_max: number;
  durata_max: number;
  widget_titolo: string;
  widget_colore: string;
  widget_posizione: string;
  descrizione: string;
}

const INITIAL_STATE: WizardState = {
  tipo: "vocale",
  nome: "",
  scopo: "",
  system_prompt: "",
  primo_messaggio: "",
  strumenti: [],
  lingua: "it",
  temperatura: 0.7,
  voice_id: "",
  voice_nome: "",
  risposta_automatica: true,
  registra_chiamate: true,
  trascrivi_chiamate: true,
  rileva_segreteria: true,
  squillo_max: 6,
  durata_max: 300,
  widget_titolo: "Assistente AI",
  widget_colore: "#3B82F6",
  widget_posizione: "bottom-right",
  descrizione: "",
};

interface Props {
  open: boolean;
  tipoPreselezionato?: TipoAgente | null;
  onClose: () => void;
  onSuccess: (id: string) => void;
}

export function AgentCreateModal({ open, tipoPreselezionato, onClose, onSuccess }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [state, setState] = useState<WizardState>(() => ({
    ...INITIAL_STATE,
    tipo: tipoPreselezionato || "vocale",
  }));

  const createAgent = useCreateUnifiedAgent();

  const steps = useMemo(() => STEPS_PER_TIPO[state.tipo], [state.tipo]);
  const stepId = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;
  const isLastStep = currentStep === steps.length - 1;
  const isIdentityReady = state.nome.trim().length > 0 && state.system_prompt.trim().length >= 20;

  const update = (patch: Partial<WizardState>) => setState((s) => ({ ...s, ...patch }));

  const canNext = (): boolean => {
    switch (stepId) {
      case "tipo": return true;
      case "identita": return isIdentityReady;
      case "review": return isIdentityReady;
      default: return true;
    }
  };

  const handleNext = () => {
    if (isLastStep) {
      handleCreate();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  };

  const handleCreate = () => {
    const input: UnifiedAgentInsert = {
      nome: state.nome.trim(),
      tipo: state.tipo,
      descrizione: state.descrizione.trim() || state.scopo || undefined,
      system_prompt: state.system_prompt || undefined,
      primo_messaggio: state.primo_messaggio || undefined,
      lingua: state.lingua,
      llm_model: "gemini-2.5-flash",
      elevenlabs_voice_id: state.voice_id || undefined,
      tools_config: state.strumenti.length
        ? { edilizia_tools: Object.fromEntries(state.strumenti.map((c) => [CANONICO_A_UI[c] ?? c, { enabled: true, webhook_url: "" }])) }
        : undefined,
      temperatura: state.temperatura,
      voice_nome: state.voice_nome || undefined,
      // Vocal behavior
      risposta_automatica: state.risposta_automatica,
      registra_chiamate: state.registra_chiamate,
      trascrivi_chiamate: state.trascrivi_chiamate,
      rileva_segreteria: state.rileva_segreteria,
      squillo_max: state.squillo_max,
      durata_max_secondi: state.durata_max,
      // Chat widget
      widget_titolo: state.widget_titolo || undefined,
      widget_colore: state.widget_colore || undefined,
      widget_posizione: state.widget_posizione || undefined,
    };
    createAgent.mutate(input, {
      onSuccess: (data) => {
        resetWizard();
        onSuccess(data.id);
      },
    });
  };

  const resetWizard = () => {
    setCurrentStep(0);
    setState({ ...INITIAL_STATE, tipo: tipoPreselezionato || "vocale" });
  };

  useEffect(() => {
    if (!open) return;
    setCurrentStep(0);
    setState({ ...INITIAL_STATE, tipo: tipoPreselezionato || "vocale" });
  }, [open, tipoPreselezionato]);

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      resetWizard();
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Nuovo agente AI
          </DialogTitle>
        </DialogHeader>

        {/* Progress */}
        <div className="space-y-2">
          <Progress value={progress} className="h-1.5" />
          <div className="flex items-center gap-1">
            {steps.map((s, i) => (
              <button
                key={s}
                onClick={() => i < currentStep && setCurrentStep(i)}
                className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full transition-all ${
                  i === currentStep
                    ? "bg-primary text-primary-foreground"
                    : i < currentStep
                      ? "bg-primary/10 text-primary cursor-pointer"
                      : "text-muted-foreground"
                }`}
              >
                {i < currentStep ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
                <span className="hidden sm:inline">{STEP_LABELS[s]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="py-2 min-h-[280px]">
          {stepId === "tipo" && <StepTipo state={state} update={update} onSelectAndNext={() => setCurrentStep(1)} />}
          {stepId === "identita" && <StepIdentita state={state} update={update} />}
          {stepId === "voce" && <StepVoce state={state} update={update} />}
          {stepId === "comportamento" && <StepComportamento state={state} update={update} />}
          {stepId === "chat_config" && <StepChatConfig state={state} update={update} />}
          {stepId === "review" && <StepReview state={state} />}
        </div>

        <DialogFooter className="gap-2">
          {currentStep > 0 && (
            <Button variant="outline" onClick={handleBack} disabled={createAgent.isPending}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Indietro
            </Button>
          )}
          <Button onClick={handleNext} disabled={!canNext() || createAgent.isPending}>
            {createAgent.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {isLastStep ? (
              <>Crea agente</>
            ) : (
              <>Avanti <ArrowRight className="h-4 w-4 ml-1" /></>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════
// Step Components
// ═══════════════════════════════════════

function StepTipo({ state, update, onSelectAndNext }: { state: WizardState; update: (p: Partial<WizardState>) => void; onSelectAndNext: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Seleziona il tipo di agente che vuoi creare.</p>
      <div className="grid grid-cols-1 gap-2">
        {TIPO_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const selected = state.tipo === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                update({ tipo: opt.value });
                onSelectAndNext();
              }}
              className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30 hover:bg-accent/50"
              }`}
            >
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${selected ? "bg-primary/15" : "bg-muted"}`}>
                <Icon className={`h-5 w-5 ${selected ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="min-w-0">
                <span className="font-semibold text-sm text-foreground">{opt.label}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-1 italic">{opt.examples}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepIdentita({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  // Per gli agenti che parlano al telefono i preset generici producono agenti
  // generici: qui entrano i 6 mestieri edilizia gia' scritti coi 6 blocchi
  // ElevenLabs, che portano con se' primo messaggio e strumenti da abilitare.
  const purposes = (state.tipo === "vocale" || state.tipo === "campagna")
    ? VOICE_AGENT_TEMPLATES
        .filter((t) => (state.tipo === "campagna" ? t.direzione === "outbound" : true))
        .map((t) => ({ id: t.id, label: t.nome, prompt: t.systemPrompt, primo: t.primoMessaggio, strumenti: t.strumenti }))
    : (PURPOSE_OPTIONS[state.tipo] || []).map((p) => ({ ...p, primo: "", strumenti: [] as string[] }));
  const promptLength = state.system_prompt.trim().length;
  const promptReady = promptLength >= 20;

  const handlePurposeSelect = (purposeId: string) => {
    const p = purposes.find((x) => x.id === purposeId);
    if (p) {
      update({
        scopo: p.label,
        system_prompt: state.system_prompt || p.prompt,
        primo_messaggio: state.primo_messaggio || p.primo || "",
        strumenti: p.strumenti,
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <Label htmlFor="wizard-name">Nome agente *</Label>
        <Input
          id="wizard-name"
          placeholder="Es: Assistente Clienti"
          value={state.nome}
          onChange={(e) => update({ nome: e.target.value })}
          autoFocus
        />
      </div>

      {/* Purpose chips */}
      <div>
        <Label>Scopo</Label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {purposes.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePurposeSelect(p.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                state.scopo === p.label
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground hover:border-primary/30"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* System prompt */}
      <div>
        <Label>Prompt di sistema</Label>
        <Textarea
          placeholder="Istruzioni per il comportamento dell'agente..."
          value={state.system_prompt}
          onChange={(e) => update({ system_prompt: e.target.value })}
          rows={4}
          className="text-xs"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Usa {"{{nome_azienda}}"}, {"{{nome_cliente}}"} come variabili dinamiche.
        </p>
        {!promptReady && (
          <p className="text-[10px] text-destructive mt-1">
            Inserisci almeno 20 caratteri di istruzioni: evita agenti senza comportamento definito.
          </p>
        )}
      </div>

      {/* First message */}
      <div>
        <Label>Primo messaggio</Label>
        <Input
          placeholder="Ciao! Come posso aiutarti?"
          value={state.primo_messaggio}
          onChange={(e) => update({ primo_messaggio: e.target.value })}
        />
      </div>

      {/* Language */}
      <div>
        <Label>Lingua</Label>
        <Select value={state.lingua} onValueChange={(v) => update({ lingua: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGE_OPTIONS.map((l) => (
              <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Description */}
      <div>
        <Label>Descrizione (opzionale)</Label>
        <Input
          placeholder="Breve descrizione..."
          value={state.descrizione}
          onChange={(e) => update({ descrizione: e.target.value })}
        />
      </div>
    </div>
  );
}

function StepVoce({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  const voices = ELEVENLABS_VOICES_IT;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Seleziona la voce per il tuo agente.</p>

      <div className="grid grid-cols-2 gap-2">
        {voices.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => update({ voice_id: v.id, voice_nome: v.name })}
            className={`flex items-center gap-2.5 p-3 rounded-lg border-2 text-left transition-all ${
              state.voice_id === v.id
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/30"
            }`}
          >
            <div className={`h-8 w-8 rounded-full flex items-center justify-center ${state.voice_id === v.id ? "bg-primary/15" : "bg-muted"}`}>
              <Mic className={`h-3.5 w-3.5 ${state.voice_id === v.id ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <div>
              <span className="text-sm font-medium text-foreground">{v.name}</span>
              <p className="text-[10px] text-muted-foreground">{v.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Temperatura */}
      <div>
        <Label>Temperatura: {state.temperatura.toFixed(1)}</Label>
        <Slider
          value={[state.temperatura]}
          onValueChange={([v]) => update({ temperatura: v })}
          min={0}
          max={1}
          step={0.1}
          className="mt-2"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>Preciso</span>
          <span>Creativo</span>
        </div>
      </div>
    </div>
  );
}

function StepComportamento({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Configura il comportamento avanzato dell'agente vocale.</p>

      <div className="space-y-3">
        <ToggleRow label="Risposta automatica" desc="L'agente risponde automaticamente alle chiamate" checked={state.risposta_automatica} onChange={(v) => update({ risposta_automatica: v })} />
        <ToggleRow label="Registra chiamate" desc="Salva audio delle conversazioni" checked={state.registra_chiamate} onChange={(v) => update({ registra_chiamate: v })} />
        <ToggleRow label="Trascrivi chiamate" desc="Genera trascrizione automatica" checked={state.trascrivi_chiamate} onChange={(v) => update({ trascrivi_chiamate: v })} />
        <ToggleRow label="Rileva segreteria" desc="Riconosce e gestisce le segreterie telefoniche" checked={state.rileva_segreteria} onChange={(v) => update({ rileva_segreteria: v })} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Squilli max</Label>
          <Input
            type="number"
            value={state.squillo_max}
            onChange={(e) => update({ squillo_max: parseInt(e.target.value) || 6 })}
            min={1}
            max={20}
          />
        </div>
        <div>
          <Label>Durata max (sec)</Label>
          <Input
            type="number"
            value={state.durata_max}
            onChange={(e) => update({ durata_max: parseInt(e.target.value) || 300 })}
            min={30}
            max={3600}
          />
        </div>
      </div>
    </div>
  );
}

function StepChatConfig({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  const colorPresets = ["#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444", "#EC4899"];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Configura l'aspetto del widget chat.</p>

      <div>
        <Label>Titolo widget</Label>
        <Input
          value={state.widget_titolo}
          onChange={(e) => update({ widget_titolo: e.target.value })}
          placeholder="Assistente AI"
        />
      </div>

      <div>
        <Label>Colore</Label>
        <div className="flex items-center gap-2 mt-1">
          {colorPresets.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => update({ widget_colore: c })}
              className={`h-8 w-8 rounded-full border-2 transition-all ${
                state.widget_colore === c ? "border-foreground scale-110" : "border-transparent"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <div className="flex items-center gap-1 ml-2">
            <Palette className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="color"
              value={state.widget_colore}
              onChange={(e) => update({ widget_colore: e.target.value })}
              className="h-8 w-8 rounded cursor-pointer border-0"
            />
          </div>
        </div>
      </div>

      <div>
        <Label>Posizione</Label>
        <Select value={state.widget_posizione} onValueChange={(v) => update({ widget_posizione: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bottom-right">In basso a destra</SelectItem>
            <SelectItem value="bottom-left">In basso a sinistra</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function StepReview({ state }: { state: WizardState }) {
  const tipoCfg = TIPO_OPTIONS.find((t) => t.value === state.tipo)!;
  const Icon = tipoCfg.icon;
  const promptReady = state.system_prompt.trim().length >= 20;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Rivedi la configurazione prima di creare l'agente.</p>

      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{state.nome || "—"}</h3>
            <Badge variant="secondary" className="text-[10px] mt-0.5">
              {tipoCfg.label} · {state.lingua.toUpperCase()}
            </Badge>
          </div>
        </div>

        {state.scopo && (
          <ReviewRow label="Scopo" value={state.scopo} />
        )}
        {state.system_prompt && (
          <ReviewRow label="Prompt" value={state.system_prompt.substring(0, 120) + (state.system_prompt.length > 120 ? "..." : "")} />
        )}
        {state.voice_nome && (
          <ReviewRow label="Voce" value={state.voice_nome} />
        )}
        {state.descrizione && (
          <ReviewRow label="Descrizione" value={state.descrizione} />
        )}

        <div className="pt-2 border-t border-border">
          <p className="text-[11px] text-muted-foreground">
            L'agente verrà creato come <strong>bozza</strong>. Potrai attivarlo dopo aver completato la configurazione.
          </p>
          {!promptReady && (
            <p className="text-[11px] text-destructive mt-1">
              Completa il prompt di sistema prima di creare l'agente.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ───

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div>
        <span className="text-sm font-medium text-foreground">{label}</span>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
