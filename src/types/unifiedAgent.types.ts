export type TipoAgente = "vocale" | "chat" | "whatsapp" | "interno" | "campagna";
export type StatoAgente = "bozza" | "attivo" | "pausa" | "archiviato";

export interface UnifiedAgent {
  id: string;
  company_id: string;
  nome: string;
  descrizione: string | null;
  tipo: TipoAgente;
  avatar_url: string | null;
  stato: StatoAgente;
  system_prompt: string | null;
  primo_messaggio: string | null;
  lingua: string;
  temperatura: number;
  elevenlabs_agent_id: string | null;
  elevenlabs_voice_id: string | null;
  voice_nome: string | null;
  llm_model: string;
  enabled_tools: string[] | null;
  tools_config: Record<string, unknown> | null;
  chiamate_totali: number;
  chiamate_completate: number;
  minuti_totali: number;
  chat_totali: number;
  costo_totale_crediti: number;
  creato_il: string;
  aggiornato_il: string;
  creato_da: string | null;
}

export interface UnifiedAgentInsert {
  nome: string;
  tipo: TipoAgente;
  descrizione?: string;
  system_prompt?: string;
  primo_messaggio?: string;
  lingua?: string;
  llm_model?: string;
  elevenlabs_voice_id?: string;
}

export interface UnifiedAgentUpdate {
  nome?: string;
  descrizione?: string;
  stato?: StatoAgente;
  system_prompt?: string;
  primo_messaggio?: string;
  lingua?: string;
  temperatura?: number;
  elevenlabs_voice_id?: string;
  voice_nome?: string;
  llm_model?: string;
  enabled_tools?: string[];
  tools_config?: Record<string, unknown>;
}

export interface AICompanyStats {
  agenti_attivi: number;
  conv_totali: number;
  minuti_totali: number;
  chat_totali: number;
  tasso_risposta: number;
  crediti_usati: number;
}
