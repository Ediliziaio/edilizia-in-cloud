/**
 * Report Meta per livello: campagne → gruppi di inserzioni → inserzioni.
 *
 * Mette insieme tre fonti:
 *  - gli insight di Meta, chiesti separatamente per ogni livello
 *    (`get-ads-report`): copertura e frequenza NON si sommano, quindi la
 *    copertura di una campagna non si ricava da quella delle sue inserzioni;
 *  - la struttura dell'account (stato reale, budget, creatività): senza, ai
 *    livelli gruppo e inserzione compariva lo stato della campagna;
 *  - il CRM: ogni lead arrivato da un modulo Meta porta campagna, gruppo e
 *    inserzione di provenienza, quindi si sa quali inserzioni portano
 *    trattative e contratti, non solo lead.
 */
import {
  normalizeInsights,
  pickClicks,
  pickLeads,
  type NormalizedCampaignRow,
} from "@/lib/metaInsightsNormalizer";

export type ReportLevel = "campaign" | "adset" | "ad";

/** Risposta di `get-ads-report` per un account. */
export interface AdsReportPayload {
  ads_insights: any[];
  adsets_insights: any[];
  campaigns_insights: any[];
  account: any | null;
  account_prev: any | null;
  daily: any[];
  campaigns: any[];
  adsets: any[];
  ads: any[];
  /** Pezzi che Meta non ha restituito (il report esce lo stesso). */
  avvisi?: string[];
}

export interface AccountReport {
  accountId: string;
  accountName: string;
  payload: AdsReportPayload;
}

export interface CrmStat {
  lead_crm: number;
  opportunita: number;
  vinte: number;
  perse: number;
  valore_vinto: number;
}

export interface CrmIndex {
  campaign: Map<string, CrmStat>;
  adset: Map<string, CrmStat>;
  ad: Map<string, CrmStat>;
  totale: CrmStat;
}

export interface DrillFilter {
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adsetName?: string;
}

export const vuotoCrm = (): CrmStat => ({ lead_crm: 0, opportunita: 0, vinte: 0, perse: 0, valore_vinto: 0 });

const div = (a: number, b: number) => (b > 0 ? a / b : 0);
const centesimi = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n / 100 : null;
};

/**
 * Indice CRM a partire dai contatti arrivati da Meta e dalle loro opportunità.
 * Attribuzione per coorte: i lead entrati nel periodo e ciò che ne è nato,
 * anche se il contratto è stato firmato dopo.
 */
export function buildCrmIndex(
  contatti: Array<{ id: string; meta_campaign_id: string | null; meta_adset_id: string | null; meta_ad_id: string | null }>,
  opportunita: Array<{ contact_id: string | null; status: string | null; value: number | string | null }>,
): CrmIndex {
  const perContatto = new Map<string, Array<{ status: string | null; value: number }>>();
  for (const o of opportunita) {
    if (!o.contact_id) continue;
    const lista = perContatto.get(o.contact_id) ?? [];
    lista.push({ status: o.status, value: Number(o.value) || 0 });
    perContatto.set(o.contact_id, lista);
  }
  const idx: CrmIndex = { campaign: new Map(), adset: new Map(), ad: new Map(), totale: vuotoCrm() };
  const aggiungi = (mappa: Map<string, CrmStat>, chiave: string | null, s: CrmStat) => {
    if (!chiave) return;
    const t = mappa.get(chiave) ?? vuotoCrm();
    t.lead_crm += s.lead_crm;
    t.opportunita += s.opportunita;
    t.vinte += s.vinte;
    t.perse += s.perse;
    t.valore_vinto += s.valore_vinto;
    mappa.set(chiave, t);
  };
  for (const c of contatti) {
    const opps = perContatto.get(c.id) ?? [];
    const s: CrmStat = {
      lead_crm: 1,
      opportunita: opps.length,
      vinte: opps.filter((o) => o.status === "won").length,
      perse: opps.filter((o) => o.status === "lost").length,
      valore_vinto: opps.filter((o) => o.status === "won").reduce((t, o) => t + o.value, 0),
    };
    aggiungi(idx.campaign, c.meta_campaign_id, s);
    aggiungi(idx.adset, c.meta_adset_id, s);
    aggiungi(idx.ad, c.meta_ad_id, s);
    idx.totale.lead_crm += s.lead_crm;
    idx.totale.opportunita += s.opportunita;
    idx.totale.vinte += s.vinte;
    idx.totale.perse += s.perse;
    idx.totale.valore_vinto += s.valore_vinto;
  }
  return idx;
}

function applicaCrm(row: NormalizedCampaignRow, s: CrmStat | undefined) {
  const c = s ?? vuotoCrm();
  row.lead_crm = c.lead_crm;
  row.opportunita = c.opportunita;
  row.vinte = c.vinte;
  row.perse = c.perse;
  row.valore_vinto = c.valore_vinto;
  row.costo_lead_crm = div(row.spend, c.lead_crm);
  row.costo_vinta = div(row.spend, c.vinte);
  row.roas = div(c.valore_vinto, row.spend);
}

/** Righe di un livello, da tutti gli account. */
export function buildLevelRows(reports: AccountReport[], level: ReportLevel, crm: CrmIndex | null): NormalizedCampaignRow[] {
  const out: NormalizedCampaignRow[] = [];
  for (const { accountId, accountName, payload } of reports) {
    const campagne = new Map<string, any>((payload.campaigns ?? []).map((c) => [c.id, c]));
    const gruppi = new Map<string, any>((payload.adsets ?? []).map((a) => [a.id, a]));
    const inserzioni = new Map<string, any>((payload.ads ?? []).map((a) => [a.id, a]));
    const entita = level === "campaign" ? campagne : level === "adset" ? gruppi : inserzioni;
    const grezzi =
      level === "campaign" ? payload.campaigns_insights : level === "adset" ? payload.adsets_insights : payload.ads_insights;

    const figliPer = new Map<string, number>();
    if (level === "campaign") for (const g of payload.adsets ?? []) figliPer.set(g.campaign_id, (figliPer.get(g.campaign_id) ?? 0) + 1);
    if (level === "adset") for (const a of payload.ads ?? []) figliPer.set(a.adset_id, (figliPer.get(a.adset_id) ?? 0) + 1);

    const idDi = (r: any): string => (level === "campaign" ? r.campaign_id : level === "adset" ? r.adset_id : r.ad_id) ?? "";
    const visti = new Set<string>();

    const completa = (row: NormalizedCampaignRow, grezzo: any | null) => {
      const id = row.id!;
      const e = entita.get(id);
      const camp = campagne.get(row.campaign_id);
      const gruppo = row.adset_id ? gruppi.get(row.adset_id) : undefined;
      row.account_id = accountId;
      row.account_name = accountName;
      row.status = e?.effective_status ?? e?.status ?? undefined;
      row.objective = row.objective || camp?.objective;
      row.link_clicks = grezzo ? pickClicks(grezzo) : 0;
      // CTR e CPC sul clic al link, come in Gestione Inserzioni: il `ctr` di
      // Meta conta anche i clic su "mi piace", commenti e foto profilo.
      row.ctr = div(row.link_clicks * 100, row.impressions);
      row.cpc = div(row.spend, row.link_clicks);
      row.figli = figliPer.get(id);
      if (level === "campaign") {
        row.budget_daily = centesimi(e?.daily_budget);
        row.budget_lifetime = centesimi(e?.lifetime_budget);
      } else if (level === "adset") {
        row.budget_daily = centesimi(e?.daily_budget) ?? centesimi(camp?.daily_budget);
        row.budget_lifetime = centesimi(e?.lifetime_budget) ?? centesimi(camp?.lifetime_budget);
        row.budget_da_campagna = !centesimi(e?.daily_budget) && !centesimi(e?.lifetime_budget) && !!(camp?.daily_budget || camp?.lifetime_budget);
      } else {
        const cr = e?.creative ?? {};
        row.thumbnail_url = cr.thumbnail_url ?? cr.image_url ?? null;
        row.creative_title = cr.title ?? null;
        row.creative_body = cr.body ?? null;
        row.preview_link = e?.preview_shareable_link ?? null;
        row.quality_ranking = grezzo?.quality_ranking;
        row.engagement_rate_ranking = grezzo?.engagement_rate_ranking;
        row.conversion_rate_ranking = grezzo?.conversion_rate_ranking;
      }
      row.name = level === "campaign" ? row.campaign_name : level === "adset" ? row.adset_name : row.ad_name;
      if (!row.adset_name && gruppo) row.adset_name = gruppo.name;
      const mappaCrm = crm ? (level === "campaign" ? crm.campaign : level === "adset" ? crm.adset : crm.ad) : null;
      applicaCrm(row, mappaCrm?.get(id));
      out.push(row);
    };

    for (const grezzo of grezzi ?? []) {
      const [row] = normalizeInsights([grezzo]);
      row.id = idDi(grezzo);
      if (!row.id) continue;
      visti.add(row.id);
      completa(row, grezzo);
    }

    // Le entità attive senza consegna nel periodo si vedono comunque: una
    // campagna accesa che non spende è un problema da notare, non da nascondere.
    for (const e of entita.values()) {
      if (visti.has(e.id) || e.effective_status !== "ACTIVE") continue;
      const camp = campagne.get(level === "campaign" ? e.id : e.campaign_id);
      const gruppo = level === "ad" ? gruppi.get(e.adset_id) : level === "adset" ? e : undefined;
      const [row] = normalizeInsights([{}]);
      row.id = e.id;
      row.campaign_id = camp?.id ?? e.campaign_id ?? "";
      row.campaign_name = camp?.name ?? "";
      row.adset_id = level === "campaign" ? undefined : gruppo?.id;
      row.adset_name = level === "campaign" ? undefined : gruppo?.name;
      if (level === "ad") {
        row.ad_id = e.id;
        row.ad_name = e.name;
      }
      completa(row, null);
    }
  }
  return out;
}

/** Applica il percorso scelto (campagna → gruppo) alle righe di un livello. */
export function filtraPerPercorso(rows: NormalizedCampaignRow[], level: ReportLevel, drill: DrillFilter): NormalizedCampaignRow[] {
  if (level === "campaign") return rows;
  if (level === "ad" && drill.adsetId) return rows.filter((r) => r.adset_id === drill.adsetId);
  if (drill.campaignId) return rows.filter((r) => r.campaign_id === drill.campaignId);
  return rows;
}

export interface ReportKpis {
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  link_clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  leads: number;
  cpl: number;
  lead_crm: number;
  opportunita: number;
  vinte: number;
  valore_vinto: number;
  costo_lead_crm: number;
  costo_vinta: number;
  roas: number;
}

function kpiDaGrezzi(righe: any[], crm: CrmStat): ReportKpis {
  let spend = 0, impressions = 0, reach = 0, link_clicks = 0, leads = 0;
  for (const r of righe) {
    spend += parseFloat(r.spend) || 0;
    impressions += parseInt(r.impressions, 10) || 0;
    reach += parseInt(r.reach, 10) || 0;
    link_clicks += pickClicks(r);
    leads += pickLeads(r);
  }
  return {
    spend,
    impressions,
    reach,
    frequency: div(impressions, reach),
    link_clicks,
    ctr: div(link_clicks * 100, impressions),
    cpc: div(spend, link_clicks),
    cpm: div(spend * 1000, impressions),
    leads,
    cpl: div(spend, leads),
    lead_crm: crm.lead_crm,
    opportunita: crm.opportunita,
    vinte: crm.vinte,
    valore_vinto: crm.valore_vinto,
    costo_lead_crm: div(spend, crm.lead_crm),
    costo_vinta: div(spend, crm.vinte),
    roas: div(crm.valore_vinto, spend),
  };
}

/**
 * KPI del riquadro in alto. Senza percorso: i totali dell'account (l'unico
 * modo di avere la copertura giusta). Con una campagna o un gruppo scelti:
 * la riga di quel livello. Il periodo precedente c'è solo per l'account.
 */
export function computeReportKpis(
  reports: AccountReport[],
  crm: CrmIndex | null,
  drill: DrillFilter,
): { attuale: ReportKpis; precedente: ReportKpis | null } {
  if (drill.adsetId || drill.campaignId) {
    const chiave = drill.adsetId ? "adset_id" : "campaign_id";
    const id = drill.adsetId ?? drill.campaignId;
    const righe = reports.flatMap((r) =>
      ((drill.adsetId ? r.payload.adsets_insights : r.payload.campaigns_insights) ?? []).filter((x: any) => x[chiave] === id),
    );
    const stat = (drill.adsetId ? crm?.adset : crm?.campaign)?.get(id!) ?? vuotoCrm();
    return { attuale: kpiDaGrezzi(righe, stat), precedente: null };
  }
  const attuale = kpiDaGrezzi(reports.map((r) => r.payload.account).filter(Boolean), crm?.totale ?? vuotoCrm());
  const prevRighe = reports.map((r) => r.payload.account_prev).filter(Boolean);
  return { attuale, precedente: prevRighe.length > 0 ? kpiDaGrezzi(prevRighe, vuotoCrm()) : null };
}

/** Variazione percentuale; null se il confronto non ha senso. */
export function variazione(ora: number, prima: number | undefined | null): number | null {
  if (prima == null || prima === 0) return null;
  return ((ora - prima) / prima) * 100;
}

export const STATO_ETICHETTA: Record<string, { testo: string; tono: "verde" | "grigio" | "rosso" | "giallo" }> = {
  ACTIVE: { testo: "Attiva", tono: "verde" },
  PAUSED: { testo: "In pausa", tono: "grigio" },
  CAMPAIGN_PAUSED: { testo: "Campagna in pausa", tono: "grigio" },
  ADSET_PAUSED: { testo: "Gruppo in pausa", tono: "grigio" },
  ARCHIVED: { testo: "Archiviata", tono: "grigio" },
  DELETED: { testo: "Eliminata", tono: "grigio" },
  IN_PROCESS: { testo: "In elaborazione", tono: "giallo" },
  PENDING_REVIEW: { testo: "In revisione", tono: "giallo" },
  PREAPPROVED: { testo: "Pre-approvata", tono: "giallo" },
  PENDING_BILLING_INFO: { testo: "Dati di pagamento mancanti", tono: "rosso" },
  WITH_ISSUES: { testo: "Con problemi", tono: "rosso" },
  DISAPPROVED: { testo: "Rifiutata", tono: "rosso" },
};

/** Stato "in pausa" in senso largo: fermata lei o chi la contiene. */
export const inPausa = (s?: string) => !!s && s.toUpperCase().includes("PAUSED");

export const RANKING_ETICHETTA: Record<string, { testo: string; tono: "verde" | "grigio" | "rosso" }> = {
  ABOVE_AVERAGE: { testo: "Sopra la media", tono: "verde" },
  AVERAGE: { testo: "Nella media", tono: "grigio" },
  BELOW_AVERAGE_35: { testo: "Sotto la media (35% peggiori)", tono: "rosso" },
  BELOW_AVERAGE_20: { testo: "Sotto la media (20% peggiori)", tono: "rosso" },
  BELOW_AVERAGE_10: { testo: "Sotto la media (10% peggiori)", tono: "rosso" },
};
