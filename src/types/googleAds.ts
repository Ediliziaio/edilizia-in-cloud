/**
 * Types per il modulo Google Ads (scaffold v1).
 *
 * Hierarchy Google: Customer → Campaign → Ad Group → Ad
 * (a differenza di Meta: Business Manager → Ad Account → Campaign → AdSet → Ad)
 */

export type GoogleAdsChannel =
  | "SEARCH"
  | "DISPLAY"
  | "VIDEO"
  | "SHOPPING"
  | "PERFORMANCE_MAX"
  | "LOCAL_SERVICES";

export type GoogleAdsCampaignStatus =
  | "draft"
  | "review"
  | "published"
  | "active"
  | "paused"
  | "archived"
  | "error";

export type GoogleAdsAdGroupStatus =
  | "draft"
  | "published"
  | "active"
  | "paused"
  | "archived"
  | "error";

export type GoogleAdsAdStatus =
  | "draft"
  | "published"
  | "active"
  | "paused"
  | "archived"
  | "error"
  | "disapproved";

export type GoogleAdsBiddingStrategy =
  | "TARGET_CPA"
  | "TARGET_ROAS"
  | "MAXIMIZE_CONVERSIONS"
  | "MAXIMIZE_CLICKS"
  | "MAXIMIZE_CONVERSION_VALUE"
  | "MANUAL_CPC";

export type GoogleAdsKeywordMatchType = "BROAD" | "PHRASE" | "EXACT";

export type GoogleAdsAdType =
  | "RESPONSIVE_SEARCH_AD"
  | "EXPANDED_TEXT_AD"
  | "RESPONSIVE_DISPLAY_AD"
  | "VIDEO_AD"
  | "SHOPPING_AD"
  | "PERFORMANCE_MAX_AD";

export interface GoogleAdsAccountRow {
  id: string;
  company_id: string;
  integration_id: string | null;
  customer_id: string;
  customer_name: string | null;
  currency: string | null;
  time_zone: string | null;
  manager_customer_id: string | null;
  is_manager: boolean;
  is_test_account: boolean;
  selected: boolean;
  created_at: string;
  updated_at: string;
}

export interface GoogleAdsCampaignRow {
  id: string;
  company_id: string;
  integration_id: string | null;
  google_account_id: string | null;
  google_campaign_id: string | null;
  name: string;
  advertising_channel: GoogleAdsChannel;
  status: GoogleAdsCampaignStatus;
  daily_budget_cents: number | null;
  shared_budget_id: string | null;
  bidding_strategy_type: GoogleAdsBiddingStrategy | null;
  target_cpa_micros: number | null;
  target_roas: number | null;
  start_date: string | null;
  end_date: string | null;
  geo_targets: Array<{ geo_target_constant_id?: string; name: string }>;
  language_targets: string[];
  target_google_search: boolean;
  target_search_network: boolean;
  target_content_network: boolean;
  target_partner_search_network: boolean;
  builder_state: Record<string, unknown> | null;
  raw: Record<string, unknown> | null;
  last_published_at: string | null;
  last_synced_at: string | null;
  publish_error: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface GoogleAdGroupRow {
  id: string;
  company_id: string;
  campaign_id: string;
  google_ad_group_id: string | null;
  name: string;
  status: GoogleAdsAdGroupStatus;
  ad_group_type: string | null;
  cpc_bid_micros: number | null;
  target_cpa_micros: number | null;
  target_roas: number | null;
  keywords: Array<{ text: string; match_type: GoogleAdsKeywordMatchType; cpc_bid_micros?: number }>;
  negative_keywords: Array<{ text: string; match_type: GoogleAdsKeywordMatchType }>;
  audience_targets: Record<string, unknown> | null;
  demographic_targets: Record<string, unknown> | null;
  raw: Record<string, unknown> | null;
  last_published_at: string | null;
  last_synced_at: string | null;
  publish_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoogleAdsAssetRow {
  id: string;
  company_id: string;
  google_account_id: string | null;
  google_asset_id: string | null;
  type: "TEXT" | "IMAGE" | "VIDEO" | "YOUTUBE_VIDEO" | "CALLOUT" | "SITELINK";
  name: string | null;
  text_content: string | null;
  ad_media_id: string | null;
  youtube_video_id: string | null;
  performance_label: string | null;
  raw: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface GoogleAdRow {
  id: string;
  company_id: string;
  ad_group_id: string;
  google_ad_id: string | null;
  name: string;
  ad_type: GoogleAdsAdType;
  status: GoogleAdsAdStatus;
  final_urls: string[];
  display_url: string | null;
  headlines: Array<{ text: string; asset_id?: string; performance_label?: string }>;
  descriptions: Array<{ text: string; asset_id?: string; performance_label?: string }>;
  path1: string | null;
  path2: string | null;
  image_asset_ids: string[];
  logo_asset_ids: string[];
  raw: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/** Tipo unificato per la lista campagne cross-platform (Meta + Google) */
export type AdsPlatform = "meta" | "google";
