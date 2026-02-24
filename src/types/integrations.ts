// Types for the Meta Lead Ads integration module

export type IntegrationProvider = "meta";

export type IntegrationStatus = "connected" | "disconnected" | "error" | "token_expired";

export type IntegrationHealth = "ok" | "warn" | "critical";

export type MetaAssetType = "business" | "ad_account" | "page" | "instagram_account";

export type LeadFormSyncMode = "new_only" | "all_leads" | "since_date";

export type LeadFormStatus = "active" | "inactive";

export type DedupePolicy = "email" | "phone" | "email_or_phone";

export type UpdatePolicy = "create_only" | "upsert" | "overwrite_non_empty";

export type WebhookEventStatus = "pending" | "processed" | "failed";

export type SyncJobStatus = "queued" | "running" | "success" | "failed";

export type SyncJobType = "pull_leads" | "backfill" | "refresh_assets" | "renew_token";

export interface Integration {
  id: string;
  company_id: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  connected_by: string | null;
  last_sync_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  health: IntegrationHealth;
  created_at: string;
  updated_at: string;
}

export interface MetaAsset {
  id: string;
  integration_id: string;
  company_id: string;
  asset_type: MetaAssetType;
  asset_id: string;
  asset_name: string;
  selected: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MetaLeadForm {
  id: string;
  company_id: string;
  integration_id: string;
  page_asset_id: string | null;
  form_id: string;
  form_name: string;
  status: LeadFormStatus;
  sync_mode: LeadFormSyncMode;
  since_date: string | null;
  last_pull_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FieldMappingRules {
  field_map: Record<string, string>;
  required_fields_policy: "strict" | "lenient";
  default_values: Record<string, string>;
  transformations: Record<string, string>;
  tags_to_apply: string[];
  pipeline_settings: {
    pipeline_id: string | null;
    stage_id: string | null;
    owner_user_id: string | null;
    source: string;
    campaign: string;
  };
  dedupe_policy: DedupePolicy;
  update_policy: UpdatePolicy;
}

export interface IntegrationFieldMapping {
  id: string;
  company_id: string;
  integration_id: string;
  form_id: string;
  mapping_version: number;
  rules: FieldMappingRules;
  created_at: string;
  updated_at: string;
}

export interface WebhookEvent {
  id: string;
  company_id: string | null;
  integration_id: string | null;
  provider: string;
  event_type: string;
  event_id: string | null;
  payload: Record<string, unknown>;
  received_at: string;
  processed_at: string | null;
  status: WebhookEventStatus;
  fail_count: number;
  last_fail_reason: string | null;
}

export interface SyncJob {
  id: string;
  company_id: string;
  integration_id: string;
  job_type: SyncJobType;
  params: Record<string, unknown>;
  status: SyncJobStatus;
  attempts: number;
  scheduled_at: string;
  started_at: string | null;
  finished_at: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
}

export interface IntegrationAuditEntry {
  id: string;
  company_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// Wizard step enum
export type MetaWizardStep = 
  | "oauth"
  | "pages"
  | "confirm"
  | "forms"
  | "mapping"
  | "activation";

// CRM standard fields for mapping
export const CRM_STANDARD_FIELDS = [
  { key: "full_name", label: "Nome completo" },
  { key: "first_name", label: "Nome" },
  { key: "last_name", label: "Cognome" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Telefono" },
  { key: "city", label: "Città" },
  { key: "address", label: "Indirizzo" },
  { key: "postal_code", label: "CAP" },
  { key: "province", label: "Provincia" },
  { key: "notes", label: "Note" },
  { key: "company_name", label: "Azienda" },
] as const;
