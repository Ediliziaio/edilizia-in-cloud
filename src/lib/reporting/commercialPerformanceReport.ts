export interface CommercialContactRow {
  id: string;
  created_at?: string | null;
  source?: string | null;
  source_campaign_id?: string | null;
  attr_source?: string | null;
  attr_campaign?: string | null;
  city?: string | null;
  province?: string | null;
  assigned_to?: string | null;
  call_center_id?: string | null;
  stato?: string | null;
  tags?: string[] | null;
  icp_score?: number | string | null;
  lead_score?: number | string | null;
  ai_score?: number | string | null;
}

export interface CommercialAppointmentRow {
  id: string;
  contact_id?: string | null;
  assigned_to?: string | null;
  appointment_date?: string | null;
  appointment_type?: string | null;
  order_id?: string | null;
  status?: string | null;
  is_completed?: boolean | null;
  is_blocked_slot?: boolean | null;
}

export interface CommercialQuoteRow {
  id: string;
  contact_id?: string | null;
  opportunity_id?: string | null;
  quote_number?: string | null;
  title?: string | null;
  status?: string | null;
  total?: number | string | null;
  subtotal?: number | string | null;
  created_at?: string | null;
  sent_at?: string | null;
  signed_at?: string | null;
  refused_at?: string | null;
  refused_reason?: string | null;
  salesperson_id?: string | null;
  assigned_to?: string | null;
  source?: string | null;
  margine_totale_percentuale?: number | string | null;
  margine_pct_snapshot?: number | string | null;
  totale_costo_interno?: number | string | null;
  totale_overhead?: number | string | null;
}

export interface CommercialOpportunityRow {
  id: string;
  contact_id?: string | null;
  assigned_to?: string | null;
  status?: string | null;
  value?: number | string | null;
  probability?: number | string | null;
  expected_close_date?: string | null;
  next_action?: string | null;
  next_action_date?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  source?: string | null;
  lost_reason?: string | null;
  loss_reason?: string | null;
  lost_reason_category?: string | null;
  competitor_won?: string | null;
}

export interface CommercialOrderRow {
  id: string;
  quote_id?: string | null;
  quote_number?: string | null;
  order_type?: string | null;
  total_amount?: number | string | null;
  created_at?: string | null;
  status?: string | null;
  fulfillment_status?: string | null;
}

export interface CommercialPerformanceReportInput {
  now?: Date;
  monthlyTargetCents?: number;
  contacts: CommercialContactRow[];
  appointments: CommercialAppointmentRow[];
  quotes: CommercialQuoteRow[];
  opportunities: CommercialOpportunityRow[];
  orders: CommercialOrderRow[];
}

export type CommercialSyncActionSeverity = "good" | "info" | "warning" | "critical";

export interface CommercialPerformanceReport {
  sync: {
    healthScore: number;
    healthLabel: "Allineato" | "Da controllare" | "Critico";
    totalIssues: number;
    quotesWithoutContact: number;
    quotesWithoutOpportunity: number;
    acceptedQuotesWithoutOrder: number;
    acceptedQuotesWithoutWonOpportunity: number;
    appointmentsWithoutContact: number;
    opportunitiesWithoutContact: number;
    ordersWithoutQuote: number;
    lostOpportunitiesWithoutReason: number;
    unscoredLeads: number;
    quoteContactLinkPct: number;
    quoteOpportunityLinkPct: number;
    acceptedSalesLoopPct: number;
    actions: Array<{
      key: string;
      title: string;
      detail: string;
      severity: CommercialSyncActionSeverity;
    }>;
  };
  quotes: {
    issued: number;
    accepted: number;
    rejected: number;
    open: number;
    totalValueCents: number;
    acceptedValueCents: number;
    rejectedValueCents: number;
    averageValueCents: number;
    acceptanceRate: number;
    avgAppointmentToQuoteDays: number | null;
    avgQuoteToSaleDays: number | null;
  };
  forecast: {
    openValueCents: number;
    weighted30Cents: number;
    weighted60Cents: number;
    weighted90Cents: number;
    weightedTotalCents: number;
    openWithoutNextStep: number;
    wonThisMonthCents: number;
    monthlyTargetCents: number | null;
    monthlyTargetGapCents: number | null;
    monthlyTargetRisk: "ok" | "attenzione" | "rischio" | "target_non_configurato";
  };
  leadQuality: {
    total: number;
    scored: number;
    good: number;
    poor: number;
    disqualified: number;
    averageScore: number | null;
    topSegments: Array<{
      label: string;
      leads: number;
      good: number;
      poor: number;
      averageScore: number | null;
    }>;
  };
  margin: {
    estimatedMarginCents: number;
    averageMarginPct: number | null;
    marginKnownCount: number;
    quoteCount: number;
    coveragePct: number;
    dataQualityWarning: string | null;
  };
  lossReasons: Array<{
    reason: string;
    count: number;
    valueCents: number;
  }>;
}

const ACCEPTED_QUOTE_STATUSES = new Set(["accettata", "accepted", "firmata", "signed", "won", "vinta"]);
const REJECTED_QUOTE_STATUSES = new Set(["rifiutata", "rejected", "refused", "persa", "lost"]);
const OPEN_QUOTE_STATUSES = new Set(["bozza", "draft", "inviata", "sent", "aperta", "open", "scaduta", "expired"]);

export function buildCommercialPerformanceReport(input: CommercialPerformanceReportInput): CommercialPerformanceReport {
  const now = input.now ?? new Date();
  const contactsById = new Map(input.contacts.map((contact) => [contact.id, contact]));
  const opportunitiesById = new Map(input.opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const appointmentsByContact = groupBy(input.appointments, (appointment) => appointment.contact_id ?? "");
  const ordersByQuote = groupBy(input.orders, (order) => order.quote_id ?? "");

  const quotes = input.quotes.filter((quote) => !isDeletedLikeStatus(quote.status));
  const issuedQuotes = quotes.filter((quote) => !isDraftOnlyQuote(quote));
  const acceptedQuotes = quotes.filter((quote) => isAcceptedQuote(quote));
  const rejectedQuotes = quotes.filter((quote) => isRejectedQuote(quote));
  const openQuotes = quotes.filter((quote) => isOpenQuote(quote));
  const quoteValues = quotes.map((quote) => quoteValueCents(quote));
  const totalQuoteValueCents = sum(quoteValues);
  const acceptedQuoteValueCents = sum(acceptedQuotes.map((quote) => quoteValueCents(quote)));
  const rejectedQuoteValueCents = sum(rejectedQuotes.map((quote) => quoteValueCents(quote)));
  const appointmentToQuoteDays = quotes
    .map((quote) => computeAppointmentToQuoteDays(quote, appointmentsByContact.get(quote.contact_id ?? "") ?? []))
    .filter(isNumber);
  const quoteToSaleDays = acceptedQuotes
    .map((quote) => computeQuoteToSaleDays(quote, ordersByQuote.get(quote.id) ?? [], opportunitiesById.get(quote.opportunity_id ?? "")))
    .filter(isNumber);

  const openOpportunities = input.opportunities.filter((opportunity) => isOpenOpportunity(opportunity.status));
  const forecast = buildForecast(openOpportunities, input.opportunities, now, input.monthlyTargetCents ?? null);
  const leadQuality = buildLeadQuality(input.contacts);
  const margin = buildMargin(quotes);
  const lossReasons = buildLossReasons(input.opportunities, rejectedQuotes);
  const sync = buildSyncHealth({
    contacts: input.contacts,
    appointments: input.appointments,
    quotes,
    acceptedQuotes,
    opportunities: input.opportunities,
    orders: input.orders,
    contactsById,
    opportunitiesById,
    ordersByQuote,
  });

  return {
    sync,
    quotes: {
      issued: issuedQuotes.length,
      accepted: acceptedQuotes.length,
      rejected: rejectedQuotes.length,
      open: openQuotes.length,
      totalValueCents: totalQuoteValueCents,
      acceptedValueCents: acceptedQuoteValueCents,
      rejectedValueCents: rejectedQuoteValueCents,
      averageValueCents: quotes.length ? Math.round(totalQuoteValueCents / quotes.length) : 0,
      acceptanceRate: issuedQuotes.length ? roundOne((acceptedQuotes.length / issuedQuotes.length) * 100) : 0,
      avgAppointmentToQuoteDays: averageNullable(appointmentToQuoteDays),
      avgQuoteToSaleDays: averageNullable(quoteToSaleDays),
    },
    forecast,
    leadQuality,
    margin,
    lossReasons,
  };
}

function buildSyncHealth({
  contacts,
  appointments,
  quotes,
  acceptedQuotes,
  opportunities,
  orders,
  contactsById,
  opportunitiesById,
  ordersByQuote,
}: {
  contacts: CommercialContactRow[];
  appointments: CommercialAppointmentRow[];
  quotes: CommercialQuoteRow[];
  acceptedQuotes: CommercialQuoteRow[];
  opportunities: CommercialOpportunityRow[];
  orders: CommercialOrderRow[];
  contactsById: Map<string, CommercialContactRow>;
  opportunitiesById: Map<string, CommercialOpportunityRow>;
  ordersByQuote: Map<string, CommercialOrderRow[]>;
}): CommercialPerformanceReport["sync"] {
  const quotesWithoutContact = quotes.filter((quote) => !hasLinkedId(quote.contact_id, contactsById)).length;
  const quotesWithoutOpportunity = quotes.filter((quote) => !hasLinkedId(quote.opportunity_id, opportunitiesById)).length;
  const acceptedQuotesWithoutOrder = acceptedQuotes.filter((quote) => !(ordersByQuote.get(quote.id)?.length)).length;
  const acceptedQuotesWithoutWonOpportunity = acceptedQuotes.filter((quote) => {
    const opportunity = quote.opportunity_id ? opportunitiesById.get(quote.opportunity_id) : undefined;
    return !isWonStatus(opportunity?.status);
  }).length;
  const appointmentsWithoutContact = appointments.filter((appointment) => shouldAuditAppointmentContact(appointment) && !hasLinkedId(appointment.contact_id, contactsById)).length;
  const opportunitiesWithoutContact = opportunities.filter((opportunity) => !hasLinkedId(opportunity.contact_id, contactsById)).length;
  const ordersWithoutQuote = orders.filter((order) => shouldAuditOrderQuote(order)).length;
  const lostOpportunitiesWithoutReason = opportunities.filter((opportunity) => isLostStatus(opportunity.status) && !hasLossReason(opportunity)).length;
  const unscoredLeads = contacts.filter((contact) => contactScore(contact) === null).length;
  const totalIssues =
    quotesWithoutContact +
    quotesWithoutOpportunity +
    acceptedQuotesWithoutOrder +
    acceptedQuotesWithoutWonOpportunity +
    appointmentsWithoutContact +
    opportunitiesWithoutContact +
    ordersWithoutQuote +
    lostOpportunitiesWithoutReason +
    unscoredLeads;
  const healthScore = computeSyncScore({
    quotesWithoutContact,
    quotesWithoutOpportunity,
    acceptedQuotesWithoutOrder,
    acceptedQuotesWithoutWonOpportunity,
    appointmentsWithoutContact,
    opportunitiesWithoutContact,
    ordersWithoutQuote,
    lostOpportunitiesWithoutReason,
    unscoredLeads,
  });

  return {
    healthScore,
    healthLabel: syncHealthLabel(healthScore),
    totalIssues,
    quotesWithoutContact,
    quotesWithoutOpportunity,
    acceptedQuotesWithoutOrder,
    acceptedQuotesWithoutWonOpportunity,
    appointmentsWithoutContact,
    opportunitiesWithoutContact,
    ordersWithoutQuote,
    lostOpportunitiesWithoutReason,
    unscoredLeads,
    quoteContactLinkPct: ratePct(quotes.length - quotesWithoutContact, quotes.length),
    quoteOpportunityLinkPct: ratePct(quotes.length - quotesWithoutOpportunity, quotes.length),
    acceptedSalesLoopPct: ratePct(acceptedQuotes.length - acceptedQuotesWithoutOrder, acceptedQuotes.length),
    actions: buildSyncActions({
      quotesWithoutContact,
      quotesWithoutOpportunity,
      acceptedQuotesWithoutOrder,
      acceptedQuotesWithoutWonOpportunity,
      appointmentsWithoutContact,
      opportunitiesWithoutContact,
      ordersWithoutQuote,
      lostOpportunitiesWithoutReason,
      unscoredLeads,
    }),
  };
}

function buildSyncActions(issues: {
  quotesWithoutContact: number;
  quotesWithoutOpportunity: number;
  acceptedQuotesWithoutOrder: number;
  acceptedQuotesWithoutWonOpportunity: number;
  appointmentsWithoutContact: number;
  opportunitiesWithoutContact: number;
  ordersWithoutQuote: number;
  lostOpportunitiesWithoutReason: number;
  unscoredLeads: number;
}): CommercialPerformanceReport["sync"]["actions"] {
  const actions: CommercialPerformanceReport["sync"]["actions"] = [];

  if (issues.quotesWithoutContact || issues.quotesWithoutOpportunity) {
    actions.push({
      key: "connect-quotes",
      title: "Collega preventivi a contatto e opportunità",
      detail: `${issues.quotesWithoutContact} senza contatto, ${issues.quotesWithoutOpportunity} senza opportunità.`,
      severity: "critical",
    });
  }

  if (issues.appointmentsWithoutContact) {
    actions.push({
      key: "connect-appointments",
      title: "Aggancia gli appuntamenti ai contatti",
      detail: `${issues.appointmentsWithoutContact} appuntamenti non sono attribuibili a un lead CRM.`,
      severity: "warning",
    });
  }

  if (issues.acceptedQuotesWithoutOrder || issues.acceptedQuotesWithoutWonOpportunity || issues.ordersWithoutQuote) {
    actions.push({
      key: "close-sales-loop",
      title: "Chiudi il loop vendita",
      detail: `${issues.acceptedQuotesWithoutOrder} preventivi accettati senza ordine, ${issues.acceptedQuotesWithoutWonOpportunity} senza opportunità vinta, ${issues.ordersWithoutQuote} ordini senza preventivo.`,
      severity: "critical",
    });
  }

  if (issues.unscoredLeads) {
    actions.push({
      key: "score-leads",
      title: "Completa score ICP/AI lead",
      detail: `${issues.unscoredLeads} lead non hanno score, quindi qualità e scalabilità campagne restano parziali.`,
      severity: "warning",
    });
  }

  if (issues.lostOpportunitiesWithoutReason) {
    actions.push({
      key: "fill-loss-reasons",
      title: "Compila i motivi di perdita",
      detail: `${issues.lostOpportunitiesWithoutReason} opportunità perse non spiegano perché il budget non ha convertito.`,
      severity: "info",
    });
  }

  if (!actions.length) {
    actions.push({
      key: "sync-ok",
      title: "Dati commerciali allineati",
      detail: "Contatti, appuntamenti, preventivi, opportunità e ordini sono collegati per i KPI principali.",
      severity: "good",
    });
  }

  return actions;
}

function computeSyncScore(issues: {
  quotesWithoutContact: number;
  quotesWithoutOpportunity: number;
  acceptedQuotesWithoutOrder: number;
  acceptedQuotesWithoutWonOpportunity: number;
  appointmentsWithoutContact: number;
  opportunitiesWithoutContact: number;
  ordersWithoutQuote: number;
  lostOpportunitiesWithoutReason: number;
  unscoredLeads: number;
}) {
  const penalty =
    issues.quotesWithoutContact * 12 +
    issues.quotesWithoutOpportunity * 12 +
    issues.acceptedQuotesWithoutOrder * 16 +
    issues.acceptedQuotesWithoutWonOpportunity * 12 +
    issues.appointmentsWithoutContact * 8 +
    issues.opportunitiesWithoutContact * 10 +
    issues.ordersWithoutQuote * 10 +
    issues.lostOpportunitiesWithoutReason * 6 +
    issues.unscoredLeads * 5;
  return clamp(100 - penalty, 0, 100);
}

function syncHealthLabel(score: number): CommercialPerformanceReport["sync"]["healthLabel"] {
  if (score >= 90) return "Allineato";
  if (score >= 70) return "Da controllare";
  return "Critico";
}

function hasLinkedId<T>(id: string | null | undefined, rowsById: Map<string, T>) {
  const cleanId = cleanLabel(id);
  return Boolean(cleanId && rowsById.has(cleanId));
}

function hasLossReason(opportunity: CommercialOpportunityRow) {
  return Boolean(cleanLabel(opportunity.lost_reason_category) || cleanLabel(opportunity.lost_reason) || cleanLabel(opportunity.loss_reason) || cleanLabel(opportunity.competitor_won));
}

function shouldAuditAppointmentContact(appointment: CommercialAppointmentRow) {
  if (appointment.is_blocked_slot) return false;
  if (cleanLabel(appointment.order_id)) return false;
  const type = normalizeLookup(appointment.appointment_type);
  if (!type) return true;
  return !["blocked", "bloccato", "inizio lavori", "fine lavori", "posa prova", "collaudo", "verifica cantiere"].includes(type);
}

function shouldAuditOrderQuote(order: CommercialOrderRow) {
  if (cleanLabel(order.quote_id) || cleanLabel(order.quote_number)) return false;
  const type = normalizeLookup(order.order_type);
  return !["commessa", "cantiere", "lavoro", "work order"].includes(type);
}

function ratePct(numerator: number, denominator: number) {
  if (denominator <= 0) return 100;
  return Math.round((Math.max(0, numerator) / denominator) * 100);
}

function buildForecast(
  openOpportunities: CommercialOpportunityRow[],
  allOpportunities: CommercialOpportunityRow[],
  now: Date,
  monthlyTargetCents: number | null,
): CommercialPerformanceReport["forecast"] {
  let weighted30Cents = 0;
  let weighted60Cents = 0;
  let weighted90Cents = 0;
  let openWithoutNextStep = 0;
  const todayIso = isoDate(now);

  for (const opportunity of openOpportunities) {
    const valueCents = opportunityValueCents(opportunity);
    const weightedCents = Math.round(valueCents * forecastProbability(opportunity));
    const expectedDate = parseDate(opportunity.expected_close_date);
    const days = expectedDate ? diffDays(now, expectedDate) : null;

    if (!hasNextStep(opportunity, todayIso)) openWithoutNextStep += 1;
    if (days !== null && days >= 0 && days <= 30) weighted30Cents += weightedCents;
    else if (days !== null && days <= 60) weighted60Cents += weightedCents;
    else if (days !== null && days <= 90) weighted90Cents += weightedCents;
  }

  const wonThisMonthCents = sum(
    allOpportunities
      .filter((opportunity) => isWonStatus(opportunity.status) && isSameMonth(opportunity.updated_at, now))
      .map((opportunity) => opportunityValueCents(opportunity)),
  );
  const projectedMonthCents = wonThisMonthCents + weighted30Cents;
  const monthlyTargetGapCents = monthlyTargetCents === null ? null : Math.max(0, monthlyTargetCents - projectedMonthCents);

  return {
    openValueCents: sum(openOpportunities.map((opportunity) => opportunityValueCents(opportunity))),
    weighted30Cents,
    weighted60Cents,
    weighted90Cents,
    weightedTotalCents: weighted30Cents + weighted60Cents + weighted90Cents,
    openWithoutNextStep,
    wonThisMonthCents,
    monthlyTargetCents,
    monthlyTargetGapCents,
    monthlyTargetRisk: computeTargetRisk(projectedMonthCents, monthlyTargetCents),
  };
}

function buildLeadQuality(contacts: CommercialContactRow[]): CommercialPerformanceReport["leadQuality"] {
  const scoredContacts = contacts
    .map((contact) => ({ contact, score: contactScore(contact) }))
    .filter((item): item is { contact: CommercialContactRow; score: number } => item.score !== null);
  const good = scoredContacts.filter((item) => item.score >= 70).length;
  const poor = scoredContacts.filter((item) => item.score < 40).length;
  const disqualified = contacts.filter(isDisqualifiedLead).length;
  const segments = new Map<string, number[]>();

  for (const item of scoredContacts) {
    const label = leadSegmentLabel(item.contact);
    const scores = segments.get(label) ?? [];
    scores.push(item.score);
    segments.set(label, scores);
  }

  return {
    total: contacts.length,
    scored: scoredContacts.length,
    good,
    poor,
    disqualified,
    averageScore: averageNullable(scoredContacts.map((item) => item.score)),
    topSegments: Array.from(segments.entries())
      .map(([label, scores]) => ({
        label,
        leads: scores.length,
        good: scores.filter((score) => score >= 70).length,
        poor: scores.filter((score) => score < 40).length,
        averageScore: averageNullable(scores),
      }))
      .sort((a, b) => b.good - a.good || b.leads - a.leads || (b.averageScore ?? 0) - (a.averageScore ?? 0))
      .slice(0, 6),
  };
}

function buildMargin(quotes: CommercialQuoteRow[]): CommercialPerformanceReport["margin"] {
  const marginRows = quotes
    .map((quote) => {
      const valueCents = quoteValueCents(quote);
      const marginCents = quoteMarginCents(quote);
      return marginCents === null || valueCents <= 0 ? null : { valueCents, marginCents };
    })
    .filter((row): row is { valueCents: number; marginCents: number } => row !== null);
  const estimatedMarginCents = sum(marginRows.map((row) => row.marginCents));
  const knownValueCents = sum(marginRows.map((row) => row.valueCents));
  const quoteCount = quotes.length;
  const marginKnownCount = marginRows.length;

  return {
    estimatedMarginCents,
    averageMarginPct: knownValueCents > 0 ? roundOne((estimatedMarginCents / knownValueCents) * 100) : null,
    marginKnownCount,
    quoteCount,
    coveragePct: quoteCount > 0 ? Math.round((marginKnownCount / quoteCount) * 100) : 0,
    dataQualityWarning:
      quoteCount > 0 && marginKnownCount < quoteCount
        ? "Alcuni preventivi non hanno margine o costo interno valorizzato."
        : null,
  };
}

function buildLossReasons(
  opportunities: CommercialOpportunityRow[],
  rejectedQuotes: CommercialQuoteRow[],
): CommercialPerformanceReport["lossReasons"] {
  const grouped = new Map<string, { count: number; valueCents: number }>();

  for (const opportunity of opportunities) {
    if (!isLostStatus(opportunity.status)) continue;
    addLoss(grouped, normalizeLossReason(opportunity.lost_reason_category || opportunity.lost_reason || opportunity.loss_reason || opportunity.competitor_won), opportunityValueCents(opportunity));
  }

  for (const quote of rejectedQuotes) {
    addLoss(grouped, normalizeLossReason(quote.refused_reason), quoteValueCents(quote));
  }

  return Array.from(grouped.entries())
    .map(([reason, item]) => ({ reason, count: item.count, valueCents: item.valueCents }))
    .sort((a, b) => b.valueCents - a.valueCents || b.count - a.count)
    .slice(0, 8);
}

function addLoss(grouped: Map<string, { count: number; valueCents: number }>, reason: string, valueCents: number) {
  const current = grouped.get(reason) ?? { count: 0, valueCents: 0 };
  current.count += 1;
  current.valueCents += valueCents;
  grouped.set(reason, current);
}

function computeAppointmentToQuoteDays(quote: CommercialQuoteRow, appointments: CommercialAppointmentRow[]) {
  const quoteDate = parseDate(quote.created_at);
  if (!quoteDate) return null;
  const previousAppointments = appointments
    .map((appointment) => parseDate(appointment.appointment_date))
    .filter((date): date is Date => Boolean(date) && date.getTime() <= quoteDate.getTime())
    .sort((a, b) => b.getTime() - a.getTime());
  const appointmentDate = previousAppointments[0];
  return appointmentDate ? diffDays(appointmentDate, quoteDate) : null;
}

function computeQuoteToSaleDays(
  quote: CommercialQuoteRow,
  orders: CommercialOrderRow[],
  opportunity?: CommercialOpportunityRow,
) {
  const quoteDate = parseDate(quote.created_at);
  if (!quoteDate) return null;
  const orderDate = orders.map((order) => parseDate(order.created_at)).filter(Boolean).sort(sortDatesAsc)[0] as Date | undefined;
  const opportunityWonDate = isWonStatus(opportunity?.status) ? parseDate(opportunity?.updated_at) : null;
  const saleDate = orderDate ?? opportunityWonDate;
  return saleDate ? diffDays(quoteDate, saleDate) : null;
}

function quoteValueCents(quote: CommercialQuoteRow) {
  return toCents(firstNumber(quote.total, quote.subtotal));
}

function opportunityValueCents(opportunity: CommercialOpportunityRow) {
  return toCents(opportunity.value);
}

function quoteMarginCents(quote: CommercialQuoteRow) {
  const valueCents = quoteValueCents(quote);
  const internalCost = toCents(quote.totale_costo_interno);
  const overhead = toCents(quote.totale_overhead);
  if (valueCents > 0 && (internalCost > 0 || overhead > 0)) return valueCents - internalCost - overhead;

  const marginPct = firstNumber(quote.margine_totale_percentuale, quote.margine_pct_snapshot);
  if (valueCents > 0 && marginPct !== null) return Math.round(valueCents * (Number(marginPct) / 100));
  return null;
}

function contactScore(contact: CommercialContactRow) {
  const values = [contact.icp_score, contact.lead_score, contact.ai_score].map(toNumber).filter(isNumber);
  return values.length ? Math.round(sum(values) / values.length) : null;
}

function leadSegmentLabel(contact: CommercialContactRow) {
  return cleanLabel(contact.attr_campaign) ||
    cleanLabel(contact.source_campaign_id) ||
    cleanLabel(contact.source) ||
    cleanLabel(contact.province) ||
    cleanLabel(contact.city) ||
    "Sorgente non tracciata";
}

function forecastProbability(opportunity: CommercialOpportunityRow) {
  const probability = toNumber(opportunity.probability);
  if (probability !== null && probability > 0) return clamp(probability, 0, 100) / 100;
  return 0.3;
}

function hasNextStep(opportunity: CommercialOpportunityRow, todayIso: string) {
  const hasAction = Boolean(opportunity.next_action?.trim());
  const hasFutureDate = Boolean(opportunity.next_action_date && opportunity.next_action_date >= todayIso);
  return hasAction || hasFutureDate;
}

function computeTargetRisk(projectedMonthCents: number, monthlyTargetCents: number | null) {
  if (!monthlyTargetCents || monthlyTargetCents <= 0) return "target_non_configurato";
  const ratio = projectedMonthCents / monthlyTargetCents;
  if (ratio >= 1) return "ok";
  if (ratio >= 0.75) return "attenzione";
  return "rischio";
}

function isAcceptedQuote(quote: CommercialQuoteRow) {
  return ACCEPTED_QUOTE_STATUSES.has(normalizeLookup(quote.status)) || Boolean(quote.signed_at);
}

function isRejectedQuote(quote: CommercialQuoteRow) {
  return REJECTED_QUOTE_STATUSES.has(normalizeLookup(quote.status)) || Boolean(quote.refused_at);
}

function isOpenQuote(quote: CommercialQuoteRow) {
  const status = normalizeLookup(quote.status);
  return OPEN_QUOTE_STATUSES.has(status) && !isAcceptedQuote(quote) && !isRejectedQuote(quote);
}

function isDraftOnlyQuote(quote: CommercialQuoteRow) {
  return normalizeLookup(quote.status) === "bozza" && !quote.sent_at && !quote.signed_at;
}

function isOpenOpportunity(status: string | null | undefined) {
  const value = normalizeLookup(status);
  return !["won", "closed won", "vinto", "lost", "closed lost", "perso", "cancelled", "canceled", "annullato"].includes(value);
}

function isWonStatus(status: string | null | undefined) {
  const value = normalizeLookup(status);
  return ["won", "closed won", "vinto"].includes(value);
}

function isLostStatus(status: string | null | undefined) {
  const value = normalizeLookup(status);
  return ["lost", "closed lost", "perso"].includes(value);
}

function isDeletedLikeStatus(status: string | null | undefined) {
  return ["deleted", "eliminato"].includes(normalizeLookup(status));
}

function isDisqualifiedLead(contact: CommercialContactRow) {
  const status = normalizeLookup(contact.stato);
  const tags = (contact.tags ?? []).map(normalizeLookup).join(" ");
  return /scart|non qualific|fuori zona|non idone/.test(`${status} ${tags}`);
}

function normalizeLossReason(value: string | null | undefined) {
  const normalized = normalizeLookup(value);
  if (!normalized) return "non indicato";
  if (/prezz|cost|budget|caro/.test(normalized)) return "prezzo";
  if (/zona|area|servib|distan/.test(normalized)) return "zona non servita";
  if (/competitor|concorrent/.test(normalized)) return "competitor";
  if (/tempo|temp|urgen|ritard/.test(normalized)) return "tempi";
  if (/qualificat|idone|scart|fuori target/.test(normalized)) return "cliente non qualificato";
  return normalized;
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }
  return grouped;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffDays(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

function isSameMonth(value: string | null | undefined, now: Date) {
  const date = parseDate(value);
  return Boolean(date && date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth());
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function sortDatesAsc(a: Date | null, b: Date | null) {
  return (a?.getTime() ?? 0) - (b?.getTime() ?? 0);
}

function averageNullable(values: number[]) {
  return values.length ? roundOne(sum(values) / values.length) : null;
}

function firstNumber(...values: Array<number | string | null | undefined>) {
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toCents(value: number | string | null | undefined) {
  const parsed = toNumber(value);
  return parsed === null ? 0 : Math.round(parsed * 100);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sum(values: number[]) {
  return values.reduce((acc, value) => acc + value, 0);
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cleanLabel(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizeLookup(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}
