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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMetaCredentials } from "../_shared/getMetaCredentials.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { encrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { assertMetaCompanyAdminAccess, getErrorMessage, getErrorStatus } from "../_shared/metaAuth.ts";

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
      return new Response(
        JSON.stringify({ error: "Missing company_id" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    if (!ALLOWED_PURPOSES.includes(purpose)) {
      return new Response(
        JSON.stringify({
          error: `Purpose non valido. Ammessi: ${ALLOWED_PURPOSES.join(", ")}`,
        }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    await assertMetaCompanyAdminAccess(supabase, userId, company_id);

    const hasManualToken =
      Boolean(body.access_token?.trim()) &&
      Boolean(body.phone_number_id?.trim()) &&
      Boolean(body.waba_id?.trim());
    if (!code && !hasManualToken) {
      return new Response(
        JSON.stringify({
          error: "Serve un codice OAuth Meta oppure i dati manuali: access_token, phone_number_id, waba_id",
        }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

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
        console.error(
          JSON.stringify({
            level: "error",
            fn: "whatsapp-connect",
            msg: "token exchange failed",
            error: tokenData.error,
          }),
        );
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
        return new Response(
          JSON.stringify({
            error: "Impossibile verificare il token WhatsApp",
            details: debugData.error?.message || "Risposta non valida da Meta",
          }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      const granularScopes = debugData.data?.granular_scopes ?? [];
      wabaId = null;
      for (const scope of granularScopes) {
        if (
          scope.permission === "whatsapp_business_management" &&
          scope.target_ids?.length
        ) {
          wabaId = scope.target_ids[0];
          break;
        }
      }

      if (!wabaId) {
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
        return new Response(
          JSON.stringify({
            error: "Impossibile leggere i numeri WhatsApp Business",
            details: phonesData.error?.message || "Risposta non valida da Meta",
          }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      if (phonesData.data?.length) {
        const phone = phonesData.data[0];
        phoneNumber = phone.display_phone_number || phone.phone_number;
        phoneNumberId = phone.id;
        businessName = phone.verified_name || null;
      }

      // ── 4. Subscribe app al WABA ─────────────────────────────────────────
      const subscribeParams = new URLSearchParams({ access_token: accessToken });
      const subscribeUrl = `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps?${subscribeParams}`;
      const subscribeRes = await fetch(subscribeUrl, {
        method: "POST",
      });
      const subscribeData = await subscribeRes.json().catch(() => ({}));
      if (!subscribeRes.ok || subscribeData.error) {
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
    }

    if (!accessToken || !phoneNumberId || !wabaId) {
      return new Response(
        JSON.stringify({
          error:
            "Impossibile completare il collegamento WhatsApp. Verifica token, WABA ID e Phone Number ID.",
        }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

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
    };

    if (existingWa) {
      await supabase
        .from("ai_whatsapp_numbers")
        .update(waNumberData)
        .eq("id", existingWa.id);
    } else {
      await supabase.from("ai_whatsapp_numbers").insert(waNumberData);
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

      if (legacyConfig) {
        await supabase
          .from("messaging_whatsapp_config")
          .update(legacyData)
          .eq("id", legacyConfig.id);
      } else {
        await supabase.from("messaging_whatsapp_config").insert(legacyData);
      }
    }

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
