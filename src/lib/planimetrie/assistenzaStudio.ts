import { supabase } from "@/integrations/supabase/client";
import { leggiRispostaInterprete, type RispostaInterprete } from "../../../shared/planimetrie/interpreteComandi.ts";
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
  // Una proposta con anche un solo comando non applicabile si scarta tutta (per esempio due nomi
  // per la stessa stanza): meglio dirlo così che chiedere «una richiesta più breve» (23/11/2026).
  if (!risposta) throw new Error("Silvio ha proposto una modifica che non posso applicare così com'è. Chiedi una modifica alla volta: prima la divisione con il tramezzo, poi i nomi delle nuove stanze.");
  return risposta;
}

/** Una frase che le regole della chat non capiscono, riscritta da Silvio nei comandi che la chat esegue. */
export async function interpretaComando(companyId: string, richiesta: string, ambienti: readonly string[], vista: "fatto" | "progetto"): Promise<RispostaInterprete> {
  const data = await invocaAssistenza({company_id:companyId,assistenza:"comando",richiesta,ambienti,vista});
  return leggiRispostaInterprete(data.interpretazione) ?? { comandi: [], domanda: "Non ho capito la richiesta. Prova a dirla con il nome della stanza e la misura." };
}
