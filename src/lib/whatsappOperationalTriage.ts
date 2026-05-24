import type { Json } from "@/integrations/supabase/types";

export type WhatsAppOperationalIntent =
  | "rapportino"
  | "ddt"
  | "foto_cantiere"
  | "presenze"
  | "segnalazione"
  | "domanda"
  | "conferma"
  | "annulla"
  | "unknown";

export type WhatsAppOperationalPriority = "alta" | "media" | "bassa";

export interface WhatsAppOperationalTriage {
  intent: WhatsAppOperationalIntent;
  confidence: number;
  priority: WhatsAppOperationalPriority;
  requiresReview: boolean;
  route: string;
  title: string;
  summary: string;
  suggestedAction: string;
  signals: string[];
  source: "saved" | "local";
}

export interface WhatsAppOperationalMessageLike {
  ai_confidence?: number | null;
  ai_extracted_data?: Json | null;
  ai_intent?: string | null;
  content_text?: string | null;
  message_type?: string | null;
  processing_error?: string | null;
  processing_status?: string | null;
}

type KeywordRule = {
  intent: WhatsAppOperationalIntent;
  route: string;
  title: string;
  suggestedAction: string;
  priority: WhatsAppOperationalPriority;
  keywords: string[];
  mediaTypes?: string[];
};

const RULES: KeywordRule[] = [
  {
    intent: "segnalazione",
    route: "Responsabile sicurezza",
    title: "Sicurezza / urgenza",
    suggestedAction: "Apri escalation e chiedi foto/posizione se mancano.",
    priority: "alta",
    keywords: ["sicurezza", "incidente", "infortunio", "pericolo", "pericoloso", "caduta", "ferito", "emergenza", "dpi", "ponteggio", "rischio"],
  },
  {
    intent: "ddt",
    route: "Magazzino / amministrazione",
    title: "DDT o documento merce",
    suggestedAction: "Verifica fornitore, commessa e materiali prima di registrare.",
    priority: "alta",
    keywords: ["ddt", "documento di trasporto", "bolla", "merce", "consegna", "fornitore", "ricevuto materiale"],
    mediaTypes: ["image", "document"],
  },
  {
    intent: "rapportino",
    route: "Rapportini cantiere",
    title: "Rapportino lavori",
    suggestedAction: "Crea o aggiorna il rapportino del giorno e manda in approvazione.",
    priority: "media",
    keywords: ["rapportino", "ore", "oggi", "lavori fatti", "abbiamo fatto", "materiali usati", "fine giornata", "lavorato"],
    mediaTypes: ["audio"],
  },
  {
    intent: "presenze",
    route: "Timbrature",
    title: "Presenza / timbratura",
    suggestedAction: "Registra entrata o uscita se l'operatore e la commessa sono chiari.",
    priority: "media",
    keywords: ["timbro", "timbratura", "entrata", "uscita", "sono arrivato", "vado via", "fine turno", "inizio turno"],
  },
  {
    intent: "foto_cantiere",
    route: "Diario commessa",
    title: "Foto cantiere",
    suggestedAction: "Classifica la foto e collegala al diario della commessa.",
    priority: "bassa",
    keywords: ["foto", "avanzamento", "posa", "prima", "dopo", "cantiere"],
    mediaTypes: ["image", "video"],
  },
  {
    intent: "annulla",
    route: "Chat operativa",
    title: "Annullamento",
    suggestedAction: "Interrompi l'azione proposta e chiedi quale dato correggere.",
    priority: "media",
    keywords: ["annulla", "cancella", "non confermo", "sbagliato", "errore"],
  },
  {
    intent: "conferma",
    route: "Chat operativa",
    title: "Conferma",
    suggestedAction: "Completa l'azione in attesa se il contesto è chiaro.",
    priority: "media",
    keywords: ["confermo", "ok", "va bene", "procedi", "si", "sì"],
  },
  {
    intent: "domanda",
    route: "Operatore / Silvio",
    title: "Domanda operativa",
    suggestedAction: "Rispondi o passa all'ufficio se servono dati non certi.",
    priority: "bassa",
    keywords: ["?", "quando", "dove", "come", "posso", "serve", "quanto"],
  },
];

const INTENT_COPY: Record<WhatsAppOperationalIntent, Pick<WhatsAppOperationalTriage, "route" | "title" | "suggestedAction" | "priority">> = {
  rapportino: {
    route: "Rapportini cantiere",
    title: "Rapportino lavori",
    suggestedAction: "Crea o aggiorna il rapportino del giorno e manda in approvazione.",
    priority: "media",
  },
  ddt: {
    route: "Magazzino / amministrazione",
    title: "DDT o documento merce",
    suggestedAction: "Verifica fornitore, commessa e materiali prima di registrare.",
    priority: "alta",
  },
  foto_cantiere: {
    route: "Diario commessa",
    title: "Foto cantiere",
    suggestedAction: "Classifica la foto e collegala al diario della commessa.",
    priority: "bassa",
  },
  presenze: {
    route: "Timbrature",
    title: "Presenza / timbratura",
    suggestedAction: "Registra entrata o uscita se l'operatore e la commessa sono chiari.",
    priority: "media",
  },
  segnalazione: {
    route: "Responsabile operativo",
    title: "Segnalazione cantiere",
    suggestedAction: "Apri una segnalazione e assegna il responsabile corretto.",
    priority: "media",
  },
  domanda: {
    route: "Operatore / Silvio",
    title: "Domanda operativa",
    suggestedAction: "Rispondi o passa all'ufficio se servono dati non certi.",
    priority: "bassa",
  },
  conferma: {
    route: "Chat operativa",
    title: "Conferma",
    suggestedAction: "Completa l'azione in attesa se il contesto è chiaro.",
    priority: "media",
  },
  annulla: {
    route: "Chat operativa",
    title: "Annullamento",
    suggestedAction: "Interrompi l'azione proposta e chiedi quale dato correggere.",
    priority: "media",
  },
  unknown: {
    route: "Da smistare",
    title: "Messaggio da capire",
    suggestedAction: "Chiedi chiarimento o passa all'ufficio.",
    priority: "media",
  },
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function asRecord(value: Json | null | undefined): Record<string, Json | undefined> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : null;
}

function clampConfidence(value: number) {
  return Math.max(0.1, Math.min(0.98, Number(value.toFixed(2))));
}

function safeIntent(value: string | null | undefined): WhatsAppOperationalIntent | null {
  return value && value in INTENT_COPY ? value as WhatsAppOperationalIntent : null;
}

function savedTriage(value: Json | null | undefined): WhatsAppOperationalTriage | null {
  const raw = asRecord(asRecord(value)?.operational_triage);
  const intent = safeIntent(typeof raw?.intent === "string" ? raw.intent : null);
  if (!raw || !intent) return null;

  const copy = INTENT_COPY[intent];
  const confidence = typeof raw.confidence === "number" ? raw.confidence : 0.6;
  const priority = raw.priority === "alta" || raw.priority === "media" || raw.priority === "bassa"
    ? raw.priority
    : copy.priority;

  return {
    intent,
    confidence: clampConfidence(confidence),
    priority,
    requiresReview: typeof raw.requires_review === "boolean" ? raw.requires_review : confidence < 0.72,
    route: typeof raw.route === "string" ? raw.route : copy.route,
    title: typeof raw.title === "string" ? raw.title : copy.title,
    summary: typeof raw.summary === "string" ? raw.summary : "Classificazione salvata da Silvio.",
    suggestedAction: typeof raw.suggested_action === "string" ? raw.suggested_action : copy.suggestedAction,
    signals: Array.isArray(raw.signals) ? raw.signals.filter((s): s is string => typeof s === "string") : [],
    source: "saved",
  };
}

function scoreRule(rule: KeywordRule, text: string, messageType: string) {
  const keywordHits = rule.keywords.filter((keyword) => text.includes(normalizeText(keyword)));
  const mediaHit = rule.mediaTypes?.includes(messageType) ?? false;
  const score = keywordHits.length * 2 + (mediaHit ? 1.5 : 0);
  return { score, signals: [...keywordHits, ...(mediaHit ? [`media:${messageType}`] : [])] };
}

export function classifyWhatsAppOperationalMessage(
  message: WhatsAppOperationalMessageLike,
): WhatsAppOperationalTriage {
  const existing = savedTriage(message.ai_extracted_data);
  if (existing) return existing;

  const messageType = message.message_type ?? "text";
  const text = normalizeText([
    message.content_text,
    message.processing_error,
    message.ai_intent,
  ].filter(Boolean).join(" "));

  let best = {
    rule: null as KeywordRule | null,
    score: 0,
    signals: [] as string[],
  };

  for (const rule of RULES) {
    const scored = scoreRule(rule, text, messageType);
    if (scored.score > best.score) {
      best = { rule, score: scored.score, signals: scored.signals };
    }
  }

  const storedIntent = safeIntent(message.ai_intent);
  const intent = best.rule?.intent ?? storedIntent ?? (
    messageType === "image" ? "foto_cantiere" : "unknown"
  );
  const copy = best.rule ?? INTENT_COPY[intent];
  const storedConfidence = typeof message.ai_confidence === "number" ? message.ai_confidence : null;
  const confidence = clampConfidence(
    storedConfidence ?? (best.score > 0 ? 0.54 + Math.min(best.score, 7) * 0.06 : 0.42),
  );
  const status = message.processing_status ?? "";
  const requiresReview =
    ["failed", "failed_max_retries", "requires_confirmation"].includes(status) ||
    confidence < 0.72 ||
    copy.priority === "alta";

  return {
    intent,
    confidence,
    priority: copy.priority,
    requiresReview,
    route: copy.route,
    title: copy.title,
    summary: message.processing_error
      ? `Errore elaborazione: ${message.processing_error}`
      : message.content_text?.trim() || `Messaggio ${messageType} senza testo leggibile.`,
    suggestedAction: copy.suggestedAction,
    signals: best.signals,
    source: "local",
  };
}

export function priorityClass(priority: WhatsAppOperationalPriority) {
  if (priority === "alta") return "border-rose-200 bg-rose-50 text-rose-900";
  if (priority === "media") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-sky-200 bg-sky-50 text-sky-900";
}
