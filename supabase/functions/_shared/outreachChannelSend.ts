/**
 * outreachChannelSend — invio EFFETTIVO dei messaggi NON-email (whatsapp/sms) del
 * dispatcher cold (outreach-dispatch). Isola le chiamate ai provider (Telnyx per
 * SMS, Meta Graph per WhatsApp) così il dispatcher resta leggibile.
 *
 * A differenza delle edge function per-tenant (telnyx-invia-sms, whatsapp-send) qui
 * si invia SEMPRE come PLATFORM COMPANY (00000000-…-001), con service-role, senza
 * wallet/campagne per-azienda:
 *   • SMS:      POST https://api.telnyx.com/v2/messages — mittente = numero Telnyx
 *               dedicato della piattaforma (sms_telnyx_numbers, se presente) oppure
 *               mittente ALFANUMERICO (default "EdiliziaEiC"). Env: TELNYX_MASTER_API_KEY
 *               (+ TELNYX_MESSAGING_PROFILE_ID, obbligatorio per alfanumerico).
 *   • WhatsApp: POST graph.facebook.com/v21.0/<phoneNumberId>/messages via
 *               resolveWhatsAppSender(admin, PLATFORM_COMPANY) (numero WhatsApp
 *               Business della piattaforma, token decifrato). Testo libero: Meta lo
 *               rifiuta fuori dalla finestra 24h (cold) → vedi nota sotto.
 *
 * Nessun controllo carta/credito qui: è cold di piattaforma (stesso razionale di
 * outreach-ai-flow / outreach-send-single). Il chiamante (dispatcher) gestisce
 * idempotenza, opt-out, telefono mancante e avanzamento cadenza.
 *
 * NB WhatsApp cold (compliance Meta): per i contatti fuori dalla Customer Service
 * Window 24h Meta RIFIUTA il testo libero (errore 131047) e degrada la quality
 * rating del numero. Due strade:
 *   • il nodo ha un TEMPLATE approvato → si invia type:"template" (passa anche a
 *     finestra chiusa, cioè COLD) riusando il pattern di whatsapp-broadcast;
 *   • il nodo NON ha template → si invia type:"text" SOLO se la finestra 24h è
 *     APERTA (getWhatsAppWindowStatus); a finestra chiusa si ritorna ok=false con
 *     un errore chiaro ("finestra WA chiusa, serve template") così il dispatcher
 *     salta la riga e AVANZA la cadenza, senza mandare testo destinato al rifiuto.
 */

// deno-lint-ignore-file no-explicit-any

import { resolveWhatsAppSender } from "./resolveWhatsAppSender.ts";
import { buildTemplatePayload, getWhatsAppWindowStatus } from "./whatsappWindow.ts";

const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";

/** Esito di un invio su canale messaggio. ok=false → il dispatcher salta (no retry). */
export interface ChannelSendResult {
  ok: boolean;
  /** id del messaggio presso il provider, quando disponibile. */
  providerMessageId?: string | null;
  /** mittente usato (numero o alfanumerico), per il log. */
  from?: string | null;
  /** messaggio d'errore quando ok=false. */
  error?: string;
}

/**
 * Invia un SMS via Telnyx come piattaforma. `to` = telefono (qualsiasi formato;
 * Telnyx accetta E.164, qui passiamo il valore originale del contatto). `text` =
 * corpo già renderizzato. Senza TELNYX_MASTER_API_KEY → ok=false (provider non
 * configurato): il dispatcher salta e avanza.
 */
export async function sendOutreachSms(
  admin: any,
  to: string,
  text: string,
): Promise<ChannelSendResult> {
  const apiKey = Deno.env.get("TELNYX_MASTER_API_KEY");
  const profileId = Deno.env.get("TELNYX_MESSAGING_PROFILE_ID");
  if (!apiKey) return { ok: false, error: "provider SMS non configurato (TELNYX_MASTER_API_KEY assente)" };
  if (!text?.trim()) return { ok: false, error: "corpo SMS vuoto" };

  // Mittente: numero Telnyx dedicato della piattaforma se presente, altrimenti
  // mittente alfanumerico (stessa logica di telnyx-invia-sms).
  let from = "EdiliziaEiC";
  try {
    const { data: numero } = await admin
      .from("sms_telnyx_numbers")
      .select("numero_e164")
      .eq("company_id", PLATFORM_COMPANY)
      .eq("stato", "attivo")
      .maybeSingle();
    if (numero?.numero_e164) from = numero.numero_e164;
  } catch { /* nessun numero → resta alfanumerico */ }

  try {
    const res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        text,
        // messaging_profile_id obbligatorio per mittente alfanumerico.
        ...(profileId ? { messaging_profile_id: profileId } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, from, error: `Telnyx ${res.status}: ${body.slice(0, 300)}` };
    }
    const body = await res.json().catch(() => ({})) as { data?: { id?: string } };
    return { ok: true, from, providerMessageId: body?.data?.id ?? null };
  } catch (e) {
    return { ok: false, from, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Template approvato passato al send WhatsApp (preso dal nodo step, params già renderizzati). */
export interface OutreachWhatsAppTemplate {
  /** nome del template Meta approvato. */
  name: string;
  /** lingua del template (default 'it'). */
  language?: string | null;
  /** valori dei parametri body {{1}},{{2}},… GIÀ renderizzati (variabili contatto risolte). */
  params?: string[];
}

/**
 * Invia un messaggio WhatsApp via Meta Graph come piattaforma. `to` = telefono
 * normalizzato (sole cifre, lo normalizza comunque). Due modalità:
 *
 *   • con `template` (template_name valorizzato) → type:"template": passa anche
 *     COLD (finestra 24h chiusa). `template.params` sono i valori già renderizzati
 *     dei placeholder body. Riusa buildTemplatePayload (stesso pattern broadcast).
 *   • senza `template` → type:"text" SOLO se la finestra 24h è APERTA per il numero
 *     nell'azienda di piattaforma; a finestra chiusa → ok=false con errore chiaro
 *     ("finestra WA chiusa, serve template approvato"): il dispatcher salta e avanza,
 *     non si manda testo che Meta rifiuterebbe (131047) degradando la quality rating.
 *
 * Senza numero WhatsApp della piattaforma → ok=false: il dispatcher salta e avanza.
 */
export async function sendOutreachWhatsApp(
  admin: any,
  to: string,
  text: string,
  template?: OutreachWhatsAppTemplate | null,
): Promise<ChannelSendResult> {
  const cleanTo = (to ?? "").replace(/[^0-9]/g, "");
  if (!cleanTo) return { ok: false, error: "telefono WhatsApp non valido" };
  const useTemplate = !!template?.name && template.name.trim().length > 0;
  // Testo libero: serve un corpo. Template: il corpo è opzionale (i parametri bastano).
  if (!useTemplate && !text?.trim()) return { ok: false, error: "corpo WhatsApp vuoto" };

  const sender = await resolveWhatsAppSender(admin, PLATFORM_COMPANY);
  if (!sender) return { ok: false, error: "WhatsApp non configurato per la piattaforma" };

  // Senza template, il testo libero è ammesso da Meta SOLO entro la finestra 24h.
  // A finestra chiusa (cold) si salta: meglio non spedire che bruciare la reputazione.
  if (!useTemplate) {
    const win = await getWhatsAppWindowStatus(admin, PLATFORM_COMPANY, cleanTo);
    if (!win.open) {
      return {
        ok: false,
        from: sender.numero ?? sender.phoneNumberId,
        error: "finestra WA chiusa (contatto a freddo): serve un template approvato",
      };
    }
  }

  // Payload: template (compliance cold) oppure testo libero (in finestra).
  const payload = useTemplate
    ? buildTemplatePayload(cleanTo, {
        name: template!.name,
        language: template!.language || "it",
        variables: (template!.params ?? []).map((v) => (v == null ? "" : String(v))),
      })
    : {
        messaging_product: "whatsapp",
        to: cleanTo,
        type: "text",
        text: { body: text },
      };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${sender.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${sender.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const result = await res.json().catch(() => ({})) as any;
    if (!res.ok) {
      const msg = result?.error?.message || `Meta ${res.status}`;
      return { ok: false, from: sender.numero ?? sender.phoneNumberId, error: String(msg).slice(0, 300) };
    }
    return {
      ok: true,
      from: sender.numero ?? sender.phoneNumberId,
      providerMessageId: result?.messages?.[0]?.id ?? null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Dispatch per canale: invia il messaggio sul canale richiesto. email NON gestito
 * qui. `template` è usato SOLO da WhatsApp (SMS lo ignora): permette al dispatcher
 * di passare il template del nodo senza ramificare la firma per-canale.
 */
export async function sendOnChannel(
  admin: any,
  channel: "whatsapp" | "sms",
  to: string,
  text: string,
  template?: OutreachWhatsAppTemplate | null,
): Promise<ChannelSendResult> {
  return channel === "sms"
    ? await sendOutreachSms(admin, to, text)
    : await sendOutreachWhatsApp(admin, to, text, template);
}
