export type PredictiveEmailCategory =
  | "lead"
  | "quote"
  | "customer"
  | "supplier"
  | "invoice"
  | "admin"
  | "support"
  | "spam"
  | "other";

export type PredictiveEmailPriority = "alta" | "media" | "bassa";

export interface PredictiveEmailInput {
  subject?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
  preview?: string | null;
  body?: string | null;
  attachments?: unknown;
}

export interface PredictiveEmailTarget {
  type: "lead" | "preventivo" | "fornitore" | "oda" | "ddt" | "fattura" | "ticket" | "cliente";
  label: string;
  confidence: number;
}

export interface PredictiveEmailResult {
  category: PredictiveEmailCategory;
  priority: PredictiveEmailPriority;
  confidence: number;
  reasons: string[];
  targets: PredictiveEmailTarget[];
}

type ScoreBucket = Record<PredictiveEmailCategory, number>;

const CATEGORY_ZERO: ScoreBucket = {
  lead: 0,
  quote: 0,
  customer: 0,
  supplier: 0,
  invoice: 0,
  admin: 0,
  support: 0,
  spam: 0,
  other: 0,
};

const CATEGORY_ORDER: PredictiveEmailCategory[] = [
  "lead",
  "quote",
  "supplier",
  "invoice",
  "admin",
  "support",
  "customer",
  "spam",
  "other",
];

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attachmentNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      return String(record.name ?? record.filename ?? record.file_name ?? "");
    })
    .filter(Boolean);
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function addTarget(
  targets: PredictiveEmailTarget[],
  type: PredictiveEmailTarget["type"],
  label: string,
  confidence: number,
) {
  if (targets.some((target) => target.type === type && target.label === label)) return;
  targets.push({ type, label, confidence });
}

export function predictEmailReconciliation(input: PredictiveEmailInput): PredictiveEmailResult {
  const subject = normalize(input.subject);
  const sender = normalize(`${input.fromName ?? ""} ${input.fromEmail ?? ""}`);
  const preview = normalize(input.preview);
  const body = normalize(input.body);
  const attachments = attachmentNames(input.attachments);
  const attachmentText = normalize(attachments.join(" "));
  const text = `${subject} ${sender} ${preview} ${body} ${attachmentText}`.trim();
  const scores: ScoreBucket = { ...CATEGORY_ZERO };
  const reasons: string[] = [];
  const targets: PredictiveEmailTarget[] = [];

  const score = (
    category: PredictiveEmailCategory,
    points: number,
    reason: string,
  ) => {
    scores[category] += points;
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  if (includesAny(text, ["nuovo lead", "lead sito", "richiesta contatto", "form contatto", "contattatemi"])) {
    score("lead", 42, "rilevata richiesta lead/contatto");
    addTarget(targets, "lead", "Lead CRM", 0.86);
  }
  if (includesAny(text, ["richiesta preventivo", "preventivo", "offerta", "computo", "sopralluogo", "misure"])) {
    score("quote", 38, "rilevati termini preventivo/offerta");
    addTarget(targets, "preventivo", "Preventivo", 0.82);
  }
  if (includesAny(text, ["budget", "zona", "ristrutturazione", "bagno", "serramenti", "infissi", "tetto"])) {
    score("lead", 14, "contesto commerciale edilizia");
    score("quote", 12, "dettagli utili alla preventivazione");
  }

  if (includesAny(text, ["oda", "ordine di acquisto", "ordine acquisto", "ordine n", "consegna", "ritardo", "merce", "bancali", "fornitore", "spedizione"])) {
    score("supplier", 40, "rilevato flusso fornitore/ordine");
    addTarget(targets, "fornitore", "Fornitore", 0.84);
  }
  if (includesAny(text, ["oda", "ordine di acquisto", "ordine acquisto"])) {
    addTarget(targets, "oda", "Ordine di acquisto", 0.82);
  }
  if (includesAny(text, ["ddt", "documento di trasporto", "bolla", "colli", "bancali"])) {
    score("supplier", 22, "rilevato DDT/logistica");
    addTarget(targets, "ddt", "DDT", 0.88);
  }

  if (includesAny(text, ["fattura", "ricevuta", "iva", "bonifico", "pagamento", "scadenza", "insoluto", "estratto conto"])) {
    score("invoice", 38, "rilevati termini fattura/pagamento");
    addTarget(targets, "fattura", "Fattura o pagamento", 0.82);
  }
  if (includesAny(text, ["commercialista", "contabilita", "amministrazione", "f24", "prima nota", "cassetto fiscale"])) {
    score("admin", 34, "rilevata pratica amministrativa");
  }

  if (includesAny(text, ["ticket", "assistenza", "guasto", "problema", "errore", "reclamo", "non funziona", "urgenza assistenza"])) {
    score("support", 40, "rilevata richiesta assistenza");
    addTarget(targets, "ticket", "Ticket assistenza", 0.82);
  }
  if (includesAny(text, ["cliente", "conferma appuntamento", "stato lavori", "avanzamento", "capo cantiere"])) {
    score("customer", 22, "rilevato contesto cliente/cantiere");
    addTarget(targets, "cliente", "Cliente", 0.68);
  }

  if (includesAny(text, ["unsubscribe", "offerta imperdibile", "hai vinto", "casino", "crypto", "lotteria"])) {
    score("spam", 44, "pattern spam/promozionale");
  }

  const urgentTerms = ["urgente", "entro oggi", "entro domani", "scadenza", "bloccato", "ritardo", "insoluto", "non conform", "reclamo"];
  const mediumTerms = ["rispondere", "conferma", "verifica", "approvato", "da firmare", "in allegato"];
  const priority: PredictiveEmailPriority = includesAny(text, urgentTerms)
    ? "alta"
    : includesAny(text, mediumTerms) || targets.length > 0
      ? "media"
      : "bassa";

  const best = CATEGORY_ORDER.reduce((winner, category) =>
    scores[category] > scores[winner] ? category : winner,
  "other");
  const bestScore = scores[best];
  const category: PredictiveEmailCategory = bestScore >= 20 ? best : "other";
  const confidence = Math.max(0.22, Math.min(0.94, bestScore / 86));

  return {
    category,
    priority,
    confidence,
    reasons: reasons.slice(0, 3),
    targets: targets.sort((a, b) => b.confidence - a.confidence).slice(0, 4),
  };
}

export function categoryMatchesPrediction(
  prediction: PredictiveEmailResult,
  category: string | null | undefined,
): boolean {
  if (!category) return true;
  if (category === "priority") return prediction.priority === "alta";
  return prediction.category === category;
}
