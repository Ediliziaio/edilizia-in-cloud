/**
 * Report Google Ads per livello: campagne → gruppi di annunci → annunci, più
 * parole chiave e termini di ricerca.
 *
 * I numeri arrivano già "piatti" dall'azione `report` di
 * google-ads-sync-campaigns (euro, non micros). Qui si calcolano i derivati e
 * si aggancia il CRM: i contatti arrivati da Google portano campagna, gruppo e
 * annuncio di provenienza (google_campaign_id / google_ad_group_id /
 * google_ad_id), quindi si vede quale annuncio porta contratti e non solo
 * conversioni. Parole chiave e termini di ricerca non hanno un aggancio nel
 * CRM: lì le colonne CRM restano vuote.
 */
import { vuotoCrm, type CrmIndex, type CrmStat } from "@/lib/metaAdsReportModel";

export type GoogleLevel = "campaign" | "ad_group" | "ad" | "keyword" | "search_term";

export interface GoogleRow {
  id: string;
  name: string | null;
  status: string | null;
  campaign_id: string;
  campaign_name: string;
  ad_group_id: string | null;
  ad_group_name: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversion_value: number;
  // Per livello
  primary_status?: string | null;
  channel?: string | null;
  bidding?: string | null;
  budget_daily?: number | null;
  search_is?: number | null;
  lost_budget_is?: number | null;
  lost_rank_is?: number | null;
  ad_type?: string | null;
  ad_strength?: string | null;
  approval?: string | null;
  final_url?: string | null;
  headlines?: string[];
  descriptions?: string[];
  match_type?: string | null;
  quality_score?: number | null;
  // Calcolati
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
  figli?: number;
  lead_crm: number | null;
  opportunita: number | null;
  vinte: number | null;
  valore_vinto: number | null;
  costo_vinta: number | null;
}

export interface GoogleReportPayload {
  campaigns: Partial<GoogleRow>[];
  ad_groups: Partial<GoogleRow>[];
  ads: Partial<GoogleRow>[];
  keywords: Partial<GoogleRow>[];
  search_terms: Partial<GoogleRow>[];
  active_campaigns: Partial<GoogleRow>[];
  active_ad_groups: Partial<GoogleRow>[];
  account: { impressions: number; clicks: number; spend: number; conversions: number; conversion_value: number };
  account_prev: GoogleReportPayload["account"] | null;
  daily: Array<{ date: string; impressions: number; clicks: number; spend: number; conversions: number; conversion_value: number }>;
  avvisi?: string[];
  fetched_at?: string;
}

export interface GooglePercorso {
  campaignId?: string;
  campaignName?: string;
  adGroupId?: string;
  adGroupName?: string;
}

const div = (a: number, b: number) => (b > 0 ? a / b : 0);

function completa(r: Partial<GoogleRow>, crm: CrmStat | null): GoogleRow {
  const spend = r.spend ?? 0;
  const impressions = r.impressions ?? 0;
  const clicks = r.clicks ?? 0;
  const conversions = r.conversions ?? 0;
  const conversion_value = r.conversion_value ?? 0;
  return {
    ...r,
    id: r.id ?? "",
    name: r.name ?? null,
    status: r.status ?? null,
    campaign_id: r.campaign_id ?? "",
    campaign_name: r.campaign_name ?? "",
    ad_group_id: r.ad_group_id ?? null,
    ad_group_name: r.ad_group_name ?? null,
    impressions,
    clicks,
    spend,
    conversions,
    conversion_value,
    ctr: div(clicks * 100, impressions),
    cpc: div(spend, clicks),
    cpa: div(spend, conversions),
    roas: div(conversion_value, spend),
    lead_crm: crm ? crm.lead_crm : null,
    opportunita: crm ? crm.opportunita : null,
    vinte: crm ? crm.vinte : null,
    valore_vinto: crm ? crm.valore_vinto : null,
    costo_vinta: crm ? div(spend, crm.vinte) : null,
  };
}

/** Righe di un livello: con consegna nel periodo, più campagne e gruppi
 *  attivi che non hanno speso (accesi ma fermi: da notare). */
export function buildGoogleRows(p: GoogleReportPayload | null, level: GoogleLevel, crm: CrmIndex | null): GoogleRow[] {
  if (!p) return [];
  const sorgente =
    level === "campaign" ? p.campaigns
      : level === "ad_group" ? p.ad_groups
        : level === "ad" ? p.ads
          : level === "keyword" ? p.keywords
            : p.search_terms;
  const mappaCrm = crm ? (level === "campaign" ? crm.campaign : level === "ad_group" ? crm.adset : level === "ad" ? crm.ad : null) : null;
  const statCrm = (id: string) => (mappaCrm ? mappaCrm.get(id) ?? vuotoCrm() : null);

  const righe = (sorgente ?? []).map((r) => completa(r, statCrm(r.id ?? "")));
  const visti = new Set(righe.map((r) => r.id));
  const attivi = level === "campaign" ? p.active_campaigns : level === "ad_group" ? p.active_ad_groups : [];
  for (const a of attivi ?? []) {
    if (!a.id || visti.has(a.id)) continue;
    righe.push(completa({ ...a, campaign_id: a.campaign_id ?? a.id, campaign_name: a.campaign_name ?? a.name ?? "" }, statCrm(a.id)));
  }

  if (level === "campaign" || level === "ad_group") {
    const figli = new Map<string, number>();
    const sotto = level === "campaign" ? [...(p.ad_groups ?? []), ...(p.active_ad_groups ?? [])] : p.ads ?? [];
    const contati = new Set<string>();
    for (const s of sotto) {
      const padre = level === "campaign" ? s.campaign_id : s.ad_group_id;
      if (!padre || !s.id || contati.has(s.id)) continue;
      contati.add(s.id);
      figli.set(padre, (figli.get(padre) ?? 0) + 1);
    }
    for (const r of righe) r.figli = figli.get(r.id);
  }
  return righe;
}

export function filtraGooglePercorso(rows: GoogleRow[], level: GoogleLevel, percorso: GooglePercorso): GoogleRow[] {
  if (level === "campaign") return rows;
  if (level !== "ad_group" && percorso.adGroupId) return rows.filter((r) => r.ad_group_id === percorso.adGroupId);
  if (percorso.campaignId) return rows.filter((r) => r.campaign_id === percorso.campaignId);
  return rows;
}

export interface GoogleKpis {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  cpa: number;
  conversion_value: number;
  roas: number;
  search_is: number | null;
  lost_budget_is: number | null;
  lost_rank_is: number | null;
  lead_crm: number;
  opportunita: number;
  vinte: number;
  valore_vinto: number;
  costo_lead_crm: number;
  costo_vinta: number;
}

function kpi(t: GoogleReportPayload["account"], crm: CrmStat, quote: { search_is: number | null; lost_budget_is: number | null; lost_rank_is: number | null }): GoogleKpis {
  return {
    spend: t.spend,
    impressions: t.impressions,
    clicks: t.clicks,
    ctr: div(t.clicks * 100, t.impressions),
    cpc: div(t.spend, t.clicks),
    conversions: t.conversions,
    cpa: div(t.spend, t.conversions),
    conversion_value: t.conversion_value,
    roas: div(t.conversion_value, t.spend),
    ...quote,
    lead_crm: crm.lead_crm,
    opportunita: crm.opportunita,
    vinte: crm.vinte,
    valore_vinto: crm.valore_vinto,
    costo_lead_crm: div(t.spend, crm.lead_crm),
    costo_vinta: div(t.spend, crm.vinte),
  };
}

/** Quota impressioni della rete di ricerca, pesata sulle impressioni. */
function quotaPesata(rows: Partial<GoogleRow>[], campo: "search_is" | "lost_budget_is" | "lost_rank_is"): number | null {
  let v = 0;
  let w = 0;
  for (const r of rows) {
    const q = r[campo];
    if (q == null) continue;
    const peso = (r.impressions ?? 0) > 0 ? r.impressions! : 1;
    v += q * peso;
    w += peso;
  }
  return w > 0 ? v / w : null;
}

export function computeGoogleKpis(
  p: GoogleReportPayload | null,
  crm: CrmIndex | null,
  percorso: GooglePercorso,
): { attuale: GoogleKpis; precedente: GoogleKpis | null } {
  const zero = { impressions: 0, clicks: 0, spend: 0, conversions: 0, conversion_value: 0 };
  if (!p) return { attuale: kpi(zero, vuotoCrm(), { search_is: null, lost_budget_is: null, lost_rank_is: null }), precedente: null };
  if (percorso.adGroupId || percorso.campaignId) {
    const riga = percorso.adGroupId
      ? p.ad_groups.find((r) => r.id === percorso.adGroupId)
      : p.campaigns.find((r) => r.id === percorso.campaignId);
    const stat = (percorso.adGroupId ? crm?.adset : crm?.campaign)?.get((percorso.adGroupId ?? percorso.campaignId)!) ?? vuotoCrm();
    const t = { ...zero, ...(riga ?? {}) } as GoogleReportPayload["account"];
    return {
      attuale: kpi(t, stat, {
        search_is: riga?.search_is ?? null,
        lost_budget_is: riga?.lost_budget_is ?? null,
        lost_rank_is: riga?.lost_rank_is ?? null,
      }),
      precedente: null,
    };
  }
  const quote = {
    search_is: quotaPesata(p.campaigns, "search_is"),
    lost_budget_is: quotaPesata(p.campaigns, "lost_budget_is"),
    lost_rank_is: quotaPesata(p.campaigns, "lost_rank_is"),
  };
  return {
    attuale: kpi(p.account ?? zero, crm?.totale ?? vuotoCrm(), quote),
    precedente: p.account_prev ? kpi(p.account_prev, vuotoCrm(), { search_is: null, lost_budget_is: null, lost_rank_is: null }) : null,
  };
}

export const STATO_GOOGLE: Record<string, { testo: string; tono: "verde" | "grigio" | "rosso" | "giallo" }> = {
  ENABLED: { testo: "Attiva", tono: "verde" },
  PAUSED: { testo: "In pausa", tono: "grigio" },
  REMOVED: { testo: "Rimossa", tono: "grigio" },
  ELIGIBLE: { testo: "Idonea", tono: "verde" },
  LIMITED: { testo: "Limitata", tono: "giallo" },
  NOT_ELIGIBLE: { testo: "Non idonea", tono: "rosso" },
  PENDING: { testo: "In attesa", tono: "giallo" },
  ENDED: { testo: "Terminata", tono: "grigio" },
  // termini di ricerca
  ADDED: { testo: "Aggiunta come keyword", tono: "verde" },
  EXCLUDED: { testo: "Esclusa", tono: "grigio" },
  ADDED_EXCLUDED: { testo: "Aggiunta ed esclusa", tono: "grigio" },
  NONE: { testo: "Non gestita", tono: "giallo" },
};

export const CORRISPONDENZA: Record<string, string> = {
  EXACT: "Esatta",
  PHRASE: "A frase",
  BROAD: "Generica",
};

export const EFFICACIA_ANNUNCIO: Record<string, { testo: string; tono: "verde" | "grigio" | "rosso" | "giallo" }> = {
  EXCELLENT: { testo: "Eccellente", tono: "verde" },
  GOOD: { testo: "Buona", tono: "verde" },
  AVERAGE: { testo: "Media", tono: "giallo" },
  POOR: { testo: "Scarsa", tono: "rosso" },
  PENDING: { testo: "In calcolo", tono: "grigio" },
  NO_ADS: { testo: "—", tono: "grigio" },
  UNSPECIFIED: { testo: "—", tono: "grigio" },
  UNKNOWN: { testo: "—", tono: "grigio" },
};

export const CANALE: Record<string, string> = {
  SEARCH: "Rete di ricerca",
  DISPLAY: "Display",
  PERFORMANCE_MAX: "Performance Max",
  VIDEO: "YouTube",
  SHOPPING: "Shopping",
  DEMAND_GEN: "Demand Gen",
  LOCAL: "Locale",
  SMART: "Smart",
  MULTI_CHANNEL: "App",
};
