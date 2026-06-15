/**
 * Firma HMAC-SHA256 per i link di tracking/disiscrizione email (SEC).
 *
 * La edge function `email-tracking` è volutamente non autenticata
 * (verify_jwt=false): deve rispondere a pixel di apertura, redirect di click e
 * one-click unsubscribe richiamati direttamente dai client di posta. Senza
 * firma, però, i parametri `co` (company), `rid` (contact) e `cid` (campaign)
 * sono semplici UUID in query string: chiunque li indovini/enumeri può
 * forzare `type=unsub` per disiscrivere QUALSIASI contatto di QUALSIASI
 * azienda, oppure forgiare eventi `open`/`click` inquinando analytics, A/B
 * test e lead scoring.
 *
 * Mitigazione: ogni link viene firmato in generazione con
 * HMAC-SHA256(secret, "co|rid|cid|type") e verificato (constant-time) prima di
 * eseguire qualsiasi azione. Stessa convenzione di SEC-014
 * (accetta-preventivo) e dei webhook in _shared/webhookSecurity.ts.
 *
 * Backward-compat: se EMAIL_TRACKING_SECRET non è configurato si resta in
 * "legacy mode" — i link vengono generati senza firma e il verificatore li
 * accetta, così il deploy non rompe le email già in coda. Appena il secret è
 * impostato, generazione e verifica diventano obbligatorie e i link non
 * firmati/invalidi vengono rifiutati (a partire dalle azioni distruttive).
 */

const ENV_KEY = "EMAIL_TRACKING_SECRET";

/**
 * Confronto stringhe constant-time (anti timing-attack sulle firme HMAC).
 * Inlined volutamente invece di importarlo da webhookSecurity.ts: così questo
 * modulo resta autocontenuto e il percorso email non dipende da quel file
 * (mantiene la stessa semantica del confronto a lunghezza costante).
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Ritorna il secret configurato o null (legacy mode, pre-rollout). */
export function getEmailTrackingSecret(): string | null {
  const secret = Deno.env.get(ENV_KEY);
  return secret && secret.length > 0 ? secret : null;
}

export interface TrackingSigFields {
  /** company_id (`co`) */
  co: string;
  /** contact_id (`rid`) */
  rid: string;
  /** campaign_id (`cid`) — assente per i tipi automation_* */
  cid?: string | null;
  /** open | click | unsub | automation_open | automation_unsub */
  type: string;
}

/**
 * Messaggio canonico firmato/verificato. Ordine e delimitatore DEVONO restare
 * identici su entrambi i lati. UUID e le stringhe fisse di `type` non
 * contengono mai '|', quindi non c'è ambiguità di parsing. Il `cid` mancante
 * (tipi automation_*) è normalizzato a stringa vuota in modo deterministico.
 */
function canonicalMessage(f: TrackingSigFields): string {
  return `${f.co}|${f.rid}|${f.cid ?? ""}|${f.type}`;
}

/** Calcola la firma HMAC-SHA256 (hex) del messaggio canonico. */
export async function computeTrackingSig(
  secret: string,
  fields: TrackingSigFields,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(canonicalMessage(fields)));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Aggiunge `&sig=<hmac>` a un URL email-tracking già costruito, se il secret è
 * configurato. No-op (ritorna l'URL invariato) in legacy mode, così le email
 * inviate prima del rollout continuano a funzionare.
 */
export async function appendTrackingSig(
  url: string,
  fields: TrackingSigFields,
): Promise<string> {
  const secret = getEmailTrackingSecret();
  if (!secret) return url;
  const sig = await computeTrackingSig(secret, fields);
  return `${url}&sig=${sig}`;
}

/**
 * Ritorna il suffisso querystring `&sig=<hmac>` da concatenare a un URL
 * email-tracking, oppure stringa vuota in legacy mode. Utile quando l'URL è
 * costruito dentro un callback sincrono (es. `String.replace` per il
 * click-tracking): la firma non include il parametro `url`, quindi per una
 * stessa coppia co/rid/cid+type è identica per tutti i link e va calcolata una
 * sola volta a monte.
 */
export async function trackingSigSuffix(fields: TrackingSigFields): Promise<string> {
  const secret = getEmailTrackingSecret();
  if (!secret) return "";
  const sig = await computeTrackingSig(secret, fields);
  return `&sig=${sig}`;
}

/**
 * Verifica la firma fornita per i campi dati (constant-time).
 * Ritorna true solo se `providedSig` è presente e combacia con la firma attesa.
 * Ritorna false se la firma è assente/vuota o non valida.
 */
export async function verifyTrackingSig(
  secret: string,
  fields: TrackingSigFields,
  providedSig: string | null | undefined,
): Promise<boolean> {
  if (!providedSig) return false;
  const expected = await computeTrackingSig(secret, fields);
  return timingSafeEqual(expected, providedSig);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Open-tracking dell'Outreach Engine (cold).
 *
 * Il tracking campagne (sopra) è ancorato a email_logs e firma "co|rid|cid|type".
 * Il cold outreach NON ha campaign_id: la chiave dell'apertura è l'id della riga
 * `outreach_send_queue`. Per non sporcare la semantica campagne usiamo un
 * messaggio canonico DEDICATO — `outreach_open|<queueId>` — firmato con lo STESSO
 * segreto (EMAIL_TRACKING_SECRET) e le stesse primitive HMAC-SHA256. Il prefisso
 * fisso `outreach_open` rende impossibile il riuso cross-tipo di una firma
 * campagne (i due namespace non collidono mai).
 *
 * Fail-safe: se il segreto NON è configurato, `outreachOpenPixelUrl` ritorna null
 * → il dispatcher NON inietta alcun pixel (cold protetto, nessun link non
 * firmato a giro). Lato endpoint, in assenza di segreto si rifiuta di registrare
 * (ma si serve comunque la GIF per non rompere il rendering).
 * ──────────────────────────────────────────────────────────────────────────── */

/** Messaggio canonico per la firma dell'apertura outreach (namespace isolato). */
function outreachOpenMessage(queueId: string): string {
  return `outreach_open|${queueId}`;
}

/** Firma HMAC-SHA256 (hex) dell'id riga `outreach_send_queue`. */
export async function computeOutreachOpenSig(secret: string, queueId: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(outreachOpenMessage(queueId)));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Costruisce l'URL firmato del pixel di apertura per una riga di coda outreach,
 * oppure null se EMAIL_TRACKING_SECRET non è configurato (→ niente pixel).
 * `baseUrl` è di norma `${SUPABASE_URL}/functions/v1`.
 */
export async function outreachOpenPixelUrl(baseUrl: string, queueId: string): Promise<string | null> {
  const secret = getEmailTrackingSecret();
  if (!secret) return null;
  const sig = await computeOutreachOpenSig(secret, queueId);
  return `${baseUrl}/outreach-track-open?q=${encodeURIComponent(queueId)}&sig=${sig}`;
}

/**
 * Verifica (constant-time) la firma di un'apertura outreach.
 * Ritorna false se la firma è assente/vuota o non combacia.
 */
export async function verifyOutreachOpenSig(
  secret: string,
  queueId: string,
  providedSig: string | null | undefined,
): Promise<boolean> {
  if (!providedSig) return false;
  const expected = await computeOutreachOpenSig(secret, queueId);
  return timingSafeEqual(expected, providedSig);
}
