/**
 * Types per il modulo Meta Ads Campaign Management.
 *
 * NOTA: Questi tipi sono in attesa di essere generati automaticamente da
 * `supabase gen types typescript --linked` quando la migration
 * `20260522150000_meta_ads_campaign_management.sql` sarà applicata sul remoto.
 *
 * Finché la migration vive solo locale (modalità BETA), usiamo i tipi
 * definiti qui + cast tramite `metaTable()` helper.
 */

/* ----------------------- Status enums ----------------------- */

export type MetaCampaignStatus =
  | "draft"
  | "review"
  | "published"
  | "active"
  | "paused"
  | "archived"
  | "error";

export type MetaAdSetStatus =
  | "draft"
  | "published"
  | "active"
  | "paused"
  | "archived"
  | "error";

export type MetaAdStatus =
  | "draft"
  | "published"
  | "active"
  | "paused"
  | "archived"
  | "error"
  | "disapproved";

export type MetaCreativeFormat = "image" | "video" | "carousel" | "story" | "reel";

export type MetaAdMediaKind = "image" | "video";
export type MetaAdMediaSource = "upload" | "ai_generated" | "meta_library";

export type MetaObjective =
  | "OUTCOME_LEADS"
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_AWARENESS"
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_SALES"
  | "OUTCOME_APP_PROMOTION";

export type MetaBudgetMode = "adset" | "campaign";

export type MetaOptimizationGoal =
  | "LEAD_GENERATION"
  | "LINK_CLICKS"
  | "OFFSITE_CONVERSIONS"
  | "IMPRESSIONS"
  | "REACH"
  | "LANDING_PAGE_VIEWS"
  | "POST_ENGAGEMENT"
  | "QUALITY_LEAD";

export type MetaBidStrategy =
  | "LOWEST_COST_WITHOUT_CAP"
  | "LOWEST_COST_WITH_BID_CAP"
  | "COST_CAP"
  | "LOWEST_COST_WITH_MIN_ROAS";

export type MetaCallToAction =
  | "LEARN_MORE"
  | "GET_QUOTE"
  | "SIGN_UP"
  | "CONTACT_US"
  | "BOOK_TRAVEL"
  | "ORDER_NOW"
  | "DOWNLOAD"
  | "GET_OFFER"
  | "MESSAGE_PAGE"
  | "WHATSAPP_MESSAGE";

/* ----------------------- Row types ----------------------- */

export interface MetaCampaignRow {
  id: string;
  company_id: string;
  integration_id: string | null;
  ad_account_id: string | null;
  meta_campaign_id: string | null;
  name: string;
  objective: MetaObjective;
  status: MetaCampaignStatus;
  buying_type: "AUCTION" | "RESERVED";
  budget_mode: MetaBudgetMode;
  daily_budget_cents: number | null;
  lifetime_budget_cents: number | null;
  special_ad_categories: string[];
  special_ad_category_country: string | null;
  start_time: string | null;
  stop_time: string | null;
  builder_state: Record<string, unknown> | null;
  raw: Record<string, unknown> | null;
  last_published_at: string | null;
  last_synced_at: string | null;
  publish_error: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface MetaAdSetRow {
  id: string;
  company_id: string;
  campaign_id: string;
  meta_adset_id: string | null;
  name: string;
  status: MetaAdSetStatus;
  daily_budget_cents: number | null;
  lifetime_budget_cents: number | null;
  bid_amount_cents: number | null;
  optimization_goal: MetaOptimizationGoal | null;
  billing_event: "IMPRESSIONS" | "LINK_CLICKS" | "THRUPLAY" | null;
  bid_strategy: MetaBidStrategy | null;
  targeting: Record<string, unknown>;
  promoted_object: Record<string, unknown> | null;
  publisher_platforms: string[] | null;
  facebook_positions: string[] | null;
  instagram_positions: string[] | null;
  attribution_spec: Record<string, unknown> | null;
  start_time: string | null;
  end_time: string | null;
  raw: Record<string, unknown> | null;
  last_published_at: string | null;
  last_synced_at: string | null;
  publish_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetaCreativeRow {
  id: string;
  company_id: string;
  ad_account_id: string | null;
  meta_creative_id: string | null;
  name: string;
  format: MetaCreativeFormat;
  status: string;
  title: string | null;
  body: string | null;
  hook: string | null;
  goal: string | null;
  call_to_action_type: MetaCallToAction;
  link_url: string | null;
  image_hash: string | null;
  video_id: string | null;
  media_id: string | null;
  ai_prompt: string | null;
  ai_model: string | null;
  object_story_spec: Record<string, unknown> | null;
  asset_feed_spec: Record<string, unknown> | null;
  raw: Record<string, unknown> | null;
  last_published_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetaAdRow {
  id: string;
  company_id: string;
  adset_id: string;
  creative_id: string;
  meta_ad_id: string | null;
  name: string;
  status: MetaAdStatus;
  tracking_specs: Record<string, unknown>[];
  conversion_specs: Record<string, unknown>[];
  raw: Record<string, unknown> | null;
  last_published_at: string | null;
  last_synced_at: string | null;
  publish_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdMediaRow {
  id: string;
  company_id: string;
  name: string;
  kind: MetaAdMediaKind;
  source: MetaAdMediaSource;
  storage_bucket: string | null;
  storage_path: string | null;
  public_url: string | null;
  thumbnail_url: string | null;
  width_px: number | null;
  height_px: number | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  aspect_ratio: string | null;
  ai_prompt: string | null;
  ai_model: string | null;
  ai_provider: string | null;
  ai_cost_eur_cents: number | null;
  meta_image_hash: string | null;
  meta_video_id: string | null;
  uploaded_to_meta_at: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface AdSpendGuardRow {
  id: string;
  company_id: string;
  ad_account_id: string | null;
  monthly_cap_cents: number;
  daily_cap_cents: number;
  campaign_approval_threshold_cents: number;
  alert_threshold_pct: number;
  autopause_on_daily_cap: boolean;
  autopause_on_monthly_cap: boolean;
  alert_email: string | null;
  last_alert_at: string | null;
  last_autopause_at: string | null;
  last_autopause_reason: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MetaConversionPixelRow {
  id: string;
  company_id: string;
  ad_account_id: string | null;
  pixel_id: string;
  pixel_name: string | null;
  capi_token_encrypted: string | null;
  last_event_at: string | null;
  event_match_quality_score: number | null;
  events_last_7d: number;
  pixel_events_last_24h: number;
  capi_events_last_24h: number;
  deduplication_rate: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdAutomationRuleRow {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  scope_type: "campaign" | "adset" | "account";
  scope_filter: Record<string, unknown>;
  trigger: AdAutomationTrigger;
  action: AdAutomationAction;
  requires_confirmation: boolean;
  is_enabled: boolean;
  last_evaluated_at: string | null;
  last_triggered_at: string | null;
  trigger_count: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface AdAutomationTrigger {
  metric: "cpa" | "cpl" | "roas" | "ctr" | "spend" | "frequency" | "leads";
  operator: ">" | "<" | ">=" | "<=" | "==";
  value: number;
  window_days?: number;
  min_data_points?: number;
}

export interface AdAutomationAction {
  type: "pause" | "scale" | "notify" | "duplicate";
  params?: {
    scale_pct?: number;
    notify_channel?: "email" | "whatsapp" | "in_app";
    notify_recipient?: string;
  };
}

/* ----------------------- Insights ----------------------- */

export interface MetaInsightsRow {
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  date_start: string;
  date_stop: string;
  spend_cents: number;
  impressions: number;
  clicks: number;
  cpm_cents: number;
  cpc_cents: number;
  ctr: number;
  reach: number;
  frequency: number;
  leads: number;
  cost_per_lead_cents: number;
  conversions: number;
  cost_per_conversion_cents: number;
  raw: Record<string, unknown>;
}

/* ----------------------- API request/response types ----------------------- */

export interface CreateCampaignRequest {
  company_id: string;
  ad_account_id: string;
  builder_state: Record<string, unknown>;
  dry_run?: boolean;
}

export interface CreateCampaignResponse {
  success: boolean;
  campaign_id?: string;
  meta_campaign_id?: string;
  meta_payload?: {
    campaign: Record<string, unknown>;
    ad_sets: Record<string, unknown>[];
    creatives: Record<string, unknown>[];
    ads: Record<string, unknown>[];
  };
  errors?: string[];
  rollback?: boolean;
  dry_run: boolean;
}

export interface ListCampaignsRequest {
  company_id: string;
  ad_account_id?: string;
  date_preset?: "last_7d" | "last_14d" | "last_30d" | "this_month" | "last_month";
}

/* ----------------------- Aggregati per UI ----------------------- */

export interface CampaignWithStats extends MetaCampaignRow {
  ad_set_count: number;
  ad_count: number;
  last_30d_spend_cents: number;
  last_30d_leads: number;
  last_30d_cpl_cents: number | null;
}

/* ----------------------- Targeting types (Meta search) ----------------------- */

/**
 * Risultato canonical da meta-targeting-search edge function. Stessa shape
 * usata in UI per multi-select location, interests, behaviors, demographics,
 * locales. La `key` è il Meta ID da passare nel `targeting` quando si
 * pubblica una campagna.
 */
export interface MetaSearchResult {
  key: string;
  name: string;
  type: string; // "country" | "region" | "city" | "geo_market" | "neighborhood" | "interest" | "behavior" | "demographic" | "locale" | "zip"
  country_code?: string;
  country_name?: string;
  region?: string;
  supports_region?: boolean;
  supports_city?: boolean;
  audience_size_lower?: number;
  audience_size_upper?: number;
  path?: string[];
}

/**
 * Geo location selezionata nel builder (subset di MetaSearchResult con
 * raggio opzionale per le città).
 */
export interface MetaGeoLocationPick extends MetaSearchResult {
  /** Per cities/custom_locations: raggio in km. Per region/country non applicabile. */
  radius_km?: number;
  /** Se true → è in `excluded_geo_locations` invece di `geo_locations`. */
  excluded?: boolean;
}

/**
 * Placement Meta per fine-tuning posizionamento ad.
 * Default: tutti (Meta Advantage placements). Personalizzazione = subset.
 */
export type MetaPublisherPlatform = "facebook" | "instagram" | "messenger" | "audience_network";

export type MetaFacebookPosition =
  | "feed"
  | "right_hand_column"
  | "marketplace"
  | "video_feeds"
  | "story"
  | "search"
  | "instream_video"
  | "facebook_reels"
  | "facebook_reels_overlay";

export type MetaInstagramPosition =
  | "stream"
  | "story"
  | "explore"
  | "reels"
  | "shop"
  | "ig_search"
  | "profile_feed"
  | "explore_home";

export interface MetaPlacementsConfig {
  /** true = Advantage placements (Meta sceglie), false = manuale */
  automatic: boolean;
  publisher_platforms?: MetaPublisherPlatform[];
  facebook_positions?: MetaFacebookPosition[];
  instagram_positions?: MetaInstagramPosition[];
}

