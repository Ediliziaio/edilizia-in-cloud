/**
 * MP-EMAIL-AI-01 — Regex deterministiche per subject + body.
 *
 * Ordinate per PRIORITÀ: la prima che scatta vince (più specifica → meno).
 * Ogni regola = {re, categoria, matched_by?}. Le regole "spam-y" stanno in fondo
 * perché vogliamo classificare bene una newsletter editoriale prima di chiamarla spam.
 *
 * NOTE: tutto match su lowercase di subject + snippet (prime ~500 char body).
 */

import type { EmailCategoria } from "./types";

export interface RegexRule {
  re: RegExp;
  categoria: EmailCategoria;
  /** Etichetta debug "matched_by" — es. "regex:fattura/SDI". */
  matched_by: string;
}

/**
 * Lista regole. Costruita per coprire i pattern più comuni nelle email
 * di un'impresa edile italiana. Espandibile.
 *
 * IMPORTANTE: il primo match vince. Ordine = priorità.
 */
export const REGOLE_REGEX: ReadonlyArray<RegexRule> = [
  // ─── Spam aggressivo — PRIMA di tutto per evitare matches accidentali ─────
  // (es. "Offerta lampo compra adesso" non deve diventare preventivo)
  {
    re: /\b(compra(re|to)?\s+(ora|adesso|subito)|prezzo\s+stracciato|sconto\s+(esclusiv|limitat)|offerta\s+(lampo|imperdibile|del\s+secolo|esclusiva|unica)|click\s+qui\s+per\s+(vinc|comprar)|hai\s+vinto|congratulation|you've\s+won|got\s+selected)\b/i,
    categoria: "spam",
    matched_by: "regex:spam/promo-aggressiva",
  },
  {
    re: /\b(viagra|cialis|casino|btc|bitcoin\s+investment|crypto\s+(invest|guadagn)|aumenta\s+il\s+tuo\s+(pene|seno)|miracle\s+cure|hot\s+sing|nigerian\s+prince)\b/i,
    categoria: "spam",
    matched_by: "regex:spam/scam-classico",
  },

  // ─── Fattura / SDI ─────────────────────────────────────────────────────────
  {
    re: /\b(fattura(\s+(elettronica|attiva|passiva|n\.?\s*\d+))?|nota\s+di\s+credito|sdi\b|sistema\s+di\s+interscambio|aruba\s+fattur|arubapec|ricevuta\s+consegna\s+sdi)\b/i,
    categoria: "fattura",
    matched_by: "regex:fattura/SDI",
  },
  {
    re: /\b(proforma|pro[\s-]?forma|fattura\s+pro[\s-]?forma)\b/i,
    categoria: "fattura",
    matched_by: "regex:fattura/proforma",
  },

  // ─── Pratica amministrativa (AdE/INPS/SCIA/CILA/Comune/CdL) ────────────────
  {
    re: /\b(agenzia\s+(delle\s+)?entrate|ade\b|inps\b|inail\b|cassa\s+edile|durc|cila|scia|dia\b|permesso\s+di\s+costruire|paesaggistica|asseverazione|f24|enea|comune\s+di\s+\w+|pratica\s+edilizia|comunicazione\s+(comune|catasto))\b/i,
    categoria: "pratica",
    matched_by: "regex:pratica/AdE-INPS-SCIA",
  },

  // ─── Preventivo / Offerta / Computo ────────────────────────────────────────
  // Strict: "offerta" deve avere qualifier (commerciale/economica) o stare con altre kw preventivo.
  {
    re: /\b(preventivo|computo\s+metrico|capitolato|richiesta\s+(quotazione|prezzo|preventivo)|listino|sopralluogo|rilievo|offerta\s+(commerciale|economica|tecnica|d['']appalto)|cap\.\s*metr)\b/i,
    categoria: "preventivo",
    matched_by: "regex:preventivo",
  },

  // ─── Solleciti pagamento / scadenze (fattura URGENTE) ──────────────────────
  // Riprendono "fattura" ma con tono urgente → manteniamo categoria fattura
  // con da_rivedere=true via priority logic (gestito a livello edge function).
  {
    re: /\b(sollecito\s+(di\s+)?pagamento|insoluto|mora\s+pagamento|scadenza\s+fattura|pagamento\s+scaduto)\b/i,
    categoria: "fattura",
    matched_by: "regex:fattura/sollecito",
  },

  // ─── DDT / Bolla / Ordini fornitore ────────────────────────────────────────
  {
    re: /\b(ddt|bolla(\s+di\s+(consegna|accompagnamento))?|documento\s+di\s+trasporto|conferma\s+ordin|ordine\s+conferm|spedizione|consegna\s+materiale)\b/i,
    categoria: "fornitore",
    matched_by: "regex:fornitore/DDT-ordine",
  },

  // ─── Operai / HR / Cantiere ────────────────────────────────────────────────
  {
    re: /\b(cantiere|sopralluogo|squadra|operaio|caposquadra|maestranze|busta\s+paga|cedolino|ferie|permesso|malattia|infortunio|dpi\s+(consegna|scadenza)?|visita\s+medica|formazione\s+sicurezza)\b/i,
    categoria: "operaio",
    matched_by: "regex:operaio/HR-cantiere",
  },

  // ─── Opportunità / Lead ────────────────────────────────────────────────────
  // Word-boundary problem fix: usa lookahead non-word per gestire informazioni/vostri
  {
    re: /(\brichiesta\s+(informazion|contatto)|\binteressat[oa]\s+(al|ai)\s+vostr|\bcontatto\s+da\s+(sito|google|facebook|instagram|form)|\bnuovo\s+lead|\bnuova\s+richiesta|\bsono\s+interessat[oa]\s+ai\s+vostr|\binvio\s+da\s+(modulo|form))/i,
    categoria: "opportunita",
    matched_by: "regex:opportunita/richiesta",
  },

  // ─── Supporto / Ticket ─────────────────────────────────────────────────────
  {
    re: /\b(ticket\s*#?\s*\d+|case\s*#?\s*\d+|richiesta\s+(supporto|assistenza)|problema\s+(tecnico|operativo)|non\s+funziona|errore\s+sistema|bug\s+report)\b/i,
    categoria: "supporto",
    matched_by: "regex:supporto/ticket",
  },

  // ─── Notifiche di sistema (no-reply, automatiche, ricevute web) ────────────
  {
    re: /\b(notifica\s+automatica|conferma\s+(iscrizione|registrazione)|ricevuta\s+(di\s+)?(pagamento|invio|consegna)|posta\s+elettronica\s+certificata\s+ricevuta|delivery\s+(failed|notification)|mailer-daemon|undelivered\s+mail|posta\s+non\s+recapitata)\b/i,
    categoria: "notifica",
    matched_by: "regex:notifica/automatica",
  },

  // ─── Social (newsletter di piattaforme social) ─────────────────────────────
  // Catch domain mismatch in sender → social
  {
    re: /\b(linkedin|facebook|instagram|tiktok|x\s+\(twitter\)|threads|whatsapp\s+business)\b.*\b(notific|aggiornamento|connessione|like|commento|messaggio|invitat[oi])\b/i,
    categoria: "social",
    matched_by: "regex:social/piattaforma",
  },

  // ─── Newsletter editoriale / Magazine ──────────────────────────────────────
  // ATTENZIONE: questa è larga, sta DOPO le specifiche per non assorbire
  // email operative.
  {
    re: /\b(newsletter|magazine|webinar|evento\s+formativo|leggi\s+su(l)?\s+nostro\s+blog|articolo\s+settiman|edizione\s+(settimanale|mensile)|iscrivit[ie]\s+(alla\s+)?newsletter|cancella(re)?\s+iscrizione|unsubscribe)\b/i,
    categoria: "newsletter",
    matched_by: "regex:newsletter/contenuto",
  },

];

/**
 * Applica la prima regex che matcha. Restituisce match o null.
 *
 * @param text — concatenazione lowercase di subject + snippet (prime ~500 char body).
 */
export function applyRegexRules(text: string): RegexRule | null {
  if (!text) return null;
  for (const rule of REGOLE_REGEX) {
    if (rule.re.test(text)) {
      return rule;
    }
  }
  return null;
}
