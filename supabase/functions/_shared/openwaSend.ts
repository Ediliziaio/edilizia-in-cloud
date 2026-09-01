// openwaSend — core d'invio del canale WhatsApp Locale (OpenWA), riusabile.
//
// Usato da:
//  - openwa-gateway (azione send_text, dopo auth super_admin)
//  - process-automation (azione invia_whatsapp_locale, service-role, platform-only)
//  - outreach dispatcher (canale whatsapp_locale, service-role, platform-only)
//
// Contratto gateway allineato a openapi.json di rmyndharis/OpenWA:
//  POST /api/sessions/{id}/messages/send-text  body { chatId, text }
//  header X-API-Key. Config (base URL + api key) in platform_settings.

import { getPlatformSetting } from "./getPlatformSetting.ts";
import { pickOpenWaNumber, weekKeyOf, type OpenWaNumberState } from "./openwaPickNumber.ts";
import { lidDaMessageId, registraLid } from "./openwaLid.ts";

// I contatti marketing della piattaforma vivono su questa company.
export const OPENWA_PLATFORM_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

// Path REST del gateway OpenWA (fonte: openapi.json del progetto).
export const OWA_PATHS = {
  createSession: () => `/api/sessions`,
  startSession: (id: string) => `/api/sessions/${encodeURIComponent(id)}/start`,
  getQr: (id: string) => `/api/sessions/${encodeURIComponent(id)}/qr`,
  pairingCode: (id: string) => `/api/sessions/${encodeURIComponent(id)}/pairing-code`,
  status: (id: string) => `/api/sessions/${encodeURIComponent(id)}`,
  deleteSession: (id: string) => `/api/sessions/${encodeURIComponent(id)}`,
  createWebhook: (id: string) => `/api/sessions/${encodeURIComponent(id)}/webhooks`,
  sendText: (id: string) => `/api/sessions/${encodeURIComponent(id)}/messages/send-text`,
  sendImage: (id: string) => `/api/sessions/${encodeURIComponent(id)}/messages/send-image`,
  sendDocument: (id: string) => `/api/sessions/${encodeURIComponent(id)}/messages/send-document`,
  typing: (id: string) => `/api/sessions/${encodeURIComponent(id)}/chats/typing`,
  // Valida un numero prima dell'invio: ritorna { number, exists, whatsappId }.
  // Serve per i numeri "freddi" (chatId numero@c.us non canonico → falliscono).
  checkNumber: (id: string, number: string) =>
    `/api/sessions/${encodeURIComponent(id)}/contacts/check/${encodeURIComponent(number)}`,
};

// ── Anti-ban helpers ────────────────────────────────────────────────────────

/** Risolve lo spintax "{ciao|salve|buongiorno}" scegliendo un'opzione a caso.
 *  Variare il testo evita l'impronta "stesso messaggio in massa" = spam. */
export function applySpintax(text: string): string {
  return (text ?? "").replace(/\{([^{}]+)\}/g, (whole, inner) => {
    const opts = String(inner).split("|");
    if (opts.length < 2) return whole; // non è spintax, lascia com'è
    return opts[Math.floor(Math.random() * opts.length)].trim();
  });
}

/** Ora corrente (0-23) nel fuso Europe/Rome. */
function romeHour(): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(new Date());
  return parseInt(h, 10) || 0;
}

/** Giorno della settimana a Roma: 1 = lunedì … 7 = domenica. */
function romeWeekday(): number {
  const g = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", weekday: "short" }).format(new Date());
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[g] ?? 1;
}

/**
 * True se ORA è fuori dalla finestra di invio "umana".
 *
 * Guarda l'ora E il giorno. Prima controllava solo l'ora: un messaggio
 * commerciale a freddo la domenica mattina è una segnalazione quasi garantita,
 * e nessun cap giornaliero ti protegge da quello. Il weekend si può
 * riaprire da platform_settings (openwa_invia_weekend = "true") per chi
 * scrive a un pubblico che il sabato lavora — nell'edilizia capita.
 */
export async function outsideQuietHours(): Promise<boolean> {
  const start = parseInt((await getPlatformSetting("openwa_quiet_start")) || "8", 10);
  const end = parseInt((await getPlatformSetting("openwa_quiet_end")) || "21", 10);
  const h = romeHour();
  const s = Number.isFinite(start) ? start : 8;
  const e = Number.isFinite(end) ? end : 21;
  if (h < s || h >= e) return true;

  const weekendAperto = ((await getPlatformSetting("openwa_invia_weekend")) || "false").toLowerCase() === "true";
  if (!weekendAperto && romeWeekday() >= 6) return true;

  return false;
}

/** Ritardo "umano" proporzionale alla lunghezza del testo, con jitter. Cap ~4.5s. */
function humanDelayMs(textLen: number): number {
  const base = 700 + textLen * 35;
  const jitter = Math.floor(Math.random() * 900);
  return Math.min(4500, base + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function romeToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
}

export function digitsOnly(s: string): string {
  return (s || "").replace(/[^\d]/g, "");
}

/** phone → chatId WhatsApp ("39333...@c.us"). */
export function toChatId(phone: string): string {
  const d = digitsOnly(phone);
  return d ? `${d}@c.us` : "";
}

export interface OwaConfig { baseUrl: string; apiKey: string; }

/** Legge e valida la config del gateway. Lancia se incompleta. */
export async function getOwaConfig(): Promise<OwaConfig> {
  const baseUrl = (await getPlatformSetting("openwa_base_url")).trim().replace(/\/+$/, "");
  const apiKey = (await getPlatformSetting("openwa_api_key")).trim();
  if (!baseUrl || !apiKey) {
    throw new Error("Gateway OpenWA non configurato: imposta base URL e API key nelle impostazioni.");
  }
  return { baseUrl, apiKey };
}

export interface OwaFetchResult { ok: boolean; status: number; json: any; text: string; }

export async function owaFetch(
  cfg: OwaConfig, path: string, init?: RequestInit, timeoutMs = 20000,
): Promise<OwaFetchResult> {
  // Timeout DURO: il gateway gira dietro un tunnel che, se l'origine è giù,
  // tiene la connessione aperta a lungo → senza AbortController la function
  // resta appesa fino al kill del worker. Scaduto → errore chiaro.
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "X-API-Key": cfg.apiKey, ...(init?.headers ?? {}) },
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      status: 0,
      json: null,
      text: aborted ? `timeout dopo ${timeoutMs / 1000}s (gateway non raggiungibile)` : String(e),
    };
  } finally {
    clearTimeout(t);
  }
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, json, text };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export interface SendParams {
  to?: string;            // telefono destinatario (se non si passa contactId)
  contactId?: string | null;
  text: string;
  numberId?: string | null;   // override manuale del numero mittente
  contactTags?: string[];
  /** Invii MANUALI (inbox/contatto): saltano la finestra oraria. Default false. */
  bypassQuietHours?: boolean;
  /**
   * Primo contatto a freddo: accoda l'istruzione per farsi rimuovere.
   * Lo STOP funziona da sempre, ma se non lo scrivi la gente non lo usa —
   * ti blocca e basta, e il blocco pesa sul punteggio del numero molto piu'
   * di una richiesta di cancellazione. NON va messo nelle risposte in
   * conversazione, dove sarebbe fuori luogo.
   */
  coldOutreach?: boolean;
  /** Simula "sta scrivendo…" + ritardo umano prima di inviare. Default true. */
  simulateTyping?: boolean;
  /** Media in uscita: path bucket openwa-media (o URL http). `text` = caption. */
  mediaPath?: string;
  mediaKind?: "image" | "document";
  mediaFilename?: string;
}

export interface SendResult {
  ok: boolean;
  numberId?: string;
  chatId?: string;
  error?: string;
  status?: number;  // codice HTTP suggerito per l'errore (400/409/502)
}

/**
 * Invia un messaggio WhatsApp Locale con contromisure anti-ban:
 *  - finestra oraria (per gli invii automatici),
 *  - spintax per variare il testo,
 *  - scelta numero con warm-up + throttle + rotazione least-loaded,
 *  - presenza "sta scrivendo…" + ritardo umano prima dell'invio.
 * Logga in openwa_messages, aggiorna cap e last_message_at.
 * NON fa controlli d'autorizzazione: il chiamante è responsabile (super_admin
 * o motore platform-scoped). Opera sempre nel dominio della platform company.
 */
export async function sendOpenWaMessage(admin: Admin, params: SendParams): Promise<SendResult> {
  const rawText = (params.text ?? "").trim();
  if (!rawText && !params.mediaPath) return { ok: false, error: "Testo del messaggio mancante.", status: 400 };
  if (!params.to && !params.contactId) return { ok: false, error: "Destinatario mancante.", status: 400 };

  // Anti-ban #1: finestra oraria umana (solo per invii automatici).
  if (!params.bypassQuietHours && await outsideQuietHours()) {
    return { ok: false, error: "Fuori dall'orario di invio consentito (finestra anti-ban). Riprova nella fascia diurna.", status: 409 };
  }

  let phone = (params.to ?? "").trim();
  let contactTags = Array.isArray(params.contactTags) ? params.contactTags : [];
  let contactName: string | null = null;

  if (params.contactId) {
    const { data: c } = await admin
      .from("marketing_contacts")
      .select("phone, tags, first_name, last_name, optout_whatsapp")
      .eq("id", params.contactId)
      .maybeSingle();
    if (c) {
      if (c.optout_whatsapp) return { ok: false, error: "Contatto in opt-out WhatsApp.", status: 400 };
      phone = phone || c.phone || "";
      contactTags = contactTags.length ? contactTags : (c.tags ?? []);
      contactName = [c.first_name, c.last_name].filter(Boolean).join(" ") || null;
    }
  }

  const chatId = toChatId(phone);
  if (!chatId) return { ok: false, error: "Numero destinatario non valido.", status: 400 };

  // Invio a NUMERO LIBERO (senza contact_id): se il numero corrisponde a un
  // contatto piattaforma, due cose. (1) Opt-out: chi ha rinunciato non riceve.
  // (2) Aggancio: il messaggio si intesta al contatto — senza, l'invio non
  // comparirebbe nella sua scheda ne' nel centro Conversazioni. Solo su match
  // UNIVOCO: con due contatti stesse-ultime-9-cifre meglio nessun aggancio che
  // quello sbagliato.
  let contactIdEffettivo = params.contactId ?? null;
  if (!contactIdEffettivo && phone) {
    const last9 = digitsOnly(phone).slice(-9);
    if (last9.length >= 9) {
      const { data: known } = await admin
        .from("marketing_contacts")
        .select("id, optout_whatsapp")
        .eq("company_id", OPENWA_PLATFORM_COMPANY_ID)
        .ilike("phone", `%${last9}%`)
        .limit(2);
      if (known?.some((k: { optout_whatsapp: boolean | null }) => k.optout_whatsapp)) {
        return { ok: false, error: "Numero in opt-out WhatsApp.", status: 400 };
      }
      if (known?.length === 1) contactIdEffettivo = known[0].id;
    }
  }

  // Anti-ban #2: varia il testo (spintax) — evita l'impronta "stesso messaggio".
  let text = applySpintax(rawText);
  if (params.coldOutreach) {
    const nota = (await getPlatformSetting("openwa_nota_optout"))
      || "Se preferisci non ricevere altri messaggi, rispondi STOP.";
    // Solo se non l'ha gia' scritta l'autore del messaggio.
    if (nota && !text.toUpperCase().includes("STOP")) {
      text = `${text}\n\n${nota}`;
    }
  }

  const { data: numbers } = await admin
    .from("openwa_numbers")
    .select("id, session_id, numero, stato, tags, daily_cap, daily_sent, daily_sent_date, connected_since, warmup_base, warmup_step, min_gap_seconds, last_message_at, weekly_cap, weekly_sent, weekly_sent_week")
    .is("deleted_at", null);
  const pool = (numbers ?? []) as (OpenWaNumberState & { session_id: string; numero: string | null })[];
  const today = romeToday();
  const weekKey = weekKeyOf(today);
  const nowMs = Date.now();

  // Anti-ban #3: warm-up + throttle + tetto settimanale + rotazione.
  // L'override manuale del numero bypassa il throttle (scelta esplicita dell'utente).
  const chosen = params.numberId
    ? pool.find((n) => n.id === params.numberId && n.stato === "connected") ?? null
    : pickOpenWaNumber(pool, contactTags, today, nowMs, weekKey);
  if (!chosen) {
    return { ok: false, error: "Nessun numero WhatsApp Locale disponibile (warm-up/cap esaurito, throttle o tag non coperto).", status: 409 };
  }

  const cfg = await getOwaConfig();

  // Valida/risolve il numero prima dell'invio: i contatti "freddi" (mai in chat
  // col mittente) falliscono o non consegnano se si invia a `numero@c.us`
  // costruito a mano. contacts/check ritorna { exists, whatsappId } (id
  // canonico). Se il numero non è su WhatsApp → errore chiaro invece di un
  // fallimento silenzioso. Difensivo: se il check non risponde in modo utile
  // (endpoint assente/irraggiungibile) si prosegue col chatId ingenuo.
  let sendChatId = chatId;
  {
    const digits = digitsOnly(phone);
    const chk = await owaFetch(cfg, OWA_PATHS.checkNumber(chosen.session_id, digits), { method: "GET" }, 8000);
    if (chk.ok && chk.json && typeof chk.json.exists === "boolean") {
      if (!chk.json.exists) {
        return { ok: false, error: `Il numero ${digits} non risulta su WhatsApp.`, status: 400, numberId: chosen.id, chatId };
      }
      if (typeof chk.json.whatsappId === "string" && chk.json.whatsappId) sendChatId = chk.json.whatsappId;
    }
  }

  // Anti-ban #4: presenza "sta scrivendo…" + ritardo umano proporzionale.
  if (params.simulateTyping !== false) {
    await owaFetch(cfg, OWA_PATHS.typing(chosen.session_id), {
      method: "POST",
      body: JSON.stringify({ chatId: sendChatId, state: "typing" }),
    }).catch(() => null);
    await sleep(humanDelayMs(text.length));
  }

  let r: OwaFetchResult;
  if (params.mediaPath) {
    // Media in uscita: genera signed URL dal bucket privato e usa send-image/document.
    let mediaUrl = params.mediaPath;
    if (!/^https?:\/\//i.test(mediaUrl)) {
      const { data: signed } = await admin.storage.from("openwa-media").createSignedUrl(params.mediaPath, 3600);
      mediaUrl = signed?.signedUrl ?? "";
    }
    if (!mediaUrl) return { ok: false, error: "Media non accessibile.", status: 400 };
    const mpath = params.mediaKind === "document"
      ? OWA_PATHS.sendDocument(chosen.session_id)
      : OWA_PATHS.sendImage(chosen.session_id);
    r = await owaFetch(cfg, mpath, {
      method: "POST",
      body: JSON.stringify({ chatId: sendChatId, url: mediaUrl, caption: text || undefined, filename: params.mediaFilename }),
    });
  } else {
    r = await owaFetch(cfg, OWA_PATHS.sendText(chosen.session_id), {
      method: "POST",
      body: JSON.stringify({ chatId: sendChatId, text }),
    });
  }

  const sentDate = chosen.daily_sent_date === today ? chosen.daily_sent : 0;
  const sentWeek = chosen.weekly_sent_week === weekKey ? (chosen.weekly_sent ?? 0) : 0;
  const status = r.ok ? "sent" : "failed";
  const nowIso = new Date().toISOString();

  await admin.from("openwa_messages").insert({
    number_id: chosen.id,
    contact_id: contactIdEffettivo,
    wa_chat_id: chatId,
    contact_phone: phone,
    contact_name: contactName,
    direction: "outbound",
    body: text || null,
    media_url: params.mediaPath ?? null,
    status,
    provider_msg_id: r.json?.id ?? r.json?.messageId ?? null,
    error: r.ok ? null : `Gateway ${r.status}: ${r.text}`.slice(0, 500),
  });

  // L'id del messaggio appena inviato contiene il LID del destinatario
  // (`true_194360188621035@lid_...`). E' l'unico punto in cui la corrispondenza
  // LID → numero e' nota con certezza: registrandola qui, la risposta che
  // arrivera' dal webhook finisce nello stesso thread invece che in uno nuovo.
  const lidDest = lidDaMessageId(r.json?.id ?? r.json?.messageId ?? null);
  if (lidDest) await registraLid(admin, lidDest, phone, chatId, "outbound");

  if (!r.ok) return { ok: false, error: `Invio fallito: ${r.status} ${r.text}`, status: 502, numberId: chosen.id, chatId };

  // Aggiorna cap giornaliero + settimanale + timestamp per il throttle.
  await admin
    .from("openwa_numbers")
    .update({
      daily_sent: sentDate + 1, daily_sent_date: today,
      weekly_sent: sentWeek + 1, weekly_sent_week: weekKey,
      last_message_at: nowIso, last_seen_at: nowIso,
    })
    .eq("id", chosen.id);

  return { ok: true, numberId: chosen.id, chatId };
}
