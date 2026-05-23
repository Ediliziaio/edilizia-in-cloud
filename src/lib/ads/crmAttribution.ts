export type CrmConversionKind = "lead_created" | "appointment_scheduled" | "opportunity_won";
export type CrmConversionEntityType = "contact" | "appointment" | "opportunity";
export type AdsAttributionProvider = "meta" | "google" | "all";

export interface AdsAttributionInput {
  spendCents?: number | null;
  leads?: number | null;
  opportunities?: number | null;
  appointments?: number | null;
  won?: number | null;
  revenueCents?: number | null;
}

export interface AdsAttributionMetrics {
  spendCents: number;
  leads: number;
  opportunities: number;
  appointments: number;
  won: number;
  revenueCents: number;
  costPerLeadCents: number;
  costPerOpportunityCents: number;
  costPerAppointmentCents: number;
  costPerSaleCents: number;
  leadToOpportunityRatePct: number;
  leadToAppointmentRatePct: number;
  opportunityToSaleRatePct: number;
  appointmentToSaleRatePct: number;
  roas: number;
}

export interface MetaAttributedContactLike {
  source?: string | null;
  source_campaign_id?: string | null;
  attr_source?: string | null;
  attr_medium?: string | null;
  attr_campaign?: string | null;
  attr_content?: string | null;
  meta_campaign_id?: string | null;
  meta_adset_id?: string | null;
  meta_ad_id?: string | null;
  google_campaign_id?: string | null;
  google_ad_group_id?: string | null;
  google_ad_id?: string | null;
  gclid?: string | null;
  wbraid?: string | null;
  gbraid?: string | null;
}

export interface CrmCapiContact {
  id?: string | null;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  country?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
}

export interface CrmCapiAttribution {
  campaignId?: string | null;
  campaignName?: string | null;
  adSetId?: string | null;
  adSetName?: string | null;
  adId?: string | null;
  adName?: string | null;
}

export interface CrmCapiEventInput {
  companyId: string;
  entityType: CrmConversionEntityType;
  entityId: string;
  eventKind: CrmConversionKind;
  eventTime?: number | null;
  sourceUrl?: string | null;
  valueCents?: number | null;
  currency?: string | null;
  contact?: CrmCapiContact | null;
  attribution?: CrmCapiAttribution | null;
}

export interface CrmCapiEventPayload {
  company_id: string;
  event_name: "Lead" | "Schedule" | "Purchase";
  event_id: string;
  event_time: number;
  event_source_url?: string;
  action_source: "system_generated";
  user_data: Record<string, string>;
  custom_data: Record<string, string | number | string[]>;
}

export type AdsOptimizationSeverity = "good" | "info" | "warning" | "critical";
export type AdsOptimizationKind = "wait" | "pause" | "qualify" | "sales" | "scale";

export interface AdsOptimizationRecommendation {
  kind: AdsOptimizationKind;
  severity: AdsOptimizationSeverity;
  title: string;
  detail: string;
}

export function buildAdsAttributionMetrics(input: AdsAttributionInput): AdsAttributionMetrics {
  const spendCents = positiveInt(input.spendCents);
  const leads = positiveInt(input.leads);
  const opportunities = positiveInt(input.opportunities);
  const appointments = positiveInt(input.appointments);
  const won = positiveInt(input.won);
  const revenueCents = positiveInt(input.revenueCents);

  return {
    spendCents,
    leads,
    opportunities,
    appointments,
    won,
    revenueCents,
    costPerLeadCents: cost(spendCents, leads),
    costPerOpportunityCents: cost(spendCents, opportunities),
    costPerAppointmentCents: cost(spendCents, appointments),
    costPerSaleCents: cost(spendCents, won),
    leadToOpportunityRatePct: pct(opportunities, leads),
    leadToAppointmentRatePct: pct(appointments, leads),
    opportunityToSaleRatePct: pct(won, opportunities),
    appointmentToSaleRatePct: pct(won, appointments),
    roas: ratio(revenueCents, spendCents),
  };
}

export function isMetaAttributedContact(contact: MetaAttributedContactLike | null | undefined): boolean {
  if (!contact) return false;
  const source = normalize(contact.source);
  const attrSource = normalize(contact.attr_source);
  const attrMedium = normalize(contact.attr_medium);
  return Boolean(
    contact.source_campaign_id ||
      contact.meta_campaign_id ||
      contact.meta_adset_id ||
      contact.meta_ad_id ||
      source.includes("meta") ||
      source.includes("facebook") ||
      source.includes("instagram") ||
      attrSource.includes("facebook") ||
      attrSource.includes("meta") ||
      attrSource.includes("instagram") ||
      attrMedium.includes("paid_social"),
  );
}

export function isGoogleAttributedContact(contact: MetaAttributedContactLike | null | undefined): boolean {
  if (!contact) return false;
  const source = normalize(contact.source);
  const attrSource = normalize(contact.attr_source);
  const attrMedium = normalize(contact.attr_medium);
  return Boolean(
    contact.google_campaign_id ||
      contact.google_ad_group_id ||
      contact.google_ad_id ||
      contact.gclid ||
      contact.wbraid ||
      contact.gbraid ||
      source.includes("google ads") ||
      source.includes("google_ads") ||
      source.includes("adwords") ||
      attrSource.includes("google") ||
      attrSource.includes("google_ads") ||
      attrSource.includes("adwords") ||
      attrMedium.includes("paid_search") ||
      attrMedium === "cpc" ||
      attrMedium === "ppc",
  );
}

export function isAdsAttributedContact(
  contact: MetaAttributedContactLike | null | undefined,
  provider: AdsAttributionProvider = "all",
): boolean {
  if (provider === "meta") return isMetaAttributedContact(contact);
  if (provider === "google") return isGoogleAttributedContact(contact);
  return isMetaAttributedContact(contact) || isGoogleAttributedContact(contact);
}

export function buildCrmCapiEvent(input: CrmCapiEventInput): CrmCapiEventPayload {
  const eventName = mapCrmEventName(input.eventKind);
  const eventTime = input.eventTime ?? Math.floor(Date.now() / 1000);
  const contact = input.contact ?? {};
  const attribution = input.attribution ?? {};
  const contentIds = [attribution.campaignId, attribution.adSetId, attribution.adId].filter(
    (id): id is string => Boolean(id),
  );
  const customData: CrmCapiEventPayload["custom_data"] = {
    source: "crm",
    crm_event_kind: input.eventKind,
  };

  if (input.currency) customData.currency = input.currency;
  if (input.valueCents && input.valueCents > 0) customData.value = round2(input.valueCents / 100);
  if (attribution.campaignName) customData.content_name = attribution.campaignName;
  if (contentIds.length > 0) customData.content_ids = contentIds;
  if (attribution.campaignId) customData.campaign_id = attribution.campaignId;
  if (attribution.adSetId) customData.adset_id = attribution.adSetId;
  if (attribution.adId) customData.ad_id = attribution.adId;
  if (attribution.adName) customData.ad_name = attribution.adName;

  const payload: CrmCapiEventPayload = {
    company_id: input.companyId,
    event_name: eventName,
    event_id: buildCrmEventId(input.companyId, input.entityType, input.entityId, eventName),
    event_time: eventTime,
    action_source: "system_generated",
    user_data: compactStringRecord({
      email: contact.email,
      phone: contact.phone,
      first_name: contact.firstName,
      last_name: contact.lastName,
      city: contact.city,
      country: contact.country,
      fbc: contact.fbc,
      fbp: contact.fbp,
      external_id: contact.id,
      client_ip_address: contact.clientIpAddress,
      client_user_agent: contact.clientUserAgent,
    }),
    custom_data: customData,
  };

  if (input.sourceUrl) payload.event_source_url = input.sourceUrl;
  return payload;
}

export function buildCrmEventId(
  companyId: string,
  entityType: CrmConversionEntityType,
  entityId: string,
  eventName: CrmCapiEventPayload["event_name"],
) {
  return `crm:${companyId}:${entityType}:${entityId}:${eventName}`;
}

export function buildOptimizationRecommendations(input: {
  metrics: AdsAttributionMetrics;
  targetCplCents?: number | null;
  hoursSinceLaunch?: number | null;
}): AdsOptimizationRecommendation[] {
  const { metrics } = input;
  const hoursSinceLaunch = input.hoursSinceLaunch ?? 0;
  const targetCplCents = positiveInt(input.targetCplCents);

  if (hoursSinceLaunch > 0 && hoursSinceLaunch < 72) {
    return [
      {
        kind: "wait",
        severity: "info",
        title: "Aspetta il primo ciclo dati",
        detail: "Prima delle 72 ore le decisioni sono fragili: controlla delivery, lead e follow-up ma non scalare ancora.",
      },
    ];
  }

  const recommendations: AdsOptimizationRecommendation[] = [];
  const cplTooHigh =
    targetCplCents > 0 && metrics.costPerLeadCents > 0 && metrics.costPerLeadCents > targetCplCents * 1.35;
  const spentEnoughToJudge = targetCplCents > 0 ? metrics.spendCents >= targetCplCents * 2 : metrics.spendCents > 0;

  if (spentEnoughToJudge && metrics.leads === 0) {
    recommendations.push({
      kind: "pause",
      severity: "critical",
      title: "Pausa e cambia angolo",
      detail: "La campagna ha speso abbastanza per giudicare ma non sta generando lead: prima controlla creatività, offerta e pagina/form.",
    });
  }

  if (metrics.leads > 0 && (metrics.opportunities === 0 || metrics.leadToOpportunityRatePct < 15)) {
    recommendations.push({
      kind: "qualify",
      severity: "warning",
      title: "Migliora qualificazione e offerta",
      detail: "I lead arrivano ma non diventano opportunità: serve filtro più forte su urgenza, zona, budget o capacità commerciale.",
    });
  }

  if (metrics.appointments > 0 && metrics.won === 0 && metrics.spendCents > 0) {
    recommendations.push({
      kind: "sales",
      severity: "warning",
      title: "Controlla processo commerciale",
      detail: "Gli appuntamenti esistono ma non chiudono ancora: verifica proposta, tempi di risposta e gestione preventivo.",
    });
  }

  if (metrics.leads > 0 && cplTooHigh) {
    recommendations.push({
      kind: "pause",
      severity: "warning",
      title: "CPL sopra target",
      detail: "Il costo lead supera il target: spegni le creatività peggiori e non scalare finché qualità lead e appuntamenti non reggono.",
    });
  }

  if (
    metrics.leads > 0 &&
    metrics.won > 0 &&
    metrics.roas >= 2 &&
    (!targetCplCents || metrics.costPerLeadCents <= targetCplCents)
  ) {
    recommendations.push({
      kind: "scale",
      severity: "good",
      title: "Scala con prudenza",
      detail: "CPL e vendite sono sostenibili: aumenta budget a piccoli step mantenendo separati creatività e pubblici vincenti.",
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      kind: "wait",
      severity: "info",
      title: "Dati ancora neutri",
      detail: "Continua il test finché spend, lead, appuntamenti e vendite danno un segnale più netto.",
    });
  }

  return recommendations;
}

function mapCrmEventName(kind: CrmConversionKind): CrmCapiEventPayload["event_name"] {
  if (kind === "appointment_scheduled") return "Schedule";
  if (kind === "opportunity_won") return "Purchase";
  return "Lead";
}

function positiveInt(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return 0;
  return Math.max(0, Math.round(Number(value)));
}

function cost(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round(numerator / denominator) : 0;
}

function pct(numerator: number, denominator: number) {
  return denominator > 0 ? round1((numerator / denominator) * 100) : 0;
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? round2(numerator / denominator) : 0;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function compactStringRecord(values: Record<string, string | null | undefined>) {
  return Object.entries(values).reduce<Record<string, string>>((acc, [key, value]) => {
    const clean = String(value ?? "").trim();
    if (clean) acc[key] = clean;
    return acc;
  }, {});
}
