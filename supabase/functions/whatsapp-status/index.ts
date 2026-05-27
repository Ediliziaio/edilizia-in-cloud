import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from "../_shared/headers.ts";
import { decryptMaybeEncrypted, getEncryptionKey } from "../_shared/encryption.ts";
import { assertMetaCompanyAdminAccess, getErrorMessage, getErrorStatus } from "../_shared/metaAuth.ts";

function mapAccountStatus(reviewStatus: string | undefined): string {
  if (!reviewStatus) return "not_verified";
  switch (reviewStatus.toUpperCase()) {
    case "APPROVED":
      return "verified";
    case "PENDING":
      return "pending";
    default:
      return "not_verified";
  }
}

function mapQualityRating(rating: string | undefined): string {
  if (!rating) return "none";
  switch (rating.toUpperCase()) {
    case "GREEN":
      return "green";
    case "YELLOW":
      return "yellow";
    case "RED":
      return "red";
    default:
      return "none";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verify user auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
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
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      userId = userData.user.id;
    } else {
      userId = claimsData.claims.sub as string;
    }
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // v8.6.74 — Body opzionale: { company_id, wa_number_id? }.
    // Se wa_number_id presente → aggiorna ai_whatsapp_numbers (MP2).
    // Se assente → fallback retro-compat su messaging_whatsapp_config (legacy).
    const { company_id, wa_number_id } = await req.json();

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "Missing company_id" }),
        {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    await assertMetaCompanyAdminAccess(supabase, userId, company_id);

    // Risolvi config: preferisci ai_whatsapp_numbers, fallback su legacy.
    let waba_id: string | null = null;
    let phone_number_id: string | null = null;
    let access_token_encrypted: string | null = null;
    let priorAccountStatus: string | null = null;
    let priorQualityRating: string | null = null;
    let configSource: "ai_whatsapp_numbers" | "messaging_whatsapp_config" = "messaging_whatsapp_config";

    if (wa_number_id) {
      // Path MP2: numero specifico in ai_whatsapp_numbers
      const { data: waNumber, error: waErr } = await supabase
        .from("ai_whatsapp_numbers")
        .select("id, company_id, waba_id, phone_number_id, access_token_encrypted, stato, quality_rating")
        .eq("id", wa_number_id)
        .eq("company_id", company_id)
        .is("deleted_at", null)
        .maybeSingle();

      if (waErr || !waNumber) {
        return new Response(
          JSON.stringify({ error: "wa_number not found" }),
          {
            status: 404,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          }
        );
      }
      waba_id = waNumber.waba_id;
      phone_number_id = waNumber.phone_number_id;
      access_token_encrypted = waNumber.access_token_encrypted;
      priorAccountStatus = waNumber.stato;
      priorQualityRating = waNumber.quality_rating;
      configSource = "ai_whatsapp_numbers";
    } else {
      // Path legacy
      const { data: config, error: configErr } = await supabase
        .from("messaging_whatsapp_config")
        .select("*")
        .eq("company_id", company_id)
        .maybeSingle();

      if (configErr || !config || !config.is_connected) {
        return new Response(
          JSON.stringify({ error: "WhatsApp not connected" }),
          {
            status: 404,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          }
        );
      }
      waba_id = config.waba_id;
      phone_number_id = config.phone_number_id;
      access_token_encrypted = config.access_token_encrypted;
      priorAccountStatus = config.account_status;
      priorQualityRating = config.quality_rating;
    }

    const accessToken = await decryptMaybeEncrypted(
      access_token_encrypted,
      getEncryptionKey(),
    );
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "No access token available" }),
        {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    let accountStatus = priorAccountStatus;
    let qualityRating = priorQualityRating;
    let messagingLimitTier: string | null = null;

    // Fetch WABA account status
    if (waba_id) {
      try {
        const wabaRes = await fetch(
          `https://graph.facebook.com/v21.0/${waba_id}?fields=account_review_status,business_verification_status&access_token=${accessToken}`
        );
        const wabaData = await wabaRes.json();
        if (!wabaData.error) {
          accountStatus = mapAccountStatus(wabaData.account_review_status);
        } else {
          console.error("WABA status error:", wabaData.error);
        }
      } catch (e) {
        console.error("WABA fetch error:", e);
      }
    }

    // Fetch phone number quality and limits
    if (phone_number_id) {
      try {
        const phoneRes = await fetch(
          `https://graph.facebook.com/v21.0/${phone_number_id}?fields=quality_rating,messaging_limit_tier,display_phone_number,verified_name&access_token=${accessToken}`
        );
        const phoneData = await phoneRes.json();
        if (!phoneData.error) {
          qualityRating = mapQualityRating(phoneData.quality_rating);
          messagingLimitTier = phoneData.messaging_limit_tier || null;
        } else {
          console.error("Phone status error:", phoneData.error);
        }
      } catch (e) {
        console.error("Phone fetch error:", e);
      }
    }

    // Update sulla tabella corretta in base alla sorgente
    if (configSource === "ai_whatsapp_numbers" && wa_number_id) {
      const updateData: Record<string, unknown> = {
        quality_rating: qualityRating,
        updated_at: new Date().toISOString(),
      };
      // Aggiorna stato solo se Meta restituisce qualcosa di significativo
      if (accountStatus) updateData.stato = accountStatus;
      if (messagingLimitTier) updateData.messaging_limit_tier = messagingLimitTier;

      const { error: updateErr } = await supabase
        .from("ai_whatsapp_numbers")
        .update(updateData)
        .eq("id", wa_number_id);

      if (updateErr) {
        console.error("ai_whatsapp_numbers update error:", updateErr);
      }
    } else {
      const { error: updateErr } = await supabase
        .from("messaging_whatsapp_config")
        .update({
          account_status: accountStatus,
          quality_rating: qualityRating,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", company_id);

      if (updateErr) {
        console.error("Update error:", updateErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        account_status: accountStatus,
        quality_rating: qualityRating,
        messaging_limit_tier: messagingLimitTier,
        updated_at: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  } catch (err: unknown) {
    console.error("whatsapp-status error:", err);
    return new Response(
      JSON.stringify({ error: getErrorMessage(err) }),
      {
        status: getErrorStatus(err),
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
});
