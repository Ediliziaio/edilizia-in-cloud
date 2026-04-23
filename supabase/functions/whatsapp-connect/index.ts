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
  code: string;
  company_id: string;
  meta_app_id: string;
  purpose?: Purpose;
  display_name?: string;
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

    if (!code || !company_id || !meta_app_id) {
      return new Response(
        JSON.stringify({
          error: "Missing code, company_id, or meta_app_id",
        }),
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

    // Verifica appartenenza utente → company
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();

    if (!profile || profile.company_id !== company_id) {
      return new Response(
        JSON.stringify({ error: "Not authorized for this company" }),
        {
          status: 403,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }

    // ── 1. Exchange code → access_token ─────────────────────────────────────
    const { metaAppSecret: APP_SECRET } = await getMetaCredentials();
    const tokenUrl =
      `https://graph.facebook.com/v21.0/oauth/access_token` +
      `?client_id=${meta_app_id}&client_secret=${APP_SECRET}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
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
          details: tokenData.error.message,
        }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const accessToken: string = tokenData.access_token;

    // ── 2. Debug token → WABA id ────────────────────────────────────────────
    const debugUrl =
      `https://graph.facebook.com/v21.0/debug_token` +
      `?input_token=${accessToken}&access_token=${meta_app_id}|${APP_SECRET}`;
    const debugRes = await fetch(debugUrl);
    const debugData = await debugRes.json();

    let wabaId: string | null = null;
    const granularScopes = debugData.data?.granular_scopes ?? [];
    for (const scope of granularScopes) {
      if (
        scope.permission === "whatsapp_business_management" &&
        scope.target_ids?.length
      ) {
        wabaId = scope.target_ids[0];
        break;
      }
    }

    // ── 3. Phone numbers ────────────────────────────────────────────────────
    let phoneNumber: string | null = null;
    let phoneNumberId: string | null = null;
    let businessName: string | null = null;

    if (wabaId) {
      const phonesUrl =
        `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers` +
        `?access_token=${accessToken}`;
      const phonesRes = await fetch(phonesUrl);
      const phonesData = await phonesRes.json();

      if (phonesData.data?.length) {
        const phone = phonesData.data[0];
        phoneNumber = phone.display_phone_number || phone.phone_number;
        phoneNumberId = phone.id;
        businessName = phone.verified_name || null;
      }

      // ── 4. Subscribe app al WABA ─────────────────────────────────────────
      const subscribeUrl =
        `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`;
      await fetch(subscribeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken }),
      });
    }

    if (!phoneNumberId) {
      return new Response(
        JSON.stringify({
          error:
            "Impossibile leggere phone_number_id da Meta. " +
            "Verifica che la WABA sia associata all'app.",
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
      access_token_encrypted: accessToken,
      stato: "active",
      webhook_verified: true,
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
        access_token_encrypted: accessToken,
        is_connected: true,
        account_status: "active",
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
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
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
