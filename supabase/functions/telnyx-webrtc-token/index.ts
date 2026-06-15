// ============================================================================
// telnyx-webrtc-token
// Fase 1 "centralina": rilascia all'operatore loggato un token WebRTC Telnyx
// effimero per il softphone in-app (chiamate in uscita parlate dall'utente).
//
// Riusa la connessione Telnyx già configurata (public.telnyx_settings.connection_id,
// stesso account degli SMS). Per ciascun utente crea UNA telephony credential
// (riusata), poi genera un token a breve scadenza ad ogni richiesta.
//
// I segreti (api key, sip password) NON arrivano mai al browser: solo il token.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";
import { decryptMaybeEncrypted, getEncryptionKey } from "../_shared/encryption.ts";

const TELNYX_API = "https://api.telnyx.com/v2";

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, cors);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // ── Auth utente ──
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return errorResponse("Unauthorized", 401, cors);
    const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anon.auth.getUser(token);
    if (!user) return errorResponse("Unauthorized", 401, cors);

    const { data: profile } = await admin
      .from("profiles").select("company_id").eq("id", user.id).single();
    const companyId = profile?.company_id;
    if (!companyId) return errorResponse("Azienda non trovata", 400, cors);

    // ── Config Telnyx (stesso account SMS) ──
    // L'API key arriva dalla tabella telnyx_settings o, in fallback, dal secret
    // di ambiente TELNYX_API_KEY (lo stesso usato per gli SMS): così la centralina
    // funziona anche se la tabella non è popolata.
    const { data: settings } = await admin
      .from("telnyx_settings")
      .select("api_key_encrypted, connection_id")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const apiKey = settings?.api_key_encrypted
      ? await decryptMaybeEncrypted(settings.api_key_encrypted, getEncryptionKey())
      : (Deno.env.get("TELNYX_API_KEY") ?? "");
    if (!apiKey) {
      return errorResponse(
        "Telnyx non configurato: manca l'API key (popola telnyx_settings oppure imposta il secret TELNYX_API_KEY).",
        400,
        cors,
      );
    }

    // La Credential Connection dedicata al WebRTC: dalla tabella o dal secret
    // TELNYX_WEBRTC_CONNECTION_ID. Senza, le chiamate dal browser non sono attivabili.
    const connectionId = settings?.connection_id || Deno.env.get("TELNYX_WEBRTC_CONNECTION_ID") || "";
    if (!connectionId) {
      return errorResponse(
        "Centralino non ancora attivo: manca la Credential Connection Telnyx per il WebRTC (telnyx_settings.connection_id oppure secret TELNYX_WEBRTC_CONNECTION_ID).",
        400,
        cors,
      );
    }

    const tHeaders = { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" };

    // ── Credential per operatore (crea se assente, riusa altrimenti) ──
    let credentialId: string | null = null;
    const { data: existing } = await admin
      .from("telnyx_webrtc_credentials")
      .select("telnyx_credential_id")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .maybeSingle();

    if (existing?.telnyx_credential_id) {
      credentialId = existing.telnyx_credential_id;
    } else {
      const createRes = await fetch(`${TELNYX_API}/telephony_credentials`, {
        method: "POST",
        headers: tHeaders,
        body: JSON.stringify({
          connection_id: connectionId,
          name: `EiC WebRTC ${user.email ?? user.id}`.slice(0, 80),
        }),
      });
      const createJson = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        console.error("[telnyx-webrtc-token] create credential failed", createRes.status, JSON.stringify(createJson));
        return errorResponse(createJson?.errors?.[0]?.detail || "Errore creazione credential Telnyx", 502, cors);
      }
      credentialId = createJson?.data?.id;
      if (!credentialId) return errorResponse("Telnyx non ha restituito un credential id", 502, cors);
      await admin.from("telnyx_webrtc_credentials").insert({
        user_id: user.id,
        company_id: companyId,
        telnyx_credential_id: credentialId,
        sip_username: createJson?.data?.sip_username ?? null,
      });
    }

    // ── Token effimero (login_token per @telnyx/webrtc) ──
    // Il token endpoint restituisce il JWT come testo grezzo.
    const tokenRes = await fetch(`${TELNYX_API}/telephony_credentials/${credentialId}/token`, {
      method: "POST",
      headers: tHeaders,
    });
    const loginToken = (await tokenRes.text()).trim();
    if (!tokenRes.ok || !loginToken) {
      console.error("[telnyx-webrtc-token] token failed", tokenRes.status, loginToken.slice(0, 200));
      // Se la credential è stata cancellata su Telnyx, la rimuoviamo e si ricrea al prossimo giro.
      if (tokenRes.status === 404) {
        await admin.from("telnyx_webrtc_credentials").delete()
          .eq("user_id", user.id).eq("company_id", companyId);
      }
      return errorResponse("Errore generazione token WebRTC", 502, cors);
    }

    // ── Numeri chiamante disponibili (caller ID) — stesso account ──
    const callerNumbers: string[] = [];
    const { data: smsNums } = await admin
      .from("sms_telnyx_numbers")
      .select("numero_e164, stato")
      .eq("company_id", companyId)
      .eq("stato", "attivo");
    (smsNums ?? []).forEach((n: { numero_e164?: string | null }) => n.numero_e164 && callerNumbers.push(n.numero_e164));
    const { data: vNums } = await admin
      .from("virtual_phone_numbers")
      .select("phone_number, is_active")
      .eq("company_id", companyId)
      .eq("is_active", true);
    (vNums ?? []).forEach((n: { phone_number?: string | null }) => n.phone_number && callerNumbers.push(n.phone_number));

    return jsonResponse({
      login_token: loginToken,
      caller_numbers: [...new Set(callerNumbers)],
    }, 200, cors);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore interno";
    console.error("[telnyx-webrtc-token] error:", message);
    return errorResponse(message, 500, cors);
  }
});
