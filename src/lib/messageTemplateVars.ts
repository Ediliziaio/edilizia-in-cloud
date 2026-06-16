/**
 * messageTemplateVars — motore merge-field condiviso per i template messaggi
 * (email / SMS / WhatsApp / nota interna) usati nei compositori di Clienti,
 * Contatti CRM e Commesse.
 *
 * Sostituisce i segnaposto {{chiave}} con i dati del destinatario/contesto.
 * Supporta sia la forma underscore ({{nome_completo}}) sia quella puntata
 * ({{contact.name}}) — i punti vengono normalizzati in underscore.
 */

export type TemplateChannel = "email" | "sms" | "whatsapp" | "nota_interna";

export interface TemplateField {
  key: string;
  label: string;
  /** Esempio mostrato come hint nel picker. */
  sample?: string;
}

/** Campi inseribili nei template (mostrati come chip "inserisci campo"). */
export const TEMPLATE_FIELDS: TemplateField[] = [
  { key: "nome", label: "Nome", sample: "Mario" },
  { key: "cognome", label: "Cognome", sample: "Rossi" },
  { key: "nome_completo", label: "Nome completo", sample: "Mario Rossi" },
  { key: "email", label: "Email", sample: "mario@email.it" },
  { key: "telefono", label: "Telefono", sample: "+39…" },
  { key: "azienda", label: "La tua azienda", sample: "Demo Azienda S.r.l." },
  { key: "citta", label: "Città", sample: "Milano" },
  { key: "indirizzo", label: "Indirizzo", sample: "Via Verga, 132" },
  { key: "commessa", label: "Commessa", sample: "ORD-2026-012" },
  { key: "oggi", label: "Data odierna", sample: "16/06/2026" },
];

export interface TemplateVarInput {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  /** Ragione sociale dell'azienda mittente. */
  companyName?: string | null;
  /** Codice commessa, se il contesto è una commessa. */
  orderCode?: string | null;
  /** Data odierna pre-formattata (gli script Deno la passano; in UI usa default). */
  today?: string;
  /** Coppie chiave→valore extra (es. campi personalizzati cf:<id>). */
  custom?: Record<string, string>;
}

/** Costruisce il dizionario di variabili a partire dal contesto. */
export function buildTemplateVars(input: TemplateVarInput): Record<string, string> {
  const fn = (input.firstName ?? "").trim();
  const ln = (input.lastName ?? "").trim();
  const full = `${fn} ${ln}`.trim();
  const todayStr = input.today ?? new Intl.DateTimeFormat("it-IT").format(new Date());

  const vars: Record<string, string> = {
    nome: fn,
    cognome: ln,
    nome_completo: full,
    email: (input.email ?? "").trim(),
    telefono: (input.phone ?? "").trim(),
    citta: (input.city ?? "").trim(),
    indirizzo: (input.address ?? "").trim(),
    azienda: (input.companyName ?? "").trim(),
    commessa: (input.orderCode ?? "").trim(),
    oggi: todayStr,

    // ── Alias retro-compatibili ──
    // Template Commesse esistenti (ComposeBar): {{cliente_nome}} ecc.
    cliente_nome: full || fn,
    cliente_email: (input.email ?? "").trim(),
    cliente_tel: (input.phone ?? "").trim(),
    // Forma "puntata" richiesta dall'utente: {{contact.name}} → contact_name
    contact_name: full || fn,
    contact_email: (input.email ?? "").trim(),
    contact_phone: (input.phone ?? "").trim(),

    ...(input.custom ?? {}),
  };
  return vars;
}

/**
 * Applica le variabili al testo. I segnaposto non risolti restano invariati
 * (così l'utente li vede e può correggerli) invece di diventare stringhe vuote.
 */
export function applyTemplateVars(text: string | null | undefined, vars: Record<string, string>): string {
  if (!text) return text ?? "";
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, rawKey: string) => {
    const key = rawKey.trim();
    if (key in vars) return vars[key];
    const normalized = key.replace(/\./g, "_"); // contact.name → contact_name
    return normalized in vars ? vars[normalized] : `{{${key}}}`;
  });
}

/** Estrae le chiavi {{...}} presenti in un testo (per anteprime/validazione). */
export function extractTemplateVarKeys(text: string | null | undefined): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) out.add(m[1].trim());
  return [...out];
}
