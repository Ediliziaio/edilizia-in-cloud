/**
 * MP-EMAIL-AI-01 — Cascata L1 (Deno).
 *
 * Versione Deno-side dell'edge function. Inline qui (no import dal src/
 * perché edge functions girano in Deno isolato, no Vite resolution).
 *
 * Mantiene SINCRONO con `src/lib/email-ai/*.ts` — se modifichi una regex
 * lato client, ricordati di aggiornare anche qui (e viceversa).
 *
 * TODO future: estrarre regex in JSON shared per evitare duplicazione.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ════════════════════════════════════════════════════════════════════════════
// Tipi
// ════════════════════════════════════════════════════════════════════════════

export type EmailCategoria =
  | "cliente"
  | "fornitore"
  | "operaio"
  | "preventivo"
  | "fattura"
  | "opportunita"
  | "supporto"
  | "pratica"
  | "newsletter"
  | "social"
  | "notifica"
  | "spam"
  | "altro";

export type EntitaTipo =
  | "cliente"
  | "fornitore"
  | "operaio"
  | "opportunita"
  | "ordine";

export interface EmailInput {
  from_email: string;
  fromDomain?: string;
  from_name?: string | null;
  subject?: string | null;
  snippet?: string | null;
  headers?: Record<string, string | undefined> | null;
  // MP-05: campi extra per valutazione regole
  to_email?: string | null;
  cc_emails?: string[] | null;
  has_attachment?: boolean;
  attachment_types?: string[];
}

// MP-EMAIL-AI-05 — Tipi regola (gemello di src/lib/email-ai/rules-engine.ts)
export interface Condizione { campo: string; operatore: string; valore: string; }
export interface Azione { tipo: string; valore?: unknown; }
export interface Regola {
  id: string;
  nome: string;
  stato: string;
  priorita: number;
  combinatore: string;
  condizioni: Condizione[];
  azioni: Azione[];
}

export interface ClassificationResult {
  categoria: EmailCategoria;
  entita_tipo: EntitaTipo | null;
  entita_id: string | null;
  confidenza: number;
  classificato_da: "regola" | "embedding" | "haiku" | "manuale";
  da_rivedere: boolean;
  matched_by?: string;
}

// ════════════════════════════════════════════════════════════════════════════
// Headers + dominio utility
// ════════════════════════════════════════════════════════════════════════════

const SOCIAL_DOMAINS = [
  "facebookmail.com",
  "linkedinmail.com",
  "instagram.com",
  "instagrammail.com",
  "tiktok.com",
  "tiktokmail.com",
  "threads.net",
  "x.com",
  "twitter.com",
];

const NOTIFICATION_LOCALPARTS_RE =
  /^(no-?reply|noreply|notification|notify|alerts?|alert-|mailer-daemon|postmaster|bounces?|do-?not-?reply|automated|abuse|delivery|return)@/i;

const PEC_DOMAINS_RE = /(^|\.)(pec\.it|legalmail\.it|pec\.aruba\.it|pec\.poste\.it|postacert\.it|legalmail|messaggipec)$/i;

const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "outlook.it",
  "hotmail.com", "hotmail.it", "live.com", "live.it",
  "yahoo.com", "yahoo.it", "ymail.com",
  "icloud.com", "me.com", "mac.com",
  "libero.it", "alice.it", "tin.it", "tiscali.it", "virgilio.it",
  "fastwebnet.it", "fastweb.it", "email.it", "tim.it", "vodafone.it",
  "wind.it", "infinito.it", "iol.it", "katamail.com",
  "gmx.com", "gmx.it", "protonmail.com", "proton.me", "pm.me",
  "tutanota.com", "tutamail.com",
  "aol.com", "mail.ru", "yandex.com", "yandex.ru",
  "qq.com", "163.com",
]);

export function extractDomain(email: string): string {
  if (!email) return "";
  const idx = email.lastIndexOf("@");
  if (idx < 0) return "";
  return email.slice(idx + 1).toLowerCase().trim();
}

export function normalizeEmail(raw: string): string {
  if (!raw) return "";
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).toLowerCase().trim();
}

export function isPersonalDomain(domain: string): boolean {
  return PERSONAL_DOMAINS.has(domain.toLowerCase());
}

function normalizeHeaders(
  headers?: Record<string, string | undefined> | null,
): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v == null) continue;
    out[k.toLowerCase()] = String(v);
  }
  return out;
}

function classifyByHeaders(
  fromEmail: string,
  fromDomain: string,
  headers?: Record<string, string | undefined> | null,
): { categoria: EmailCategoria; matched_by: string } | null {
  // PEC → pratica (priorità)
  if (fromDomain && PEC_DOMAINS_RE.test(fromDomain)) {
    return { categoria: "pratica", matched_by: "header:pec-domain" };
  }

  // Social
  if (fromDomain) {
    const dom = fromDomain.toLowerCase();
    for (const social of SOCIAL_DOMAINS) {
      if (dom === social || dom.endsWith("." + social)) {
        return { categoria: "social", matched_by: `header:social-domain:${social}` };
      }
    }
  }

  // No-reply local-part
  if (NOTIFICATION_LOCALPARTS_RE.test(fromEmail)) {
    return { categoria: "notifica", matched_by: "header:noreply-localpart" };
  }

  const h = normalizeHeaders(headers);
  if (h["list-unsubscribe"] || h["list-id"] || h["list-post"] || h["list-archive"]) {
    return { categoria: "newsletter", matched_by: "header:list-unsubscribe" };
  }
  if (h["precedence"] && /^(bulk|list|junk)$/i.test(h["precedence"])) {
    return { categoria: "newsletter", matched_by: "header:precedence-bulk" };
  }
  if (h["auto-submitted"] && /auto-generated|auto-replied|auto-notified/i.test(h["auto-submitted"])) {
    return { categoria: "notifica", matched_by: "header:auto-submitted" };
  }
  if (h["x-auto-response-suppress"]) {
    return { categoria: "notifica", matched_by: "header:x-auto-response" };
  }

  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// Regex rules (sincronizzato con src/lib/email-ai/regex-rules.ts)
// ════════════════════════════════════════════════════════════════════════════

const REGOLE_REGEX: Array<{ re: RegExp; categoria: EmailCategoria; matched_by: string }> = [
  // Spam first
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
  // Fattura
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
  // Pratica
  {
    re: /\b(agenzia\s+(delle\s+)?entrate|ade\b|inps\b|inail\b|cassa\s+edile|durc|cila|scia|dia\b|permesso\s+di\s+costruire|paesaggistica|asseverazione|f24|enea|comune\s+di\s+\w+|pratica\s+edilizia|comunicazione\s+(comune|catasto))\b/i,
    categoria: "pratica",
    matched_by: "regex:pratica/AdE-INPS-SCIA",
  },
  // Preventivo
  {
    re: /\b(preventivo|computo\s+metrico|capitolato|richiesta\s+(quotazione|prezzo|preventivo)|listino|sopralluogo|rilievo|offerta\s+(commerciale|economica|tecnica|d['']appalto)|cap\.\s*metr)\b/i,
    categoria: "preventivo",
    matched_by: "regex:preventivo",
  },
  // Sollecito → fattura
  {
    re: /\b(sollecito\s+(di\s+)?pagamento|insoluto|mora\s+pagamento|scadenza\s+fattura|pagamento\s+scaduto)\b/i,
    categoria: "fattura",
    matched_by: "regex:fattura/sollecito",
  },
  // Fornitore
  {
    re: /\b(ddt|bolla(\s+di\s+(consegna|accompagnamento))?|documento\s+di\s+trasporto|conferma\s+ordin|ordine\s+conferm|spedizione|consegna\s+materiale)\b/i,
    categoria: "fornitore",
    matched_by: "regex:fornitore/DDT-ordine",
  },
  // Operaio
  {
    re: /\b(cantiere|sopralluogo|squadra|operaio|caposquadra|maestranze|busta\s+paga|cedolino|ferie|permesso|malattia|infortunio|dpi\s+(consegna|scadenza)?|visita\s+medica|formazione\s+sicurezza)\b/i,
    categoria: "operaio",
    matched_by: "regex:operaio/HR-cantiere",
  },
  // Opportunità
  {
    re: /(\brichiesta\s+(informazion|contatto)|\binteressat[oa]\s+(al|ai)\s+vostr|\bcontatto\s+da\s+(sito|google|facebook|instagram|form)|\bnuovo\s+lead|\bnuova\s+richiesta|\bsono\s+interessat[oa]\s+ai\s+vostr|\binvio\s+da\s+(modulo|form))/i,
    categoria: "opportunita",
    matched_by: "regex:opportunita/richiesta",
  },
  // Supporto
  {
    re: /\b(ticket\s*#?\s*\d+|case\s*#?\s*\d+|richiesta\s+(supporto|assistenza)|problema\s+(tecnico|operativo)|non\s+funziona|errore\s+sistema|bug\s+report)\b/i,
    categoria: "supporto",
    matched_by: "regex:supporto/ticket",
  },
  // Notifiche automatiche
  {
    re: /\b(notifica\s+automatica|conferma\s+(iscrizione|registrazione)|ricevuta\s+(di\s+)?(pagamento|invio|consegna)|posta\s+elettronica\s+certificata\s+ricevuta|delivery\s+(failed|notification)|mailer-daemon|undelivered\s+mail|posta\s+non\s+recapitata)\b/i,
    categoria: "notifica",
    matched_by: "regex:notifica/automatica",
  },
  // Social
  {
    re: /\b(linkedin|facebook|instagram|tiktok|x\s+\(twitter\)|threads|whatsapp\s+business)\b.*\b(notific|aggiornamento|connessione|like|commento|messaggio|invitat[oi])\b/i,
    categoria: "social",
    matched_by: "regex:social/piattaforma",
  },
  // Newsletter
  {
    re: /\b(newsletter|magazine|webinar|evento\s+formativo|leggi\s+su(l)?\s+nostro\s+blog|articolo\s+settiman|edizione\s+(settimanale|mensile)|iscrivit[ie]\s+(alla\s+)?newsletter|cancella(re)?\s+iscrizione|unsubscribe)\b/i,
    categoria: "newsletter",
    matched_by: "regex:newsletter/contenuto",
  },
];

const MAX_BODY_CHARS = 500;

function applyRegexRules(text: string) {
  if (!text) return null;
  for (const rule of REGOLE_REGEX) {
    if (rule.re.test(text)) return rule;
  }
  return null;
}

export function extractSnippet(raw_text?: string | null, raw_html?: string | null): string {
  let body = (raw_text || "").trim();
  if (!body && raw_html) {
    body = raw_html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&[a-z]{2,8};/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return body.slice(0, MAX_BODY_CHARS);
}

// ════════════════════════════════════════════════════════════════════════════
// Cascata L1 con lookup DB (service_role client)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Cerca un mittente noto in `mittenti_noti`.
 * Match esatto su email → fallback dominio (solo se NON personal).
 */
async function lookupMittenteNoto(
  supabase: SupabaseClient,
  companyId: string,
  email: string,
  dominio: string,
): Promise<{
  categoria: EmailCategoria;
  entita_tipo: EntitaTipo | null;
  entita_id: string | null;
} | null> {
  // Match esatto
  const { data: exact } = await supabase
    .from("mittenti_noti")
    .select("categoria, entita_tipo, entita_id")
    .eq("company_id", companyId)
    .eq("email", email)
    .maybeSingle();

  if (exact) {
    return {
      categoria: exact.categoria as EmailCategoria,
      entita_tipo: (exact.entita_tipo as EntitaTipo) ?? null,
      entita_id: (exact.entita_id as string | null) ?? null,
    };
  }

  // Dominio (no personal)
  if (dominio && !isPersonalDomain(dominio)) {
    const { data: dom } = await supabase
      .from("mittenti_noti")
      .select("categoria, entita_tipo, entita_id")
      .eq("company_id", companyId)
      .eq("dominio", dominio)
      .order("hit_count", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dom) {
      return {
        categoria: dom.categoria as EmailCategoria,
        entita_tipo: (dom.entita_tipo as EntitaTipo) ?? null,
        entita_id: (dom.entita_id as string | null) ?? null,
      };
    }
  }
  return null;
}

/**
 * Lookup CRM su suppliers / employees / customers (per email esatta + dominio).
 */
async function matchCRM(
  supabase: SupabaseClient,
  companyId: string,
  email: string,
  dominio: string,
): Promise<{
  categoria: EmailCategoria;
  entita_tipo: EntitaTipo;
  entita_id: string;
  matched_field: "email" | "domain";
} | null> {
  // Suppliers
  const { data: sup } = await supabase
    .from("suppliers")
    .select("id")
    .eq("company_id", companyId)
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  if (sup) {
    return { categoria: "fornitore", entita_tipo: "fornitore", entita_id: sup.id as string, matched_field: "email" };
  }

  // Employees
  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .eq("company_id", companyId)
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  if (emp) {
    return { categoria: "operaio", entita_tipo: "operaio", entita_id: emp.id as string, matched_field: "email" };
  }

  // Clienti: anagrafica unificata `anagrafiche_native` (tipo cliente|entrambi).
  // Decisione Florin (MP-00 §6b): i clienti vivono qui. Match su email, poi email_fatture.
  const { data: cli } = await supabase
    .from("anagrafiche_native")
    .select("id")
    .eq("company_id", companyId)
    .in("tipo", ["cliente", "entrambi"])
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  if (cli) {
    return { categoria: "cliente", entita_tipo: "cliente", entita_id: cli.id as string, matched_field: "email" };
  }
  const { data: cliFt } = await supabase
    .from("anagrafiche_native")
    .select("id")
    .eq("company_id", companyId)
    .in("tipo", ["cliente", "entrambi"])
    .ilike("email_fatture", email)
    .limit(1)
    .maybeSingle();
  if (cliFt) {
    return { categoria: "cliente", entita_tipo: "cliente", entita_id: cliFt.id as string, matched_field: "email" };
  }

  // Domain match (solo non-personal): prima fornitori, poi clienti.
  if (dominio && !isPersonalDomain(dominio)) {
    const { data: supDom } = await supabase
      .from("suppliers")
      .select("id")
      .eq("company_id", companyId)
      .ilike("email", `%@${dominio}`)
      .limit(1)
      .maybeSingle();
    if (supDom) {
      return { categoria: "fornitore", entita_tipo: "fornitore", entita_id: supDom.id as string, matched_field: "domain" };
    }
    const { data: cliDom } = await supabase
      .from("anagrafiche_native")
      .select("id")
      .eq("company_id", companyId)
      .in("tipo", ["cliente", "entrambi"])
      .ilike("email", `%@${dominio}`)
      .limit(1)
      .maybeSingle();
    if (cliDom) {
      return { categoria: "cliente", entita_tipo: "cliente", entita_id: cliDom.id as string, matched_field: "domain" };
    }
  }

  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// MP-EMAIL-AI-05 — Valutatore regole (L1, costo zero, PRIMA di mittenti_noti)
// ════════════════════════════════════════════════════════════════════════════

function ruleFieldValue(email: EmailInput, campo: string): string {
  switch (campo) {
    case "indirizzo": return normalizeEmail(email.from_email || "");
    case "dominio": return (email.fromDomain || extractDomain(normalizeEmail(email.from_email || ""))).toLowerCase();
    case "destinatario": return `${(email.to_email || "").toLowerCase()} ${(email.cc_emails || []).join(" ").toLowerCase()}`.trim();
    case "oggetto": return (email.subject || "").toLowerCase();
    case "corpo": return (email.snippet || "").toLowerCase();
    case "casella": return (email.to_email || "").toLowerCase();
    case "allegato": return email.has_attachment ? "si" : "no";
    default: return "";
  }
}

function matchCondizione(email: EmailInput, cond: Condizione): boolean {
  const field = ruleFieldValue(email, cond.campo);
  const val = (cond.valore || "").toLowerCase().trim();
  if (cond.campo === "allegato") {
    if (val === "si" || val === "sì" || val === "yes") return email.has_attachment === true;
    if (val === "no") return email.has_attachment !== true;
    return (email.attachment_types || []).some((t) => t.toLowerCase().includes(val));
  }
  if (!val) return false;
  switch (cond.operatore) {
    case "e": return field === val;
    case "contiene": return field.includes(val);
    case "termina_con": return field.endsWith(val);
    case "inizia_con": return field.startsWith(val);
    case "regex": try { return new RegExp(cond.valore, "i").test(field); } catch { return false; }
    default: return false;
  }
}

function evaluateRule(email: EmailInput, regola: Regola): boolean {
  if (!regola.condizioni || regola.condizioni.length === 0) return false;
  if (regola.combinatore === "OR") return regola.condizioni.some((c) => matchCondizione(email, c));
  return regola.condizioni.every((c) => matchCondizione(email, c));
}

/** Carica regole attive per la company, ordinate per valutazione. */
async function loadRegole(supabase: SupabaseClient, companyId: string): Promise<Regola[]> {
  const { data } = await supabase
    .from("email_regole")
    .select("id, nome, stato, priorita, combinatore, condizioni, azioni")
    .eq("company_id", companyId)
    .eq("stato", "attiva")
    .order("priorita", { ascending: true });
  return (data as Regola[]) || [];
}

/** Traduce le azioni di una regola in ClassificationResult. */
function azioniToResult(azioni: Azione[], regolaNome: string): ClassificationResult {
  let categoria: EmailCategoria = "altro";
  let entita_tipo: EntitaTipo | null = null;
  let entita_id: string | null = null;
  for (const az of azioni || []) {
    if (az.tipo === "categoria" && typeof az.valore === "string") categoria = az.valore as EmailCategoria;
    if (az.tipo === "collega_entita" && az.valore && typeof az.valore === "object") {
      const v = az.valore as { tipo?: string; id?: string };
      if (v.tipo) entita_tipo = v.tipo as EntitaTipo;
      if (v.id) entita_id = v.id;
    }
  }
  return {
    categoria, entita_tipo, entita_id,
    confidenza: 1.0, classificato_da: "regola", da_rivedere: false,
    matched_by: `regola:${regolaNome}`,
  };
}

/**
 * Esegue L1 deterministico su una email. Ritorna null se nessuna regola scatta.
 * Ordine (MP-05 §4): regole utente → mittenti_noti → CRM → header → regex.
 */
export async function classificaDeterministica(
  supabase: SupabaseClient,
  companyId: string,
  email: EmailInput,
): Promise<ClassificationResult | null> {
  const from = normalizeEmail(email.from_email || "");
  if (!from) return null;
  const dominio = email.fromDomain || extractDomain(from);

  // 0) REGOLE UTENTE (MP-05) — massima precedenza, costo zero
  const regole = await loadRegole(supabase, companyId);
  if (regole.length > 0) {
    const sorted = regole.sort((a, b) =>
      a.priorita !== b.priorita ? a.priorita - b.priorita : (b.condizioni?.length || 0) - (a.condizioni?.length || 0),
    );
    for (const regola of sorted) {
      if (evaluateRule(email, regola)) {
        // Best-effort: incrementa contatore match (non bloccante)
        supabase.rpc("bump_email_regola_match", { p_regola_id: regola.id }).then(() => {}, () => {});
        return azioniToResult(regola.azioni, regola.nome);
      }
    }
  }

  // a) mittenti_noti
  const noto = await lookupMittenteNoto(supabase, companyId, from, dominio);
  if (noto) {
    return {
      categoria: noto.categoria,
      entita_tipo: noto.entita_tipo,
      entita_id: noto.entita_id,
      confidenza: 1.0,
      classificato_da: "regola",
      da_rivedere: false,
      matched_by: "cache:mittenti_noti",
    };
  }

  // b) match CRM
  const crm = await matchCRM(supabase, companyId, from, dominio);
  if (crm) {
    return {
      categoria: crm.categoria,
      entita_tipo: crm.entita_tipo,
      entita_id: crm.entita_id,
      confidenza: 1.0,
      classificato_da: "regola",
      da_rivedere: false,
      matched_by: `crm:${crm.matched_field}`,
    };
  }

  // c) headers
  const hdr = classifyByHeaders(from, dominio, email.headers);
  if (hdr) {
    return {
      categoria: hdr.categoria,
      entita_tipo: null,
      entita_id: null,
      confidenza: 1.0,
      classificato_da: "regola",
      da_rivedere: false,
      matched_by: hdr.matched_by,
    };
  }

  // d) regex
  const text = (
    (email.subject || "") +
    " " +
    (email.snippet || "").slice(0, MAX_BODY_CHARS)
  )
    .toLowerCase()
    .trim();

  if (text) {
    const rule = applyRegexRules(text);
    if (rule) {
      return {
        categoria: rule.categoria,
        entita_tipo: null,
        entita_id: null,
        confidenza: 1.0,
        classificato_da: "regola",
        da_rivedere: false,
        matched_by: rule.matched_by,
      };
    }
  }

  return null;
}

/**
 * Persiste il risultato della classificazione in email_inbox.
 */
export async function persistClassification(
  supabase: SupabaseClient,
  emailId: string,
  result: ClassificationResult,
): Promise<void> {
  await supabase
    .from("email_inbox")
    .update({
      categoria: result.categoria,
      entita_tipo: result.entita_tipo,
      entita_id: result.entita_id,
      confidenza: result.confidenza,
      classificato_da: result.classificato_da,
      da_rivedere: result.da_rivedere,
      classificato_at: new Date().toISOString(),
    })
    .eq("id", emailId);
}

/**
 * Se L1 classifica con classificato_da='regola' o 'haiku', salva il mittente
 * nella cache `mittenti_noti` per uso futuro.
 */
export async function learnSender(
  supabase: SupabaseClient,
  companyId: string,
  fromEmail: string,
  result: ClassificationResult,
): Promise<void> {
  if (result.classificato_da === "embedding") return; // L2 non popola cache
  const email = normalizeEmail(fromEmail);
  if (!email) return;
  const dominio = extractDomain(email) || null;

  await (supabase as any)
    .from("mittenti_noti")
    .upsert(
      {
        company_id: companyId,
        email,
        dominio,
        categoria: result.categoria,
        entita_tipo: result.entita_tipo,
        entita_id: result.entita_id,
        fonte: result.classificato_da,
      },
      {
        onConflict: "company_id,email",
        ignoreDuplicates: false,
      },
    );
}
