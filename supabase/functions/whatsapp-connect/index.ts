// MP01 — whatsapp-connect: OAuth Meta + upsert multi-numero.
//
// Flusso:
//  1. Client invia { code, company_id, meta_app_id, purpose?, display_name? }
//  2. Scambio code → access_token (Graph v21)
//  3. Debug token → WABA id
//  4. Lookup phone numbers → phone_number_id primario
//  5. Subscribe app al WABA
//  6. Upsert su ai_whatsapp_numbers per (company_id, purpose)
//  7. Upsert legacy su messaging_whatsapp_config solo se purpose='bot_operativo'
//     (retrocompat con vecchio dashboard messaging).
//
// MP01 note:
// - purpose è obbligatorio → default 'bot_operativo' per retro-compat client.
// - Unicità (company_id, purpose) è garantita dall'indice UNIQUE parziale.
//   Se tentiamo di connettere un secondo bot_operativo lo UPDATE è idempotente.
// - Ogni collegamento rifiutato lascia una riga nei log (logRifiuto): il passo,
//   gli id pubblici e l'errore di Meta, mai token o segreti. Il 15/09/2026 Il
//   Bagno Group ha completato il popup e questa funzione ha risposto 400 senza
//   dire dove: scriveva nei log solo lo scambio del codice.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMetaCredentials } from "../_shared/getMetaCredentials.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { encrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { assertMetaCompanyAdminAccess, getErrorMessage, getErrorStatus } from "../_shared/metaAuth.ts";
import { cancelloAddonWhatsApp } from "../_shared/whatsappAddon.ts";

type Purpose =
  | "bot_operativo"
  | "assistenza"
  | "lead"
  | "marketing"
  | "notifiche";

const ALLOWED_PURPOSES: readonly Purpose[] = [
  "bot_operativo",
  "assistenza",
  "lead",
  "marketing",
  "notifiche",
];

interface ConnectRequest {
  code?: string;
  company_id: string;
  meta_app_id?: string;
  purpose?: Purpose;
  display_name?: string;
  phone_number?: string;
  phone_number_id?: string;
  waba_id?: string;
  access_token?: string;
  nome_account?: string;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // ── Auth utente ───────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const token = authHeader.replace("Bearer ", "");
  let userId: string;
  try {
    const { data: claimsData, error: claimsErr } =
      await supabaseAuth.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      const { data: userData, error: userErr } =
        await supabaseAuth.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      userId = userData.user.id;
    } else {
      userId = claimsData.claims.sub as string;
    }
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = (await req.json()) as ConnectRequest;
    const { code, company_id, meta_app_id } = body;
    const purpose: Purpose = body.purpose ?? "bot_operativo";
    const displayNameOverride = body.display_name ?? null;

    if (!company_id) {
      logRifiuto("richiesta", { motivo: "company_id mancante" });
      return new Response(
        JSON.stringify({ error: "Missing company_id" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    if (!ALLOWED_PURPOSES.includes(purpose)) {
      logRifiuto("richiesta", { company_id, motivo: "purpose non valido", purpose });
      return new Response(
        JSON.stringify({
          error: `Purpose non valido. Ammessi: ${ALLOWED_PURPOSES.join(", ")}`,
        }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    await assertMetaCompanyAdminAccess(supabase, userId, company_id);

    // Add-on WhatsApp Business: controllato anche qui e non solo prima del
    // popup, perché questa funzione accetta anche i dati inseriti a mano.
    const bloccoAddon = await cancelloAddonWhatsApp(supabase, company_id, cors);
    if (bloccoAddon) return bloccoAddon;

    const hasManualToken =
      Boolean(body.access_token?.trim()) &&
      Boolean(body.phone_number_id?.trim()) &&
      Boolean(body.waba_id?.trim());
    if (!code && !hasManualToken) {
      logRifiuto("richiesta", { company_id, motivo: "né codice Meta né dati manuali" });
      return new Response(
        JSON.stringify({
          error: "Serve un codice OAuth Meta oppure i dati manuali: access_token, phone_number_id, waba_id",
        }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
    const ramo = code ? "embedded_signup" : "manuale";

    let accessToken = body.access_token?.trim() ?? "";
    let wabaId: string | null = body.waba_id?.trim() ?? null;
    let phoneNumber: string | null = body.phone_number?.trim() ?? null;
    let phoneNumberId: string | null = body.phone_number_id?.trim() ?? null;
    let businessName: string | null = body.nome_account?.trim() ?? displayNameOverride;
    let webhookVerified = false;
    let accountStatus = "pending";

    if (code) {
      // ── 1. Exchange code → access_token ───────────────────────────────────
      const { metaAppId, metaAppSecret: APP_SECRET } = await getMetaCredentials();
      const appId = meta_app_id || metaAppId;
      if (!appId || !APP_SECRET) {
        logRifiuto("configurazione", { company_id, motivo: "Meta App ID o App Secret non configurati" });
        return new Response(
          JSON.stringify({ error: "Meta App ID o App Secret non configurati" }),
          { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      const tokenParams = new URLSearchParams({
        client_id: appId,
        client_secret: APP_SECRET,
        code,
      });
      const tokenRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?${tokenParams}`);
      const tokenData = await tokenRes.json();

      if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
        logRifiuto("token_exchange", { company_id, http: tokenRes.status, errore: erroreMeta(tokenData.error) });
        return new Response(
          JSON.stringify({
            error: "Token exchange failed",
            details: tokenData.error?.message || "Access token non ricevuto da Meta",
          }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      accessToken = tokenData.access_token;

      // ── 2. Debug token → WABA id ──────────────────────────────────────────
      const debugParams = new URLSearchParams({
        input_token: accessToken,
        access_token: `${appId}|${APP_SECRET}`,
      });
      const debugRes = await fetch(`https://graph.facebook.com/v21.0/debug_token?${debugParams}`);
      const debugData = await debugRes.json();

      if (!debugRes.ok || debugData.error) {
        logRifiuto("debug_token", { company_id, http: debugRes.status, errore: erroreMeta(debugData.error) });
        return new Response(
          JSON.stringify({
            error: "Impossibile verificare il token WhatsApp",
            details: debugData.error?.message || "Risposta non valida da Meta",
          }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      // Tutti gli account WhatsApp che il token può gestire.
      const granularScopes: Array<{ permission?: string; target_ids?: unknown[] }> =
        debugData.data?.granular_scopes ?? [];
      const wabaConcessi: string[] = [];
      for (const scope of granularScopes) {
        if (scope.permission !== "whatsapp_business_management" || !Array.isArray(scope.target_ids)) continue;
        for (const id of scope.target_ids) {
          if (!wabaConcessi.includes(String(id))) wabaConcessi.push(String(id));
        }
      }
      // L'account scelto nel popup arriva anche nelle informazioni di sessione
      // (body.waba_id): se il token lo può gestire vince lui. Prima si prendeva
      // il primo concesso, e con più account WhatsApp nello stesso portafoglio
      // (Il Bagno Group: quello pagato da GoHighLevel e uno nuovo) poteva
      // essere quello sbagliato.
      const wabaSuggerito = body.waba_id?.trim() || null;
      wabaId = wabaSuggerito && wabaConcessi.includes(wabaSuggerito) ? wabaSuggerito : (wabaConcessi[0] ?? null);

      if (!wabaId) {
        const permessi = granularScopes.map((s) => `${s.permission}:${(s.target_ids ?? []).join("|")}`);
        logRifiuto("waba", { company_id, waba_suggerito: wabaSuggerito, permessi });
        return new Response(
          JSON.stringify({ error: "Nessun WhatsApp Business Account condiviso da Meta" }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      // ── 3. Phone numbers ──────────────────────────────────────────────────
      const phonesParams = new URLSearchParams({ access_token: accessToken });
      const phonesUrl = `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?${phonesParams}`;
      const phonesRes = await fetch(phonesUrl);
      const phonesData = await phonesRes.json();

      if (!phonesRes.ok || phonesData.error) {
        logRifiuto("phone_numbers", { company_id, waba_id: wabaId, http: phonesRes.status, errore: erroreMeta(phonesData.error) });
        return new Response(
          JSON.stringify({
            error: "Impossibile leggere i numeri WhatsApp Business",
            details: phonesData.error?.message || "Risposta non valida da Meta",
          }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      // Il numero scelto nel popup (informazioni di sessione) se è in questo
      // account, altrimenti il primo.
      const numeri: Array<{ id?: string; display_phone_number?: string; phone_number?: string; verified_name?: string }> =
        Array.isArray(phonesData.data) ? phonesData.data : [];
      const numeroSuggerito = body.phone_number_id?.trim() || null;
      const phone = numeri.find((n) => String(n.id) === numeroSuggerito) ?? numeri[0];
      if (phone) {
        phoneNumber = phone.display_phone_number || phone.phone_number || null;
        phoneNumberId = phone.id ?? null;
        businessName = phone.verified_name || null;
      } else if (!numeroSuggerito) {
        // Account condiviso senza numeri: succede quando nel popup il numero non
        // viene aggiunto, per esempio perché Meta lo dà «Non idoneo».
        logRifiuto("numeri", { company_id, waba_id: wabaId, numeri_nel_waba: 0 });
        return new Response(
          JSON.stringify({
            error: "Meta ha condiviso l'account WhatsApp Business senza nessun numero: nel popup il numero non è stato aggiunto.",
            details: "Se Meta lo segnalava come «Non idoneo», di solito il numero è ancora in uso sull'app WhatsApp Business o presso un altro fornitore.",
          }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
        );
      } else {
        console.warn(JSON.stringify({ level: "warn", fn: "whatsapp-connect", step: "numeri", msg: "Meta non elenca numeri: uso quello delle informazioni di sessione", company_id, waba_id: wabaId, phone_number_id: numeroSuggerito }));
      }

      // ── 4. Subscribe app al WABA ─────────────────────────────────────────
      const subscribeParams = new URLSearchParams({ access_token: accessToken });
      const subscribeUrl = `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps?${subscribeParams}`;
      const subscribeRes = await fetch(subscribeUrl, {
        method: "POST",
      });
      const subscribeData = await subscribeRes.json().catch(() => ({}));
      if (!subscribeRes.ok || subscribeData.error) {
        logRifiuto("subscribed_apps", { company_id, waba_id: wabaId, http: subscribeRes.status, errore: erroreMeta(subscribeData.error) });
        return new Response(
          JSON.stringify({
            error: "Collegamento webhook WhatsApp non riuscito",
            details: subscribeData.error?.message || "Meta non ha confermato la subscription",
          }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      webhookVerified = true;
      accountStatus = "active";
    } else if (hasManualToken && accessToken && wabaId) {
      // ── Ramo MANUALE: attivazione (prima MANCAVA) ─────────────────────────
      // Bug storico: il ramo manuale non iscriveva l'app al webhook del WABA né
      // marcava il numero come attivo → restava 'pending' per sempre (non
      // visibile nell'Hub, invio rifiutato). Replichiamo la stessa logica del
      // ramo Embedded Signup. Subscribe best-effort: l'invio in USCITA funziona
      // comunque col token; la subscription abilita anche l'INBOUND.
      try {
        const subscribeParams = new URLSearchParams({ access_token: accessToken });
        const subscribeUrl = `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps?${subscribeParams}`;
        const subscribeRes = await fetch(subscribeUrl, { method: "POST" });
        const subscribeData = await subscribeRes.json().catch(() => ({}));
        webhookVerified = subscribeRes.ok && !subscribeData.error;
        if (!webhookVerified) {
          console.warn(
            JSON.stringify({
              level: "warn",
              fn: "whatsapp-connect",
              msg: "manual subscribe_apps non riuscito (inbound disattivo, outbound ok)",
              error: subscribeData.error,
            }),
          );
        }
      } catch (err) {
        webhookVerified = false;
        console.warn(
          JSON.stringify({ level: "warn", fn: "whatsapp-connect", msg: "manual subscribe_apps exception", error: (err as Error)?.message }),
        );
      }
      accountStatus = "active";
    }

    if (!accessToken || !phoneNumberId || !wabaId) {
      const haToken = accessToken.length > 0;
      logRifiuto("dati_mancanti", { company_id, ramo, ha_token: haToken, waba_id: wabaId, phone_number_id: phoneNumberId });
      return new Response(
        JSON.stringify({
          error:
            "Impossibile completare il collegamento WhatsApp. Verifica token, WABA ID e Phone Number ID.",
        }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // ── 4b. Registra il numero sul Cloud API (best-effort, NON-fatale) ──────
    // L'Embedded Signup di solito registra già il numero (verifica OTP), ma
    // alcuni numeri restano "added, not registered" → l'invio fallirebbe con
    // errore "phone number not registered". Chiamiamo POST /{phone-id}/register
    // con un PIN 2FA generato per portarli a "registered". Se il numero è già
    // registrato (idempotente) o ha un 2FA con PIN diverso NON blocchiamo: è
    // comunque collegato + iscritto ai webhook. Salviamo il PIN per eventuali
    // re-registrazioni future.
    let cloudApiPin: string | null = null;
    const reg = await registerCloudApiNumber(phoneNumberId, accessToken);
    if (reg.pin) cloudApiPin = reg.pin;
    console.log(JSON.stringify({
      level: reg.registered ? "info" : "warn",
      fn: "whatsapp-connect",
      step: "register_phone",
      phone_number_id: phoneNumberId,
      registered: reg.registered,
      note: reg.note,
    }));

    // ── 5. Upsert ai_whatsapp_numbers (MP01) ────────────────────────────────
    // Pattern: se esiste riga (company_id, purpose) → UPDATE, altrimenti INSERT.
    // Verifica anche unicità globale phone_number_id: se un altro record usa
    // già questo phone_number_id su un altro purpose → 409.
    const { data: clashingByPhoneId } = await supabase
      .from("ai_whatsapp_numbers")
      .select("id, company_id, purpose")
      .eq("phone_number_id", phoneNumberId)
      .is("deleted_at", null)
      .maybeSingle();

    if (
      clashingByPhoneId &&
      (clashingByPhoneId.company_id !== company_id ||
        clashingByPhoneId.purpose !== purpose)
    ) {
      logRifiuto("numero_gia_collegato", { company_id, purpose, phone_number_id: phoneNumberId, gia_su_azienda: clashingByPhoneId.company_id, gia_su_scopo: clashingByPhoneId.purpose });
      return new Response(
        JSON.stringify({
          error:
            "Questo numero WhatsApp è già collegato a un altro scopo o azienda. " +
            "Disconnettilo prima di riutilizzarlo.",
          phone_number_id: phoneNumberId,
        }),
        { status: 409, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const { data: existingWa } = await supabase
      .from("ai_whatsapp_numbers")
      .select("id")
      .eq("company_id", company_id)
      .eq("purpose", purpose)
      .is("deleted_at", null)
      .maybeSingle();

    const encKey = getEncryptionKey();
    const encryptedAccessToken = await encrypt(accessToken, encKey);

    const waNumberData = {
      company_id,
      purpose,
      display_name:
        displayNameOverride ?? businessName ?? purposeDefaultLabel(purpose),
      nome_account: businessName,
      numero: phoneNumber ?? "",
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      provider: "meta_cloud",
      access_token_encrypted: encryptedAccessToken,
      stato: accountStatus,
      webhook_verified: webhookVerified,
      // Salva il PIN SOLO se l'abbiamo appena impostato: su UPDATE evitiamo di
      // sovrascrivere un PIN già memorizzato con null (numero già registrato).
      ...(cloudApiPin ? { cloud_api_pin: cloudApiPin } : {}),
    };

    // Il risultato del salvataggio si guarda: prima un errore del database
    // faceva rispondere «collegato» con niente di salvato.
    const { error: salvataggioErr } = existingWa
      ? await supabase
        .from("ai_whatsapp_numbers")
        .update(waNumberData)
        .eq("id", existingWa.id)
      : await supabase.from("ai_whatsapp_numbers").insert(waNumberData);

    if (salvataggioErr) {
      logRifiuto("salvataggio", { company_id, purpose, waba_id: wabaId, phone_number_id: phoneNumberId, errore_db: salvataggioErr.message });
      return new Response(
        JSON.stringify({
          error: "Il numero è collegato su Meta ma non è stato salvato nel gestionale",
          details: salvataggioErr.message,
        }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // ── 6. Legacy upsert messaging_whatsapp_config (solo bot_operativo) ─────
    // Manteniamo retro-compat con la vecchia dashboard finché MP4 non la
    // deprecata fisicamente.
    if (purpose === "bot_operativo") {
      const { data: legacyConfig } = await supabase
        .from("messaging_whatsapp_config")
        .select("id")
        .eq("company_id", company_id)
        .maybeSingle();

      const legacyData = {
        company_id,
        phone_number: phoneNumber,
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        business_name: businessName,
        access_token_encrypted: encryptedAccessToken,
        is_connected: true,
        account_status: accountStatus,
        updated_at: new Date().toISOString(),
      };

      const { error: legacyErr } = legacyConfig
        ? await supabase
          .from("messaging_whatsapp_config")
          .update(legacyData)
          .eq("id", legacyConfig.id)
        : await supabase.from("messaging_whatsapp_config").insert(legacyData);
      if (legacyErr) {
        // Retro-compat: non blocca il collegamento, ma resta scritto.
        console.warn(JSON.stringify({ level: "warn", fn: "whatsapp-connect", step: "legacy_config", company_id, errore_db: legacyErr.message }));
      }
    }

    console.log(JSON.stringify({ level: "info", fn: "whatsapp-connect", msg: "collegato", company_id, purpose, ramo, waba_id: wabaId, phone_number_id: phoneNumberId }));

    return new Response(
      JSON.stringify({
        success: true,
        purpose,
        phone_number: phoneNumber,
        phone_number_id: phoneNumberId,
        business_name: businessName,
        waba_id: wabaId,
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        fn: "whatsapp-connect",
        msg: "uncaught",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return new Response(
      JSON.stringify({ error: getErrorMessage(err) }),
      { status: getErrorStatus(err), headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});

// Una riga nei log per ogni collegamento rifiutato: dove si è fermato e perché.
// Solo id pubblici (azienda, account WhatsApp, numero) e l'errore di Meta:
// token, codice OAuth, segreto dell'app e PIN non ci finiscono mai.
function logRifiuto(step: string, info: Record<string, unknown>): void {
  console.error(JSON.stringify({ level: "error", fn: "whatsapp-connect", msg: "collegamento rifiutato", step, ...info }));
}

// L'errore di Graph ridotto ai campi che servono a capirlo.
function erroreMeta(err: unknown): Record<string, unknown> | null {
  if (!err || typeof err !== "object") return null;
  const e = err as Record<string, unknown>;
  return {
    message: e.message ?? null,
    type: e.type ?? null,
    code: e.code ?? null,
    error_subcode: e.error_subcode ?? null,
    error_user_title: e.error_user_title ?? null,
    error_user_msg: e.error_user_msg ?? null,
    fbtrace_id: e.fbtrace_id ?? null,
  };
}

// Registra un numero sul WhatsApp Cloud API (POST /{phone-number-id}/register).
// Best-effort: ritorna SEMPRE senza sollevare eccezioni. `registered` è true se
// la registrazione è andata a buon fine OPPURE il numero risultava già
// registrato (operazione idempotente). In caso di 2FA preesistente con PIN
// diverso, o altri errori, ritorna registered=false + nota: il chiamante NON
// blocca il collegamento (il numero resta comunque connesso e iscritto).
async function registerCloudApiNumber(
  phoneNumberId: string,
  accessToken: string,
): Promise<{ registered: boolean; pin: string | null; note: string }> {
  // PIN 2FA a 6 cifre nel range 100000–999999 (nessuno zero iniziale perso).
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/register`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ messaging_product: "whatsapp", pin }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.success !== false && !data?.error) {
      return { registered: true, pin, note: "registered" };
    }
    const msg: string = data?.error?.message ?? "";
    const sub = data?.error?.error_subcode;
    // Numero già registrato → idempotente, lo consideriamo OK.
    if (/already.*register|già.*registrat/i.test(msg) || sub === 2388006 || sub === 2388004) {
      return { registered: true, pin: null, note: "already_registered" };
    }
    // 2FA preesistente con PIN diverso o altro errore non auto-risolvibile.
    return { registered: false, pin: null, note: msg || `register_failed_${res.status}` };
  } catch (e) {
    return { registered: false, pin: null, note: (e as Error)?.message ?? "exception" };
  }
}

function purposeDefaultLabel(p: Purpose): string {
  switch (p) {
    case "bot_operativo":
      return "Bot Operativo Cantiere";
    case "assistenza":
      return "Assistenza Clienti";
    case "lead":
      return "Lead Generation";
    case "marketing":
      return "Marketing / Broadcast";
    case "notifiche":
      return "Notifiche Transazionali";
  }
}
