export type OperationalIntent =
  | "rapportino"
  | "ddt"
  | "foto_cantiere"
  | "presenze"
  | "segnalazione"
  | "domanda"
  | "conferma"
  | "annulla"
  | "unknown";

export type OperationalPriority = "alta" | "media" | "bassa";

export interface OperationalTriage {
  intent: OperationalIntent;
  confidence: number;
  priority: OperationalPriority;
  requires_review: boolean;
  route: string;
  title: string;
  summary: string;
  suggested_action: string;
  signals: string[];
}

type Rule = {
  intent: OperationalIntent;
  route: string;
  title: string;
  suggested_action: string;
  priority: OperationalPriority;
  keywords: string[];
  mediaTypes?: string[];
};

const RULES: Rule[] = [
  {
    intent: "segnalazione",
    route: "Responsabile sicurezza",
    title: "Sicurezza / urgenza",
    suggested_action: "Apri escalation e chiedi foto/posizione se mancano.",
    priority: "alta",
    keywords: ["sicurezza", "incidente", "infortunio", "pericolo", "pericoloso", "caduta", "ferito", "emergenza", "dpi", "ponteggio", "rischio"],
  },
  {
    intent: "ddt",
    route: "Magazzino / amministrazione",
    title: "DDT o documento merce",
    suggested_action: "Verifica fornitore, commessa e materiali prima di registrare.",
    priority: "alta",
    keywords: ["ddt", "documento di trasporto", "bolla", "merce", "consegna", "fornitore", "ricevuto materiale"],
    mediaTypes: ["image", "document"],
  },
  {
    intent: "rapportino",
    route: "Rapportini cantiere",
    title: "Rapportino lavori",
    suggested_action: "Crea o aggiorna il rapportino del giorno e manda in approvazione.",
    priority: "media",
    keywords: ["rapportino", "ore", "oggi", "lavori fatti", "abbiamo fatto", "materiali usati", "fine giornata", "lavorato"],
    mediaTypes: ["audio"],
  },
  {
    intent: "presenze",
    route: "Timbrature",
    title: "Presenza / timbratura",
    suggested_action: "Registra entrata o uscita se l'operatore e la commessa sono chiari.",
    priority: "media",
    keywords: ["timbro", "timbratura", "entrata", "uscita", "sono arrivato", "vado via", "fine turno", "inizio turno"],
  },
  {
    intent: "foto_cantiere",
    route: "Diario commessa",
    title: "Foto cantiere",
    suggested_action: "Classifica la foto e collegala al diario della commessa.",
    priority: "bassa",
    keywords: ["foto", "avanzamento", "posa", "prima", "dopo", "cantiere"],
    mediaTypes: ["image", "video"],
  },
  {
    intent: "annulla",
    route: "Chat operativa",
    title: "Annullamento",
    suggested_action: "Interrompi l'azione proposta e chiedi quale dato correggere.",
    priority: "media",
    keywords: ["annulla", "cancella", "non confermo", "sbagliato", "errore"],
  },
  {
    intent: "conferma",
    route: "Chat operativa",
    title: "Conferma",
    suggested_action: "Completa l'azione in attesa se il contesto è chiaro.",
    priority: "media",
    keywords: ["confermo", "ok", "va bene", "procedi", "si", "sì"],
  },
  {
    intent: "domanda",
    route: "Operatore / Silvio",
    title: "Domanda operativa",
    suggested_action: "Rispondi o passa all'ufficio se servono dati non certi.",
    priority: "bassa",
    keywords: ["?", "quando", "dove", "come", "posso", "serve", "quanto"],
  },
];

const FALLBACK: Record<OperationalIntent, Omit<Rule, "intent" | "keywords" | "mediaTypes">> = {
  rapportino: {
    route: "Rapportini cantiere",
    title: "Rapportino lavori",
    suggested_action: "Crea o aggiorna il rapportino del giorno e manda in approvazione.",
    priority: "media",
  },
  ddt: {
    route: "Magazzino / amministrazione",
    title: "DDT o documento merce",
    suggested_action: "Verifica fornitore, commessa e materiali prima di registrare.",
    priority: "alta",
  },
  foto_cantiere: {
    route: "Diario commessa",
    title: "Foto cantiere",
    suggested_action: "Classifica la foto e collegala al diario della commessa.",
    priority: "bassa",
  },
  presenze: {
    route: "Timbrature",
    title: "Presenza / timbratura",
    suggested_action: "Registra entrata o uscita se l'operatore e la commessa sono chiari.",
    priority: "media",
  },
  segnalazione: {
    route: "Responsabile operativo",
    title: "Segnalazione cantiere",
    suggested_action: "Apri una segnalazione e assegna il responsabile corretto.",
    priority: "media",
  },
  domanda: {
    route: "Operatore / Silvio",
    title: "Domanda operativa",
    suggested_action: "Rispondi o passa all'ufficio se servono dati non certi.",
    priority: "bassa",
  },
  conferma: {
    route: "Chat operativa",
    title: "Conferma",
    suggested_action: "Completa l'azione in attesa se il contesto è chiaro.",
    priority: "media",
  },
  annulla: {
    route: "Chat operativa",
    title: "Annullamento",
    suggested_action: "Interrompi l'azione proposta e chiedi quale dato correggere.",
    priority: "media",
  },
  unknown: {
    route: "Da smistare",
    title: "Messaggio da capire",
    suggested_action: "Chiedi chiarimento o passa all'ufficio.",
    priority: "media",
  },
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function clampConfidence(value: number) {
  return Math.max(0.1, Math.min(0.98, Number(value.toFixed(2))));
}

function scoreRule(rule: Rule, text: string, messageType: string) {
  const keywordHits = rule.keywords.filter((keyword) => text.includes(normalizeText(keyword)));
  const mediaHit = rule.mediaTypes?.includes(messageType) ?? false;
  return {
    score: keywordHits.length * 2 + (mediaHit ? 1.5 : 0),
    signals: [...keywordHits, ...(mediaHit ? [`media:${messageType}`] : [])],
  };
}

export function classifyOperationalMessage(input: {
  contentText?: string | null;
  messageType?: string | null;
  processingError?: string | null;
}): OperationalTriage {
  const messageType = input.messageType ?? "text";
  const text = normalizeText([input.contentText, input.processingError].filter(Boolean).join(" "));
  let best: { rule: Rule | null; score: number; signals: string[] } = {
    rule: null,
    score: 0,
    signals: [],
  };

  for (const rule of RULES) {
    const scored = scoreRule(rule, text, messageType);
    if (scored.score > best.score) {
      best = { rule, score: scored.score, signals: scored.signals };
    }
  }

  const intent = best.rule?.intent ?? (messageType === "image" ? "foto_cantiere" : "unknown");
  const copy = best.rule ?? FALLBACK[intent];
  const confidence = clampConfidence(best.score > 0 ? 0.54 + Math.min(best.score, 7) * 0.06 : 0.42);

  return {
    intent,
    confidence,
    priority: copy.priority,
    requires_review: confidence < 0.72 || copy.priority === "alta",
    route: copy.route,
    title: copy.title,
    summary: input.processingError
      ? `Errore elaborazione: ${input.processingError}`
      : input.contentText?.trim() || `Messaggio ${messageType} senza testo leggibile.`,
    suggested_action: copy.suggested_action,
    signals: best.signals,
  };
}

export function buildTriagePrompt(triage: OperationalTriage): string {
  return [
    "CLASSIFICAZIONE OPERATIVA PRELIMINARE:",
    `- Intento: ${triage.intent} (${Math.round(triage.confidence * 100)}%).`,
    `- Priorità: ${triage.priority}.`,
    `- Instradamento: ${triage.route}.`,
    `- Azione suggerita: ${triage.suggested_action}`,
    triage.requires_review
      ? "- Serve revisione/conferma prima di scrivere dati critici o chiudere l'azione."
      : "- Se il contesto è chiaro puoi procedere secondo i permessi disponibili.",
  ].join("\n");
}
