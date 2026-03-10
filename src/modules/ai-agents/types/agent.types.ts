export type AgentStatus = "draft" | "active" | "archived";

export interface AIAgent {
  id: string;
  company_id: string;
  elevenlabs_agent_id: string | null;
  name: string;
  system_prompt: string;
  first_message: string;
  voice_id: string | null;
  llm_model: string;
  language: string;
  is_interruptible: boolean;
  status: AgentStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Security fields
  domain_whitelist?: string[];
  require_auth?: boolean;
  rate_limit_enabled?: boolean;
  rate_limit_per_minute?: number;
  // Advanced fields
  conversation_timeout?: number;
  max_duration?: number;
  error_message?: string;
  auto_end_on_silence?: boolean;
  silence_timeout?: number;
  send_confirmation_after_booking?: boolean;
  // Tools config
  tools_config?: Record<string, unknown>;
}

export interface AIAgentInsert {
  name: string;
  system_prompt?: string;
  first_message?: string;
  voice_id?: string;
  llm_model?: string;
  language?: string;
  is_interruptible?: boolean;
  status?: AgentStatus;
  agent_type?: "blank" | "personal" | "business";
  website_url?: string;
  objective?: string;
  text_only?: boolean;
}

export interface AIAgentUpdate {
  name?: string;
  system_prompt?: string;
  first_message?: string;
  voice_id?: string;
  llm_model?: string;
  language?: string;
  is_interruptible?: boolean;
  status?: AgentStatus;
  // Security
  domain_whitelist?: string[];
  require_auth?: boolean;
  rate_limit_enabled?: boolean;
  rate_limit_per_minute?: number;
  // Advanced
  conversation_timeout?: number;
  max_duration?: number;
  error_message?: string;
  auto_end_on_silence?: boolean;
  silence_timeout?: number;
  send_confirmation_after_booking?: boolean;
  // Tools
  tools_config?: Record<string, unknown>;
}

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  preview_url: string | null;
}

export interface ElevenLabsModel {
  model_id: string;
  name: string;
  description: string;
  can_do_text_to_speech: boolean;
}

export interface LLMOption {
  id: string;
  name: string;
  provider: string;
  latency: "low" | "medium" | "high";
  cost: "low" | "medium" | "high";
}

export const LLM_OPTIONS: LLMOption[] = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google", latency: "low", cost: "low" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", latency: "medium", cost: "medium" },
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", latency: "medium", cost: "medium" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", latency: "low", cost: "low" },
  { id: "claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic", latency: "medium", cost: "medium" },
  { id: "claude-3.5-haiku", name: "Claude 3.5 Haiku", provider: "Anthropic", latency: "low", cost: "low" },
];

export const LANGUAGE_OPTIONS = [
  { code: "it", label: "Italiano" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "ro", label: "Română" },
  { code: "ar", label: "العربية" },
];

export type ProxyAction =
  | "create_agent"
  | "get_agent"
  | "list_agents"
  | "update_agent"
  | "delete_agent"
  | "get_voices"
  | "get_models"
  | "add_kb_doc"
  | "remove_kb_doc"
  | "list_kb_docs"
  | "sync_kb"
  | "link_phone_number";
