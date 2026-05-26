/**
 * healthScore — funzioni pure per calcolare health score cliente.
 *
 * Versione client-side: usata sia per anteprime UI (pre-cron) sia come
 * formula di riferimento per Elena CS edge function (verifica integrity).
 *
 * Score 0-100, breakdown:
 *   - Login frequency 30d (max 25 pt)
 *   - Features used count 30d (max 20 pt)
 *   - Tickets open vs resolved time (max 15 pt)
 *   - NPS last (max 15 pt)
 *   - Payment status (max 15 pt)
 *   - Sentiment avg (max 10 pt)
 */

export type HealthLabel = "champion" | "engaged" | "sleeping" | "at_risk" | "churned";

export interface HealthInputs {
  loginCount30d: number;
  featuresUsed30d: number;
  ticketsOpen: number;
  ticketsResolvedAvgHours: number | null;
  lastNpsScore: number | null;
  paymentStatus: string | null;
  sentimentAvg30d: number | null;
}

export interface HealthBreakdown {
  total: number;
  label: HealthLabel;
  components: {
    login: number;
    features: number;
    tickets: number;
    nps: number;
    payment: number;
    sentiment: number;
  };
  reasons: string[];
}

function labelFromScore(score: number): HealthLabel {
  if (score >= 90) return "champion";
  if (score >= 70) return "engaged";
  if (score >= 40) return "sleeping";
  if (score >= 20) return "at_risk";
  return "churned";
}

export function computeHealthScore(inputs: HealthInputs): HealthBreakdown {
  const components = {
    login: 0,
    features: 0,
    tickets: 0,
    nps: 0,
    payment: 0,
    sentiment: 0,
  };
  const reasons: string[] = [];

  // ─── Login frequency (max 25 pt) ─────────────────────────────────────
  // Soglia: 30+ login/30d = power user
  if (inputs.loginCount30d >= 60) {
    components.login = 25;
  } else if (inputs.loginCount30d >= 30) {
    components.login = 20;
    reasons.push("Login regolari ma non power-user");
  } else if (inputs.loginCount30d >= 10) {
    components.login = 12;
    reasons.push("Login sotto media (<1/giorno)");
  } else if (inputs.loginCount30d > 0) {
    components.login = 5;
    reasons.push(`Solo ${inputs.loginCount30d} login in 30gg`);
  } else {
    reasons.push("Nessun login in 30gg");
  }

  // ─── Features used count (max 20 pt) ─────────────────────────────────
  // EiC ha ~30 features. Power user usa 10+, casual usa 3-5.
  if (inputs.featuresUsed30d >= 10) {
    components.features = 20;
  } else if (inputs.featuresUsed30d >= 5) {
    components.features = 14;
    reasons.push("Pochi moduli usati — opportunità expansion");
  } else if (inputs.featuresUsed30d >= 2) {
    components.features = 8;
    reasons.push("Adozione minima — solo basics");
  } else if (inputs.featuresUsed30d === 1) {
    components.features = 3;
    reasons.push("Usa 1 sola feature — alto rischio churn");
  } else {
    reasons.push("Nessuna feature usata — sleeping");
  }

  // ─── Tickets (max 15 pt) ─────────────────────────────────────────────
  // Penalità per ticket aperti pending da giorni
  if (inputs.ticketsOpen === 0) {
    components.tickets = 15;
  } else if (inputs.ticketsOpen <= 2) {
    components.tickets = 10;
  } else if (inputs.ticketsOpen <= 5) {
    components.tickets = 5;
    reasons.push(`${inputs.ticketsOpen} ticket aperti — attenzione`);
  } else {
    reasons.push(`${inputs.ticketsOpen} ticket aperti — frustrazione probabile`);
  }
  // Bonus se risolvi velocemente
  if (
    inputs.ticketsResolvedAvgHours !== null
    && inputs.ticketsResolvedAvgHours < 4
    && components.tickets < 15
  ) {
    components.tickets = Math.min(15, components.tickets + 3);
  }

  // ─── NPS (max 15 pt) ─────────────────────────────────────────────────
  if (inputs.lastNpsScore !== null) {
    if (inputs.lastNpsScore >= 9) components.nps = 15;        // Promoter
    else if (inputs.lastNpsScore >= 7) components.nps = 10;    // Passive
    else if (inputs.lastNpsScore >= 4) {
      components.nps = 3;
      reasons.push(`NPS basso (${inputs.lastNpsScore})`);
    } else {
      components.nps = 0;
      reasons.push(`NPS detrattore (${inputs.lastNpsScore}) — INTERVIENI`);
    }
  } else {
    // NPS mai dato — neutro, nessuna penalità
    components.nps = 8;
  }

  // ─── Payment status (max 15 pt) ─────────────────────────────────────
  const ps = (inputs.paymentStatus ?? "").toLowerCase();
  if (ps === "active" || ps === "trialing") {
    components.payment = 15;
  } else if (ps === "past_due") {
    components.payment = 5;
    reasons.push("Pagamento past_due — risk immediato");
  } else if (ps === "canceled" || ps === "unpaid") {
    components.payment = 0;
    reasons.push("Subscription cancellata o non pagata");
  } else {
    components.payment = 10;  // unknown / manual
  }

  // ─── Sentiment 30d avg (max 10 pt) ──────────────────────────────────
  // sentiment_avg_30d: 1=angry, 2=frustrated, 3=neutral, 5=positive
  if (inputs.sentimentAvg30d !== null) {
    if (inputs.sentimentAvg30d >= 4.5) components.sentiment = 10;
    else if (inputs.sentimentAvg30d >= 3.5) components.sentiment = 8;
    else if (inputs.sentimentAvg30d >= 2.5) {
      components.sentiment = 4;
      reasons.push("Tone medio cliente neutrale-negativo");
    } else {
      components.sentiment = 0;
      reasons.push("Sentiment medio NEGATIVO — escalation");
    }
  } else {
    // Nessuna interazione — neutro
    components.sentiment = 5;
  }

  const total = Math.round(
    components.login + components.features + components.tickets
    + components.nps + components.payment + components.sentiment,
  );

  return {
    total,
    label: labelFromScore(total),
    components,
    reasons,
  };
}

/** Helper UI: colore/icona per health label */
export function healthLabelStyle(label: HealthLabel): {
  color: string;
  bg: string;
  emoji: string;
} {
  switch (label) {
    case "champion":
      return { color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", emoji: "💚" };
    case "engaged":
      return { color: "text-blue-700", bg: "bg-blue-50 border-blue-200", emoji: "💙" };
    case "sleeping":
      return { color: "text-amber-700", bg: "bg-amber-50 border-amber-200", emoji: "💤" };
    case "at_risk":
      return { color: "text-orange-700", bg: "bg-orange-50 border-orange-200", emoji: "⚠️" };
    case "churned":
      return { color: "text-rose-700", bg: "bg-rose-50 border-rose-200", emoji: "💔" };
  }
}
