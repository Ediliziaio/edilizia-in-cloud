import { FISH_FLOW_PRESETS, fishFlowPrompt } from "./fishFlows";
import type { UnifiedAgentInsert } from "@/types/unifiedAgent.types";

export const FISH_DEFAULT_VOICE = "081b06713d084d4da1724846b52832ac";
export const onboardingPhone = (value:string) => value.replace(/[\s().-]/g,"");
export type FishOnboardingValues = { name: string; flowId: string; calendarId: string; operatorNumber: string; greeting: string; expressive: boolean };
export function fishOnboardingInput(values: FishOnboardingValues): UnifiedAgentInsert {
  const flow=FISH_FLOW_PRESETS.find(item=>item.id===values.flowId);
  if(!flow || !values.name.trim())throw new Error("Scegli un’attività e il nome dell’assistente.");
  const operator=onboardingPhone(values.operatorNumber);
  if(operator && !/^\+[1-9]\d{7,14}$/.test(operator))throw new Error("Scrivi il numero dell’operatore con il prefisso internazionale, per esempio +39.");
  return { nome:values.name.trim(),tipo:"vocale",descrizione:flow.description,system_prompt:fishFlowPrompt(flow.id),primo_messaggio:values.greeting.trim() || "Buongiorno, sono l’assistente virtuale dell’azienda. Come posso aiutarla?",lingua:"it",llm_model:"google/gemini-3.6-flash",voice_nome:"Voce Riflessiva · italiano",registra_chiamate:false,trascrivi_chiamate:true,durata_max_secondi:300,
    tools_config:{voice_provider:"fish_audio",fish:{voice_id:FISH_DEFAULT_VOICE,calendar_id:values.calendarId || null,timezone:"Europe/Rome",routing:["operator","lead_qualification"].includes(flow.id)?"first_available":"fixed",flow_id:flow.id,onboarding_version:1,voice:{expressive:values.expressive,speed:1.05,effect:"none",background_sound:{preset:"off",volume:0.08}}},edilizia_tools:Object.fromEntries(flow.tools.map(id=>[id,{enabled:true}])),system_tools:{transfer_number:["operator","lead_qualification"].includes(flow.id) || !!operator},trasferimento:{numero:operator}} };
}
export const connectionStatusLabel:Record<string,string>={requested:"Richiesta inviata",in_review:"In verifica",awaiting_company:"Servono informazioni",ready:"Linea pronta",cancelled:"Richiesta chiusa"};
