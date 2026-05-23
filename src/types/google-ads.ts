/**
 * Tipi TypeScript per il modulo Google Ads.
 * Schema basato sulla tabella google_ads_stats (migration 20260722000000).
 */

/** Riga raw della tabella google_ads_stats */
export interface GoogleAdsStatRow {
  id: string;
  company_id: string;
  date: string; // formato "YYYY-MM-DD"
  campaign_id: string | null;
  campaign_name: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversion_value?: number | null;
  search_impression_share?: number | null;
  created_at: string;
  updated_at: string;
}

/** KPI aggregati calcolati lato client */
export interface GoogleAdsKPIs {
  totalSpend: number;
  avgCTR: number;
  totalConversions: number;
  totalConversionValue: number;
  avgCPC: number;
  avgCPA: number;
  roas: number;
  avgSearchImpressionShare: number | null;
  totalImpressions: number;
  totalClicks: number;
}

/** Intervallo di date per il filtro */
export interface GoogleAdsDateRange {
  from: Date;
  to: Date;
}

/** Dati aggregati per campagna (usati nella tabella campagne) */
export interface GoogleAdsCampaign {
  campaign_id: string | null;
  campaign_name: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversion_value: number;
  ctr: number;
  cpc: number;
  cost_per_conversion: number;
  roas: number;
  search_impression_share: number | null;
}

/** Stato connessione account Google Ads */
export type GoogleAdsConnectionStatus =
  | "connected"
  | "disconnected"
  | "error"
  | "loading";

/** Filtri attivi sulla dashboard */
export interface GoogleAdsFilters {
  dateRange: GoogleAdsDateRange;
  campaignId?: string | null;
}
