import { FISH_PUBLIC_VOICES } from "../../supabase/functions/_shared/fishVoiceCatalog";
import { FISH_FLOW_PRESETS, fishFlowPrompt } from "./fishFlows";
import type { UnifiedAgentInsert } from "@/types/unifiedAgent.types";

export const FISH_DEFAULT_VOICE = "081b06713d084d4da1724846b52832ac";
export const onboardingPhone = (value: string) =>
  value.replace(/[\s().-]/g, "");
export const fishUsesAvailableOperators = (flowId: string) =>
  flowId === "operator" || flowId === "lead_qualification";

export function fishDefaultGreeting(flowId: string, companyName?: string) {
  const company = companyName?.trim().replace(/[.!?]+$/, "");
  const intro = `Buongiorno, sono l’assistente virtuale ${company ? `di ${company}` : "dell’azienda"}.`;
  return flowId === "lead_qualification" || flowId === "sales_outbound"
    ? `${intro} La chiamo per la sua richiesta. È un buon momento?`
    : `${intro} Come posso aiutarla?`;
}

export type FishOnboardingValues = {
  name: string;
  flowId: string;
  calendarId: string;
  operatorNumber: string;
  greeting: string;
  expressive: boolean;
  voiceId?: string;
};
export function fishOnboardingInput(
  values: FishOnboardingValues,
): UnifiedAgentInsert {
  const flow = FISH_FLOW_PRESETS.find((item) => item.id === values.flowId);
  if (!flow || !values.name.trim())
    throw new Error("Scegli un’attività e il nome dell’assistente.");
  if (values.flowId === "support_appointment" && !values.calendarId)
    throw new Error(
      "Scegli il calendario per completare il flusso di assistenza.",
    );
  const voice = FISH_PUBLIC_VOICES.find(
    ({ id }) => id === (values.voiceId || FISH_DEFAULT_VOICE),
  );
  if (!voice) throw new Error("Scegli una voce disponibile.");
  const availableOperators = fishUsesAvailableOperators(flow.id);
  const operator = availableOperators
    ? ""
    : onboardingPhone(values.operatorNumber);
  if (operator && !/^\+[1-9]\d{7,14}$/.test(operator))
    throw new Error(
      "Scrivi il numero dell’operatore con il prefisso internazionale, per esempio +39.",
    );
  return {
    nome: values.name.trim(),
    tipo: "vocale",
    descrizione: flow.description,
    system_prompt: fishFlowPrompt(flow.id),
    primo_messaggio: values.greeting.trim() || fishDefaultGreeting(flow.id),
    lingua: "it",
    llm_model: "google/gemini-3.6-flash",
    voice_nome: voice.name,
    registra_chiamate: false,
    trascrivi_chiamate: true,
    durata_max_secondi: 300,
    tools_config: {
      voice_provider: "fish_audio",
      fish: {
        voice_id: voice.id,
        calendar_id: flow.tools.includes("create_appointment")
          ? values.calendarId || null
          : null,
        timezone: "Europe/Rome",
        routing: availableOperators ? "first_available" : "fixed",
        flow_id: flow.id,
        onboarding_version: 1,
        voice: {
          expressive: values.expressive,
          speed: 1.05,
          effect: "none",
          background_sound: { preset: "off", volume: 0.08 },
        },
      },
      edilizia_tools: Object.fromEntries(
        flow.tools.map((id) => [id, { enabled: true }]),
      ),
      system_tools: {
        transfer_number: availableOperators || !!operator,
      },
      trasferimento: { numero: operator },
    },
  };
}
const scenarioByFlow = new Map([
  ["appointment", "appointment"],
  ["support", "support"],
  ["support_appointment", "support"],
  ["orders", "order"],
  ["callback", "no_operator"],
  ["operator", "handoff_no_answer"],
  ["lead_qualification", "lead_appointment"],
  ["sales_outbound", "sales_outbound"],
]);
export const fishScenarioForFlow = (flowId: string) =>
  scenarioByFlow.get(flowId) ?? "natural_service";

export const connectionStatusLabel: Record<string, string> = {
  requested: "Richiesta inviata",
  in_review: "In verifica",
  awaiting_company: "Servono informazioni",
  ready: "Verifica completata",
  cancelled: "Richiesta chiusa",
};
