export type InternalAgentType = "customer_service" | "payment_reminder" | "work_coordinator" | "survey" | "after_sales" | "custom";
export type InternalAgentStatus = "draft" | "active" | "archived";

export interface InternalAgent {
  id: string;
  company_id: string;
  elevenlabs_agent_id: string | null;
  name: string;
  agent_type: InternalAgentType;
  system_prompt: string;
  first_message: string;
  voice_id: string;
  llm_model: string;
  language: string;
  is_interruptible: boolean;
  status: InternalAgentStatus;
  enabled_tools: string[];
  tools_config: Record<string, unknown>;
  max_duration: number | null;
  silence_timeout: number | null;
  error_message: string | null;
  phone_number_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InternalAgentInsert {
  name: string;
  agent_type?: InternalAgentType;
  system_prompt?: string;
  first_message?: string;
  voice_id?: string;
  llm_model?: string;
  language?: string;
}

export interface InternalAgentUpdate {
  name?: string;
  agent_type?: InternalAgentType;
  system_prompt?: string;
  first_message?: string;
  voice_id?: string;
  llm_model?: string;
  language?: string;
  is_interruptible?: boolean;
  status?: InternalAgentStatus;
  enabled_tools?: string[];
  tools_config?: Record<string, unknown>;
  max_duration?: number;
  silence_timeout?: number;
  error_message?: string;
  phone_number_id?: string | null;
}

// Campaign types
export type CampaignType = "payment_reminder" | "survey" | "follow_up" | "custom";
export type CampaignStatus = "draft" | "scheduled" | "running" | "completed" | "paused";
export type CampaignTargetType = "manual" | "filter";

export interface InternalCampaign {
  id: string;
  company_id: string;
  agent_id: string;
  name: string;
  campaign_type: CampaignType;
  status: CampaignStatus;
  target_type: CampaignTargetType;
  contact_ids: string[] | null;
  filter_config: Record<string, unknown> | null;
  dynamic_vars: Record<string, unknown> | null;
  calls_per_minute: number;
  total_calls: number;
  calls_answered: number;
  calls_failed: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
}

export interface InternalCampaignInsert {
  name: string;
  agent_id: string;
  campaign_type?: CampaignType;
  target_type?: CampaignTargetType;
  contact_ids?: string[];
  filter_config?: Record<string, unknown>;
  dynamic_vars?: Record<string, unknown>;
  calls_per_minute?: number;
  scheduled_at?: string | null;
}

export const CAMPAIGN_TYPE_OPTIONS: { value: CampaignType; label: string; description: string }[] = [
  { value: "payment_reminder", label: "Sollecito Pagamenti", description: "Campagna per solleciti pagamento scaduti" },
  { value: "survey", label: "Survey Soddisfazione", description: "Raccolta feedback post-lavori" },
  { value: "follow_up", label: "Follow-up Commerciale", description: "Ricontatto commerciale o post-vendita" },
  { value: "custom", label: "Personalizzata", description: "Campagna con configurazione custom" },
];

export const AGENT_TYPE_OPTIONS: { value: InternalAgentType; label: string; description: string }[] = [
  { value: "customer_service", label: "Assistente Clienti", description: "Risponde alle domande dei clienti su ordini, date lavori e pagamenti" },
  { value: "payment_reminder", label: "Sollecito Pagamenti", description: "Contatta i clienti per solleciti pagamento scaduti" },
  { value: "work_coordinator", label: "Coordinatore Lavori", description: "Gestisce conferme e promemoria per date lavori" },
  { value: "survey", label: "Survey Soddisfazione", description: "Raccoglie feedback post-completamento lavori" },
  { value: "after_sales", label: "Post-Vendita", description: "Assistenza post-vendita e manutenzione" },
  { value: "custom", label: "Personalizzato", description: "Agente con configurazione completamente personalizzata" },
];

export const CRM_TOOLS = [
  { id: "identify_caller", label: "Identifica Chiamante", description: "Riconosce il cliente dal numero di telefono", category: "read" },
  { id: "get_client_info", label: "Info Cliente", description: "Recupera profilo completo del cliente", category: "read" },
  { id: "get_order_status", label: "Stato Ordine", description: "Stato, date lavori e importi dell'ordine", category: "read" },
  { id: "get_orders_list", label: "Lista Ordini", description: "Tutti gli ordini attivi del cliente", category: "read" },
  { id: "get_appointment_info", label: "Appuntamenti", description: "Prossimi appuntamenti del cliente", category: "read" },
  { id: "create_note", label: "Crea Nota", description: "Aggiunge una nota al contatto CRM", category: "create" },
  { id: "create_activity", label: "Crea Attività", description: "Crea un task assegnato al responsabile", category: "create" },
  { id: "update_order_date", label: "Aggiorna Data Lavori", description: "Modifica la data programmata dei lavori", category: "update" },
  { id: "send_sms_confirmation", label: "Invia SMS", description: "Invia SMS di conferma via Telnyx", category: "send" },
  { id: "create_support_ticket", label: "Crea Segnalazione", description: "Crea un reclamo/segnalazione", category: "create" },
  { id: "schedule_callback", label: "Programma Richiamo", description: "Programma un appuntamento di richiamo", category: "create" },
] as const;
