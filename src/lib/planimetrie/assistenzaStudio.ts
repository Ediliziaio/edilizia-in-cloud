import { supabase } from "@/integrations/supabase/client";
import { leggiRispostaChatProgetto, type ContestoChatProgetto, type MessaggioChatProgetto } from "../../../shared/planimetrie/chatProgetto.ts";
import {
  leggiRispostaFrazionamento, leggiRispostaUrbanistica, type AlternativaFrazionamento,
} from "../../../shared/planimetrie/assistenzaStudio.ts";

async function invocaAssistenza(body: Record<string,unknown>) {
  const { data,error } = await supabase.functions.invoke("planimetria-genera",{body});
  if (error) {
    const risposta: {messaggio?:string} | null = error.context instanceof Response ? await error.context.json().catch((): null=>null) : null;
    throw new Error(risposta?.messaggio || "L’assistenza AI non è disponibile in questo momento.");
  }
  if (!data?.success) throw new Error(data?.messaggio || "L’assistenza AI non è disponibile in questo momento.");
  return data;
}

export async function chiediFrazionamento(companyId: string, richiesta: string, alternative: AlternativaFrazionamento[]) {
  const data = await invocaAssistenza({company_id:companyId,assistenza:"frazionamento",richiesta,alternative});
  return leggiRispostaFrazionamento(data,alternative);
}

export async function cercaRegoleNellEstratto(companyId: string, estratto: string) {
  const data = await invocaAssistenza({company_id:companyId,assistenza:"norme",estratto});
  return leggiRispostaUrbanistica(data,estratto);
}

export async function chiediSulProgetto(companyId: string, richiesta: string, contesto: ContestoChatProgetto, cronologia: MessaggioChatProgetto[]) {
  const data = await invocaAssistenza({company_id:companyId,assistenza:"chat-progetto",richiesta,contesto,cronologia});
  const risposta = leggiRispostaChatProgetto(data.risposta, contesto);
  if (!risposta) throw new Error("La risposta non contiene una proposta leggibile. Riprova con una richiesta più breve.");
  return risposta;
}
