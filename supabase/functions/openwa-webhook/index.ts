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
import { isLid, lidDaMessageId, risolviLid, registraLid, numeroDalPayload } from "../_shared/openwaLid.ts";
import { applicaRegole, type MessaggioInArrivo } from "../_shared/openwa-regole-motore.ts";
import { mappaStatoOpenWa, statoGrezzoDaPayload, riassuntoPayload } from "../_shared/openwaStato.ts";
import { classificaUnaRisposta } from "../_shared/openwa-classifica-una-risposta.ts";
import { shouldCreateOpportunity, triggerOpportunityFromSignal } from "../_shared/outreach-opportunity-trigger.ts";

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
async function notifyByEmail(to: string, phone: string, text: string, regola?: string | null) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  const safe = (text || "").replace(/[<>]/g, "");
  const perche = regola ? ` (regola «${regola.replace(/[<>]/g, "")}»)` : "";
  await fetch(`${url}/functions/v1/send-transactional-v2`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      companyId: null,
      to,
      precomputedSubject: `WhatsApp Locale · nuovo messaggio da ${phone}`,
      precomputedHtml: `<p>Nuovo messaggio WhatsApp Locale da <strong>${phone}</strong>${perche}:</p><blockquote>${safe}</blockquote>`,
      precomputedText: `Nuovo messaggio WhatsApp Locale da ${phone}${perche}: ${safe}`,
      skipCredits: true,
      metadata: { source: "openwa-rules" },
    }),
  }).catch(() => null);
}

/**
 * Motore REGOLE (auto-risposta, etichette, assegnazione, avviso, blocco e, per
 * le campagne, ferma flusso / esito / non scrivergli più): la logica sta in
 * _shared/openwa-regole-motore.ts, provata in vitest; qui solo le dipendenze.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyRules(admin: any, ctx: MessaggioInArrivo) {
  await applicaRegole({
    admin,
    platformCompanyId: PLATFORM_COMPANY_ID,
    // sendOpenWaMessage applica variabili e spintax; la regola risponde anche
    // fuori orario, perché risponde a chi ha appena scritto.
    inviaRisposta: (p) => sendOpenWaMessage(admin, { ...p, bypassQuietHours: true }),
    avvisaEmail: notifyByEmail,
    fuoriOrario: outsideQuietHours,
  }, ctx);
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
      .select("id, session_id, stato, display_name, numero")
      .eq("session_id", sessionId)
      .is("deleted_at", null)
      .maybeSingle();

    // ── session.status ────────────────────────────────────────────────────────
    // Solo gli eventi di SESSIONE: "status" da solo catturava anche gli ack dei
    // messaggi (message.status, "sent"/"delivered"), che finivano nel ramo qui
    // sotto e spegnevano il numero.
    const eventoSessione = /session|connection|state/.test(event) || event === "session.status";
    if (eventoSessione) {
      const raw = statoGrezzoDaPayload(payload);
      const stato = mappaStatoOpenWa(raw);

      // Stato che non so leggere: NON tocco il numero. Prima il default era
      // "connecting", e un payload con lo stato annidato in `data` (come lo
      // manda questo gateway) spegneva un numero perfettamente connesso a ogni
      // riconnessione notturna, fermando le campagne in silenzio.
      if (number && !stato) {
        console.warn(`[openwa-webhook] stato sessione non riconosciuto (numero ${number.numero} lasciato '${number.stato}'): evento="${event}" raw="${raw}" payload=${riassuntoPayload(payload)}`);
        await admin.from("openwa_numbers")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", number.id);
        return new Response(JSON.stringify({ ok: true, ignorato: "stato-sconosciuto" }), { headers: jsonH });
      }

      if (number && stato) {
        await admin.from("openwa_numbers")
          .update({ stato, last_seen_at: new Date().toISOString() })
          .eq("id", number.id);
        // Alla prima connessione fissa la data di warm-up (anti-ban).
        if (stato === "connected") {
          await admin.from("openwa_numbers")
            .update({ connected_since: romeToday() })
            .eq("id", number.id).is("connected_since", null);
        }

        // ── Avviso su ban/caduta ──────────────────────────────────────────────
        // Un numero bannato o caduto fermava tutto IN SILENZIO: le campagne
        // restavano "in corso", il dispatcher trovava il pool vuoto e nessuno
        // sapeva perche' non partiva piu' niente. Chi presidia deve saperlo
        // nel momento in cui succede, non scoprirlo giorni dopo dai contatori.
        const cadeva = (stato === "banned" || stato === "disconnected") && number.stato === "connected";
        if (cadeva) {
          const nome = number.display_name || number.numero || sessionId;
          // Restano altri numeri a coprire? Cambia il tono dell'avviso.
          const { count: altriAttivi } = await admin
            .from("openwa_numbers")
            .select("id", { count: "exact", head: true })
            .eq("stato", "connected").is("deleted_at", null).neq("id", number.id);
          const bannato = stato === "banned";
          try {
            await avvisaSuperAdmin(admin, {
              tipo: bannato ? "whatsapp_numero_bannato" : "whatsapp_numero_disconnesso",
              titolo: bannato
                ? `Numero WhatsApp BANNATO: ${nome}`
                : `Numero WhatsApp disconnesso: ${nome}`,
              testo: (altriAttivi ?? 0) > 0
                ? `Gli invii proseguono sugli altri ${altriAttivi} numeri connessi.`
                : "Era l'ultimo numero attivo: campagne e risposte sono FERME finche' non ricolleghi un numero.",
              url: "/admin/impostazioni/whatsapp-locale",
              tag: `openwa-stato-${number.id}`,
              entityType: null,
              entityId: null,
            });
          } catch (e) {
            console.error("[openwa-webhook] avviso ban/caduta:", (e as Error)?.message);
          }
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
    let chatId = fromRaw.includes("@") ? fromRaw : (digitsOnly(fromRaw) ? `${digitsOnly(fromRaw)}@c.us` : "");
    // Gruppi (@g.us) e stati (@broadcast) non sono conversazioni con una
    // persona: entrerebbero nell'inbox come thread fantasma e le regole
    // "any" proverebbero a rispondere a un id di gruppo.
    if (/@g\.us$|@broadcast$/i.test(chatId)) {
      return new Response(JSON.stringify({ ok: true, skipped: "gruppo-o-broadcast" }), { headers: jsonH });
    }
    const text: string = msg.body ?? msg.text ?? msg.caption ?? "";
    const notifyName: string | null = msg.notifyName ?? msg.notify_name ?? msg.pushName ?? null;
    const providerMsgId: string | null = msg.id ?? msg.messageId ?? msg.message_id ?? null;

    // ── LID → numero ──────────────────────────────────────────────────────────
    // WhatsApp consegna i messaggi in arrivo identificando il mittente con un
    // LID (194360188621035@lid) invece che col numero. Se lo salvassimo cosi',
    // la risposta di una persona finirebbe in un thread diverso da quello in cui
    // le abbiamo scritto noi: nell'inbox si vedrebbero due conversazioni
    // scollegate. Qui il LID viene tradotto nel numero vero quando possibile.
    const lidOriginale = isLid(chatId) ? chatId.toLowerCase() : lidDaMessageId(providerMsgId);
    if (isLid(chatId)) {
      const dalPayload = numeroDalPayload(msg);
      if (dalPayload) {
        chatId = `${dalPayload}@c.us`;
        await registraLid(admin, lidOriginale!, `+${dalPayload}`, chatId, "payload");
      } else {
        const noto = await risolviLid(admin, chatId);
        if (noto) {
          chatId = noto.chatId;
        } else {
          // Non risolvibile: teniamo il LID (serve comunque per rispondere) ma
          // lo segnaliamo, cosi' si capisce perche' il thread e' senza numero.
          console.warn("[openwa-webhook] LID non risolto:", chatId, "campi:", Object.keys(msg ?? {}).join(","));
        }
      }
    }

    // Le cifre di un LID non sono un numero di telefono: salvarle come tale
    // faceva partire le risposte verso "+194360…@c.us", che non esiste.
    const phoneDigits = isLid(chatId) ? "" : digitsOnly(chatId);
    // Media: presenza rilevata subito (per scartare gli eventi vuoti), upload
    // DOPO il dedup — ogni retry del gateway ricaricava il file.
    const haMedia = !!(msg.media?.data ?? msg.mediaData ?? msg.mediaUrl ?? msg.media_url ?? (typeof msg.data === "string" ? msg.data : null));

    if (!chatId) {
      return new Response(JSON.stringify({ ok: true, skipped: "no-chat-id" }), { headers: jsonH });
    }

    // Alla connessione della sessione OpenWA emette un evento per ogni chat gia'
    // presente sul telefono: nessun testo, nessun media. Non sono messaggi —
    // se entrassero, l'inbox si riempirebbe di conversazioni fantasma con i
    // contatti privati del titolare del numero.
    if (!text && !haMedia) {
      return new Response(JSON.stringify({ ok: true, skipped: "evento-vuoto" }), { headers: jsonH });
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

    const mediaUrl: string | null = await uploadInboundMedia(admin, number?.id ?? null, providerMsgId, msg);

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

    const { error: insErr } = await admin.from("openwa_messages").insert({
      number_id: number?.id ?? null,
      contact_id: contactId,
      wa_chat_id: chatId,
      wa_lid: lidOriginale,
      contact_phone: phoneDigits ? `+${phoneDigits}` : null,
      contact_name: contactName,
      direction: "inbound",
      body: text || null,
      media_url: mediaUrl,
      status: "delivered",
      provider_msg_id: providerMsgId,
    });
    if (insErr) {
      // 23505 = arrivato due volte in parallelo: gia' salvato, non e' un errore.
      if ((insErr as { code?: string }).code === "23505") {
        return new Response(JSON.stringify({ ok: true, skipped: "duplicate" }), { headers: jsonH });
      }
      // Qualsiasi altro errore: 500, cosi' il gateway RITENTA. Rispondere 200 a
      // un insert fallito significava perdere il messaggio in silenzio.
      console.error("[openwa-webhook] insert fallito:", insErr);
      return new Response(JSON.stringify({ error: "insert failed" }), { status: 500, headers: jsonH });
    }

    // Solo il "visto": lo STATO lo decide session.status. Un inbound in ritardo
    // riportava a "connected" un numero bannato o caduto.
    if (number) {
      await admin.from("openwa_numbers")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", number.id);
    }

    // Una conversazione chiusa che riceve un messaggio TORNA APERTA. Senza
    // questo i filtri mentono: la chat resta fra le "chiuse" mentre la persona
    // sta scrivendo, e chi guarda solo le aperte non la vede piu'.
    try {
      await admin.from("openwa_conversazioni")
        .update({ stato: "aperta", chiusa_at: null, chiusa_da: null, updated_at: new Date().toISOString() })
        .eq("wa_chat_id", chatId)
        .eq("stato", "chiusa");
    } catch (e) {
      console.error("[openwa-webhook] riapertura conversazione:", (e as Error)?.message);
    }

    // Opt-out automatico: se il contatto risponde STOP/CANCELLA/… lo rispettiamo
    // (compliance + anti-ban: non ricontattare chi ha chiesto di smettere).
    let didOptOut = false;
    if (text && (contactId || phoneDigits.length >= 9)) {
      const normUp = text.trim().toUpperCase().replace(/[.!?,;:]/g, "");
      const OPTOUT = ["STOP", "CANCELLA", "CANCELLAMI", "CANCELLARE", "RIMUOVI", "RIMUOVIMI", "UNSUBSCRIBE", "ANNULLA", "BASTA"];
      if (OPTOUT.includes(normUp) || normUp.startsWith("STOP ")) {
        // TUTTE le schede con quel numero, non solo quella agganciata: con i
        // doppioni in archivio lo STOP finiva su una scheda e la campagna
        // ricontattava l'altra. E vale anche senza match univoco.
        const patchOptOut = { optout_whatsapp: true, optout_at: new Date().toISOString(), optout_reason: "STOP via WhatsApp Locale" };
        if (phoneDigits.length >= 9) {
          await admin.from("marketing_contacts").update(patchOptOut)
            .eq("company_id", PLATFORM_COMPANY_ID).ilike("phone", `%${phoneDigits.slice(-9)}%`);
        } else if (contactId) {
          await admin.from("marketing_contacts").update(patchOptOut).eq("id", contactId);
        }
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
    // Per TELEFONO quando c'e': con i doppioni in archivio il contatto della
    // campagna puo' essere la scheda gemella (contactId nullo o diverso) e la
    // sequenza continuava a scrivere a chi aveva gia' risposto.
    if (contactId || phoneDigits.length >= 9) {
      try {
        if (phoneDigits.length >= 9) await admin.rpc("openwa_campagna_segna_risposta", { p_phone: phoneDigits });
        else await admin.rpc("openwa_campagna_segna_risposta", { p_contact_id: contactId });
      } catch (e) {
        console.error("[openwa-webhook] segna risposta campagne:", (e as Error)?.message);
      }
    }

    // ── Classificazione automatica + trigger opportunità ──────────────────
    // Appena un contatto risponde a una campagna, classifica con l'AI (stessa
    // funzione del bottone manuale) e, su "appuntamento", crea l'opportunità.
    // Un contatto può essere iscritto a più campagne insieme: si classificano
    // tutti i destinatari appena diventati "risposto" senza esito.
    if (contactId) {
      try {
        const { data: daClassificare } = await admin
          .from("openwa_campagna_destinatari")
          .select("id, contact_id, primo_inviato_at")
          .eq("contact_id", contactId)
          .eq("stato", "risposto")
          .is("esito", null);
        for (const d of (daClassificare ?? []) as Array<{ id: string; contact_id: string; primo_inviato_at: string | null }>) {
          const esito = await classificaUnaRisposta(admin, d);
          if (shouldCreateOpportunity("whatsapp", esito)) {
            await triggerOpportunityFromSignal(admin, {
              channel: "whatsapp",
              contactId,
              sourceRefTable: "openwa_campagna_destinatari",
              sourceRefId: d.id,
              snippet: text || null,
            });
          }
        }
      } catch (e) {
        console.error("[openwa-webhook] classificazione automatica:", (e as Error)?.message);
      }
    }

    // Avviso a chi presidia: una risposta a freddo vale finche' e' calda.
    // Dal 16/09/2026 arriva anche su Gmail, col messaggio intero e il numero
    // che l'ha ricevuto. Uno STOP non fa vibrare il telefono (non c'e' niente
    // da presidiare), ma il titolare vuole sapere anche quello.
    try {
      const chi = contactName || (phoneDigits ? `+${phoneDigits}` : "un contatto");
      const testoRicevuto = text || (mediaUrl ? "(ha mandato un allegato: aprilo dal pannello)" : "(messaggio senza testo)");
      await avvisaSuperAdmin(admin, {
        tipo: didOptOut ? "whatsapp_optout" : "whatsapp_risposta",
        titolo: didOptOut
          ? `WhatsApp: ${chi} ha chiesto di non essere più contattato`
          : `Risposta WhatsApp da ${chi}`,
        testo: testoRicevuto.slice(0, 160),
        url: "/admin/marketing/whatsapp-locale",
        // Stesso tag per chat: se scrive tre volte non vibra tre volte.
        tag: `openwa-${chatId}`,
        entityType: contactId ? "marketing_contact" : null,
        entityId: contactId,
        push: !didOptOut,
        email: {
          testo: testoRicevuto,
          righe: [
            { etichetta: "Da", valore: [contactName, phoneDigits ? `+${phoneDigits}` : ""].filter(Boolean).join(" · ") },
            { etichetta: "Numero che l'ha ricevuto", valore: number ? [number.display_name, number.numero].filter(Boolean).join(" · ") : "" },
            { etichetta: "Esito", valore: didOptOut ? "opt-out registrato: non riceverà più messaggi" : "" },
          ],
        },
      });
    } catch (e) {
      console.error("[openwa-webhook] avviso staff:", (e as Error)?.message);
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
