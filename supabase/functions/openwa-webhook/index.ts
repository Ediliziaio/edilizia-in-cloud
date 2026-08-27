// openwa-webhook — riceve gli eventi dal gateway OpenWA (WhatsApp Locale).
// Chiamato dal gateway esterno (nessun JWT utente): verify_jwt=false in config.toml.
// Auth via HMAC-SHA256 del body con `openwa_webhook_secret` (platform_settings).
//
// Eventi gestiti:
//  - message.received → scrive un inbound in openwa_messages (aggiorna l'inbox live)
//  - session.status   → aggiorna lo stato del numero (connected/disconnected/banned)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { avvisaSuperAdmin } from "../_shared/avvisaSuperAdmin.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { romeToday, outsideQuietHours, sendOpenWaMessage } from "../_shared/openwaSend.ts";

const PLATFORM_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

/** Confronto a tempo costante tra due stringhe esadecimali. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyHmac(secret: string, rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const provided = signature.replace(/^sha256=/i, "").trim().toLowerCase();
  return timingSafeEqualHex(hex, provided);
}

/** Cifre pure da un chatId/phone ("39333...@c.us" → "39333..."). */
function digitsOnly(s: string): string {
  return (s || "").replace(/[^\d]/g, "");
}

// Estensione file per i MIME più comuni su WhatsApp.
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/3gpp": "3gp", "video/quicktime": "mov",
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/amr": "amr", "audio/wav": "wav",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

/**
 * OpenWA consegna i media in arrivo come base64 inline. Li decodifica, li carica
 * sul bucket privato openwa-media e ritorna il PATH da salvare in media_url
 * (l'inbox genera la signed URL al render). Ritorna null se non c'è media o fallisce.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function uploadInboundMedia(admin: any, numberId: string | null, providerMsgId: string | null, msg: any): Promise<string | null> {
  const media = msg.media ?? null;
  const b64: string | null = media?.data ?? msg.mediaData ?? (typeof msg.data === "string" ? msg.data : null);
  // Se il gateway fornisce già un URL pubblico, usalo direttamente.
  if (!b64 || typeof b64 !== "string") return msg.mediaUrl ?? msg.media_url ?? null;

  const mimetype: string = media?.mimetype ?? msg.mimetype ?? msg.mimeType ?? "application/octet-stream";
  try {
    const bin = atob(b64.replace(/^data:[^;]+;base64,/, ""));
    if (bin.length > 8_000_000) { // ~8MB: oltre, evita timeout della edge
      console.warn("[openwa-webhook] media troppo grande, saltato");
      return null;
    }
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = MIME_EXT[mimetype] ?? "bin";
    const safeId = (providerMsgId ?? crypto.randomUUID()).replace(/[^\w.-]/g, "_");
    const path = `${numberId ?? "unknown"}/${safeId}.${ext}`;
    const { error } = await admin.storage.from("openwa-media").upload(path, bytes, { contentType: mimetype, upsert: true });
    if (error) { console.warn("[openwa-webhook] upload media:", error.message); return null; }
    return path;
  } catch (e) {
    console.warn("[openwa-webhook] decode media:", e);
    return null;
  }
}

/** Notifica email best-effort (via send-transactional-v2, service-role). */
async function notifyByEmail(to: string, phone: string, text: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  const safe = (text || "").replace(/[<>]/g, "");
  await fetch(`${url}/functions/v1/send-transactional-v2`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      companyId: null,
      to,
      precomputedSubject: `WhatsApp Locale · nuovo messaggio da ${phone}`,
      precomputedHtml: `<p>Nuovo messaggio WhatsApp Locale da <strong>${phone}</strong>:</p><blockquote>${safe}</blockquote>`,
      precomputedText: `Nuovo messaggio WhatsApp Locale da ${phone}: ${safe}`,
      skipCredits: true,
      metadata: { source: "openwa-rules" },
    }),
  }).catch(() => null);
}

/**
 * Motore REGOLE: valuta le regole abilitate (del numero + globali) per priorità
 * ed esegue le azioni (blocco, auto-risposta, tag/assegnazione, notifica).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyRules(admin: any, ctx: { numberId: string | null; chatId: string; phone: string; text: string; contactId: string | null }) {
  const cleanText = (ctx.text || "").trim();
  if (!cleanText) return;

  const numFilter = ctx.numberId
    ? `number_id.eq.${ctx.numberId},number_id.is.null`
    : `number_id.is.null`;
  const { data: rules } = await admin
    .from("openwa_rules")
    .select("*")
    .eq("enabled", true)
    .or(numFilter)
    .order("priority", { ascending: true });
  if (!rules?.length) return;

  const norm = cleanText.toLowerCase();
  const { count } = await admin.from("openwa_messages")
    .select("id", { count: "exact", head: true })
    .eq("wa_chat_id", ctx.chatId).eq("direction", "inbound");
  const isFirst = (count ?? 0) <= 1;
  let outside: boolean | null = null;

  for (const r of rules) {
    if (r.only_first_contact && !isFirst) continue;
    if (r.only_outside_hours) {
      if (outside === null) outside = await outsideQuietHours();
      if (!outside) continue;
    }
    let matched = false;
    if (r.match_type === "any") {
      matched = true;
    } else {
      const kws = (r.match_keywords ?? []).map((k: string) => k.toLowerCase().trim()).filter(Boolean);
      if (r.match_type === "contains") matched = kws.some((k: string) => norm.includes(k));
      else if (r.match_type === "equals") matched = kws.some((k: string) => norm === k);
      else if (r.match_type === "starts_with") matched = kws.some((k: string) => norm.startsWith(k));
    }
    if (!matched) continue;
    if (r.block) return; // spam/ignora → stop, nessuna altra azione

    if (r.reply_text) {
      // sendOpenWaMessage applica già lo spintax e sceglie/riusa il numero.
      await sendOpenWaMessage(admin, {
        to: ctx.phone || ctx.chatId,
        text: r.reply_text,
        numberId: ctx.numberId,
        contactId: ctx.contactId,
        bypassQuietHours: true,
      }).catch(() => null);
    }
    if (ctx.contactId && (r.add_tags?.length || r.assign_to)) {
      const patch: Record<string, unknown> = {};
      if (r.add_tags?.length) {
        const { data: c } = await admin.from("marketing_contacts").select("tags").eq("id", ctx.contactId).maybeSingle();
        patch.tags = Array.from(new Set([...(c?.tags ?? []), ...r.add_tags]));
      }
      if (r.assign_to) patch.assigned_to = r.assign_to;
      await admin.from("marketing_contacts").update(patch).eq("id", ctx.contactId);
    }
    if (r.notify_email) await notifyByEmail(r.notify_email, ctx.phone, cleanText);
  }
}

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });
  const jsonH = { ...corsH, "Content-Type": "application/json" };

  try {
    const rawBody = await req.text();

    // Firma OBBLIGATORIA: senza secret configurato il webhook viene rifiutato
    // (nessun bypass — impedisce l'iniezione di messaggi falsi).
    const secret = (await getPlatformSetting("openwa_webhook_secret")).trim();
    if (!secret) {
      console.error("[openwa-webhook] openwa_webhook_secret non configurato: webhook rifiutato");
      return new Response(JSON.stringify({ error: "webhook secret not configured" }), { status: 401, headers: jsonH });
    }
    const sig =
      req.headers.get("x-openwa-signature") ??
      req.headers.get("x-signature") ??
      req.headers.get("x-hub-signature-256");
    if (!(await verifyHmac(secret, rawBody, sig))) {
      return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401, headers: jsonH });
    }

    const payload = rawBody ? JSON.parse(rawBody) : {};
    // OpenWA manda il nome evento anche nell'header X-OpenWA-Event.
    const event: string = req.headers.get("x-openwa-event") ?? payload.event ?? payload.type ?? "";
    const sessionId: string = payload.session ?? payload.sessionId ?? payload.session_id ?? payload.data?.sessionId ?? "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Risolvi il numero locale dalla sessione.
    const { data: number } = await admin
      .from("openwa_numbers")
      .select("id, session_id")
      .eq("session_id", sessionId)
      .is("deleted_at", null)
      .maybeSingle();

    // ── session.status ────────────────────────────────────────────────────────
    if (event.includes("session") || event.includes("status") || event === "session.status") {
      const raw = String(payload.status ?? payload.state ?? payload.payload?.status ?? "").toLowerCase();
      let stato = "connecting";
      if (raw.includes("connect") || raw.includes("ready") || raw.includes("authenticated")) stato = "connected";
      else if (raw.includes("ban")) stato = "banned";
      else if (raw.includes("disconnect") || raw.includes("logout") || raw.includes("close")) stato = "disconnected";

      if (number) {
        await admin.from("openwa_numbers")
          .update({ stato, last_seen_at: new Date().toISOString() })
          .eq("id", number.id);
        // Alla prima connessione fissa la data di warm-up (anti-ban).
        if (stato === "connected") {
          await admin.from("openwa_numbers")
            .update({ connected_since: romeToday() })
            .eq("id", number.id).is("connected_since", null);
        }
      }
      return new Response(JSON.stringify({ ok: true }), { headers: jsonH });
    }

    // ── message.received (inbound) ────────────────────────────────────────────
    const msg = payload.payload ?? payload.message ?? payload.data ?? payload;
    const fromMe: boolean = msg.fromMe === true || msg.from_me === true;
    if (fromMe) {
      // eco dei nostri outbound: già loggati da openwa-gateway, non duplicare.
      return new Response(JSON.stringify({ ok: true, skipped: "fromMe" }), { headers: jsonH });
    }

    const fromRaw: string = msg.from ?? msg.chatId ?? msg.sender ?? "";
    const chatId = fromRaw.includes("@") ? fromRaw : (digitsOnly(fromRaw) ? `${digitsOnly(fromRaw)}@c.us` : "");
    const text: string = msg.body ?? msg.text ?? msg.caption ?? "";
    const notifyName: string | null = msg.notifyName ?? msg.notify_name ?? msg.pushName ?? null;
    const providerMsgId: string | null = msg.id ?? msg.messageId ?? msg.message_id ?? null;
    const phoneDigits = digitsOnly(chatId);
    // Media in arrivo: base64 → bucket privato → path (o URL diretto se fornito).
    const mediaUrl: string | null = await uploadInboundMedia(admin, number?.id ?? null, providerMsgId, msg);

    if (!chatId) {
      return new Response(JSON.stringify({ ok: true, skipped: "no-chat-id" }), { headers: jsonH });
    }

    // Dedup: i webhook OpenWA vengono ritentati (stesso provider_msg_id /
    // X-OpenWA-Idempotency-Key). Se già visto, non inserire un duplicato.
    if (providerMsgId) {
      const { data: dup } = await admin
        .from("openwa_messages")
        .select("id")
        .eq("provider_msg_id", providerMsgId)
        .maybeSingle();
      if (dup) {
        return new Response(JSON.stringify({ ok: true, skipped: "duplicate" }), { headers: jsonH });
      }
    }

    // Prova a collegare il messaggio a un contatto marketing della piattaforma
    // (match sulle ultime 9 cifre del numero — tollerante ai formati salvati).
    let contactId: string | null = null;
    let contactName: string | null = notifyName;
    if (phoneDigits.length >= 9) {
      const last9 = phoneDigits.slice(-9);
      const { data: matches } = await admin
        .from("marketing_contacts")
        .select("id, first_name, last_name")
        .eq("company_id", PLATFORM_COMPANY_ID)
        .ilike("phone", `%${last9}%`)
        .limit(2);
      // Assegna SOLO se il match è univoco: due contatti con le stesse ultime 9
      // cifre resterebbero ambigui → meglio non collegare che collegare al contatto sbagliato.
      if (matches && matches.length === 1) {
        contactId = matches[0].id;
        contactName = [matches[0].first_name, matches[0].last_name].filter(Boolean).join(" ") || notifyName;
      }
    }

    await admin.from("openwa_messages").insert({
      number_id: number?.id ?? null,
      contact_id: contactId,
      wa_chat_id: chatId,
      contact_phone: phoneDigits ? `+${phoneDigits}` : null,
      contact_name: contactName,
      direction: "inbound",
      body: text || null,
      media_url: mediaUrl,
      status: "delivered",
      provider_msg_id: providerMsgId,
    });

    if (number) {
      await admin.from("openwa_numbers")
        .update({ last_seen_at: new Date().toISOString(), stato: "connected" })
        .eq("id", number.id);
    }

    // Opt-out automatico: se il contatto risponde STOP/CANCELLA/… lo rispettiamo
    // (compliance + anti-ban: non ricontattare chi ha chiesto di smettere).
    let didOptOut = false;
    if (contactId && text) {
      const normUp = text.trim().toUpperCase().replace(/[.!?,;:]/g, "");
      const OPTOUT = ["STOP", "CANCELLA", "CANCELLAMI", "CANCELLARE", "RIMUOVI", "RIMUOVIMI", "UNSUBSCRIBE", "ANNULLA", "BASTA"];
      if (OPTOUT.includes(normUp) || normUp.startsWith("STOP ")) {
        await admin.from("marketing_contacts")
          .update({ optout_whatsapp: true, optout_at: new Date().toISOString(), optout_reason: "STOP via WhatsApp Locale" })
          .eq("id", contactId);
        didOptOut = true;
      }
    }

    // ── Evento per il motore automazioni ────────────────────────────────────
    // Il nodo "Aspetta risposta WhatsApp" (wait_for_event →
    // whatsapp_message_received) esisteva gia' nel builder, ma su questo canale
    // NESSUNO emetteva l'evento: il flusso restava in attesa fino al timeout e
    // il follow-up partiva ANCHE verso chi aveva gia' risposto. Oltre a essere
    // sbagliato, insistere con chi ti ha risposto e' il modo piu' rapido di
    // farsi segnalare come spam — cioe' l'opposto del ridurre i ban.
    //
    // Stesso nome evento del canale Meta (bot_operativo.ts): un unico nodo nel
    // builder copre entrambi i canali. Si emette ANCHE sugli opt-out: uno STOP
    // deve fermare la sequenza, non solo bloccare il singolo invio.
    if (contactId) {
      // try/catch VERO: il query builder di supabase-js e' un Thenable, non una
      // Promise — non espone .catch(), e usarlo qui farebbe esplodere il
      // webhook proprio sul percorso di gestione dell'errore.
      try {
        await admin.from("automation_trigger_events").insert({
          company_id: PLATFORM_COMPANY_ID,
          trigger_event: "whatsapp_message_received",
          entity_id: contactId,
          entity_type: "contact",
          payload: {
            from: phoneDigits,
            message: text || null,
            channel: "whatsapp_locale",
            wa_chat_id: chatId,
            openwa_number_id: number?.id ?? null,
            optout: didOptOut,
          },
        });
      } catch (e) {
        // Non deve far fallire il webhook: il messaggio e' gia' salvato e la
        // risposta al gateway deve restare 200, altrimenti OpenWA ritenta.
        console.error("[openwa-webhook] trigger automazioni:", (e as Error)?.message);
      }
    }

    // Una risposta chiude il contatto in TUTTE le campagne attive: da qui in
    // poi non riceve piu' follow-up. E' la meta' dell'anello anti-spam —
    // l'altra e' l'evento per le automazioni qui sopra.
    if (contactId) {
      try {
        await admin.rpc("openwa_campagna_segna_risposta", { p_contact_id: contactId });
      } catch (e) {
        console.error("[openwa-webhook] segna risposta campagne:", (e as Error)?.message);
      }
    }

    // Avviso a chi presidia: una risposta a freddo vale finche' e' calda.
    // Fuori dagli opt-out, dove non c'e' niente da presidiare.
    if (!didOptOut) {
      try {
        const chi = contactName || (phoneDigits ? `+${phoneDigits}` : "un contatto");
        await avvisaSuperAdmin(admin, {
          tipo: "whatsapp_risposta",
          titolo: `Risposta WhatsApp da ${chi}`,
          testo: (text || "(messaggio senza testo)").slice(0, 160),
          url: "/admin/marketing/whatsapp-locale",
          // Stesso tag per chat: se scrive tre volte non vibra tre volte.
          tag: `openwa-${chatId}`,
          entityType: contactId ? "marketing_contact" : null,
          entityId: contactId,
        });
      } catch (e) {
        console.error("[openwa-webhook] avviso staff:", (e as Error)?.message);
      }
    }

    // Motore regole (auto-risposta / tag / assegna / notifica / blocco).
    // Saltato se il messaggio era un opt-out (non si risponde a chi dice STOP).
    if (!didOptOut) {
      await applyRules(admin, {
        numberId: number?.id ?? null,
        chatId,
        phone: phoneDigits ? `+${phoneDigits}` : "",
        text,
        contactId,
      }).catch((e) => console.error("[openwa-webhook] applyRules:", e));
    }

    return new Response(JSON.stringify({ ok: true }), { headers: jsonH });
  } catch (e) {
    console.error("[openwa-webhook] error:", e);
    return new Response(JSON.stringify({ error: (e as Error)?.message ?? "error" }), { status: 500, headers: jsonH });
  }
});
