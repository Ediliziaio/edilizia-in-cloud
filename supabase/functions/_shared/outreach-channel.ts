/**
 * outreach-channel — logica PURA del routing MULTICANALE (email/whatsapp/sms)
 * delle sequenze cold a grafo. Niente Deno/Supabase: solo funzioni deterministiche
 * testabili in vitest. Il dispatcher (outreach-dispatch) le usa per decidere, per
 * un nodo messaggio, COME accodare/spedire; gli effetti (chiamata API SMS/WhatsApp,
 * scrittura coda) restano nel dispatcher.
 *
 * Contesto: i nodi 'email' restano email-only (casella del pool + warm-up). I nodi
 * 'whatsapp' e 'sms' sono nodi INVIANTI come l'email ma su un canale diverso:
 *   • NON usano casella/warm-up: il mittente è il numero del provider (Telnyx per
 *     SMS, numero WhatsApp Business per WhatsApp).
 *   • Il destinatario è il TELEFONO del contatto (marketing_contacts.phone), non
 *     l'email. Telefono mancante → si SALTA il nodo (last_error chiaro) e si avanza
 *     la cadenza (non si blocca il flusso).
 *   • Rispettano l'opt-out PER-CANALE del contatto (optout_sms / optout_whatsapp).
 */

export type OutreachChannel = "email" | "whatsapp" | "sms";

/** node_type dei nodi inarguabilmente "di invio" (accodano/spediscono un messaggio). */
export type SendNodeType = "email" | "whatsapp" | "sms";

/** Tutti i node_type del grafo (allineato a outreach-flow.NodeType + i due canali msg). */
export type AnyNodeType = "email" | "wait" | "condition" | "end" | "whatsapp" | "sms";

/** Canale d'invio per un node_type. I tipi non-invianti (wait/condition/end) → null. */
export function channelForNodeType(t: AnyNodeType | null | undefined): OutreachChannel | null {
  switch (t) {
    case "whatsapp":
      return "whatsapp";
    case "sms":
      return "sms";
    case "email":
      return "email";
    default:
      // wait / condition / end / sconosciuto: non sono nodi d'invio.
      return null;
  }
}

/** True se il node_type è un nodo messaggio NON-email (whatsapp/sms). */
export function isMessageChannelNode(t: AnyNodeType | null | undefined): boolean {
  return t === "whatsapp" || t === "sms";
}

/** Campi opt-out per-canale di un contatto marketing (solo quelli che servono qui). */
export interface ContactOptouts {
  optout_email?: boolean | null;
  optout_sms?: boolean | null;
  optout_whatsapp?: boolean | null;
}

/**
 * True se il contatto ha l'opt-out ATTIVO per il canale dato. Un opt-out di canale
 * blocca SOLO quel canale (un contatto può essere optout email ma raggiungibile via
 * SMS, e viceversa). Valore null/undefined = non optato (default DB false).
 */
export function isOptedOut(channel: OutreachChannel, c: ContactOptouts | null | undefined): boolean {
  if (!c) return false;
  switch (channel) {
    case "email":
      return c.optout_email === true;
    case "sms":
      return c.optout_sms === true;
    case "whatsapp":
      return c.optout_whatsapp === true;
  }
}

/** Normalizza un telefono a sole cifre (per validazione/confronto). "" se vuoto/assente. */
export function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/[^0-9]/g, "");
}

/** Esito della valutazione "posso spedire questo messaggio non-email a questo contatto?". */
export interface ChannelSendPlan {
  /** true = spedibile; false = saltare il nodo e avanzare la cadenza. */
  ok: boolean;
  /** telefono normalizzato (sole cifre) quando ok; "" altrimenti. */
  phone: string;
  /** motivo del salto (last_error), quando !ok. */
  skipReason?: string;
}

/**
 * Decide se un messaggio sul canale `channel` (whatsapp/sms) è spedibile al
 * contatto: serve un telefono valido e nessun opt-out di canale. NON esegue
 * effetti: ritorna il piano (ok + phone, oppure ok=false + skipReason). Il
 * dispatcher, su ok=false, marca la riga 'skipped' con skipReason e AVANZA la
 * cadenza (il telefono mancante non deve bloccare la sequenza).
 */
export function planChannelSend(
  channel: OutreachChannel,
  contact: ContactOptouts & { phone?: string | null } | null | undefined,
): ChannelSendPlan {
  if (!contact) {
    return { ok: false, phone: "", skipReason: "contatto assente" };
  }
  if (isOptedOut(channel, contact)) {
    return { ok: false, phone: "", skipReason: `optout_${channel}` };
  }
  const phone = normalizePhone(contact.phone);
  if (!phone) {
    return { ok: false, phone: "", skipReason: "telefono mancante" };
  }
  return { ok: true, phone };
}

// ── Template WhatsApp approvato (compliance Meta) ─────────────────────────────
//
// Un nodo WhatsApp può portare un TEMPLATE Meta approvato (template_name +
// language + params): è la via conforme per i contatti COLD, dove la finestra 24h
// è chiusa e il testo libero verrebbe rifiutato (errore 131047). I `params` sono
// una mappa POSIZIONALE { "1": valore, "2": valore, … } come
// wa_meta_templates.variable_mapping: ogni valore è una variabile ({{first_name}}…)
// o testo fisso, renderizzato al send coi dati del contatto.

/** Template del nodo, così com'è persistito sullo step (campi nullable). */
export interface StepTemplate {
  name?: string | null;
  language?: string | null;
  /** mappa posizionale { "1": "{{first_name}}", "2": "testo" } oppure array ordinato. */
  params?: Record<string, string> | string[] | null;
}

/** True se il nodo ha un template valorizzato (template_name presente, non vuoto). */
export function hasTemplate(tpl: StepTemplate | null | undefined): boolean {
  return !!tpl?.name && String(tpl.name).trim().length > 0;
}

/**
 * Ordina i parametri posizionali di un template in array di stringhe RAW (non
 * ancora renderizzate). Accetta sia la mappa { "1": …, "2": … } (ordina per chiave
 * numerica crescente, robusto a buchi/non-numeriche) sia un array già ordinato.
 * Le posizioni mancanti diventano "" (Meta richiede un parametro per ogni {{n}}).
 */
export function orderTemplateParams(params: StepTemplate["params"]): string[] {
  if (!params) return [];
  if (Array.isArray(params)) return params.map((v) => (v == null ? "" : String(v)));
  const keys = Object.keys(params)
    .map((k) => ({ k, n: Number(k) }))
    .filter((x) => Number.isFinite(x.n) && x.n >= 1)
    .sort((a, b) => a.n - b.n);
  if (keys.length === 0) return [];
  const max = keys[keys.length - 1].n;
  const out: string[] = [];
  for (let i = 1; i <= max; i++) {
    const hit = keys.find((x) => x.n === i);
    const v = hit ? params[hit.k] : "";
    out.push(v == null ? "" : String(v));
  }
  return out;
}
