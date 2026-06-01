import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

type Body = {
  referrer_id: string;
};

function json(req: Request, payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isSuperAdminEmailAllowed(email: string | null | undefined) {
  const normalizedEmail = normalizeEmail(email || "");
  const configuredAllowlist = Deno.env.get("SUPER_ADMIN_EMAIL_ALLOWLIST") || "flo.andriciuc@gmail.com";
  return configuredAllowlist
    .split(",")
    .map((item) => normalizeEmail(item))
    .filter(Boolean)
    .includes(normalizedEmail);
}

function getReferralPortalUrl(path: string) {
  const baseUrl =
    Deno.env.get("PUBLIC_REFERRAL_URL") ||
    Deno.env.get("REFERRAL_APP_URL") ||
    "https://referral.ediliziaincloud.com";
  const url = new URL(baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`);
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return json(req, { error: "Unauthorized" }, 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData.user?.id) {
      return json(req, { error: "Unauthorized" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerRole } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerData.user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!callerRole || !isSuperAdminEmailAllowed(callerData.user.email)) {
      return json(req, { error: "Forbidden: only super admins can link referral partners" }, 403);
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return json(req, { error: "Invalid JSON body" }, 400);
    }
    const referrerId = String(body.referrer_id || "").trim();
    if (!referrerId) return json(req, { error: "referrer_id is required" }, 400);

    const { data: referrer, error: referrerError } = await admin
      .from("referrers")
      .select("id, name, email, referral_code, user_id, partner_type")
      .eq("id", referrerId)
      .maybeSingle();
    if (referrerError) throw referrerError;
    if (!referrer) return json(req, { error: "Referrer not found" }, 404);

    // Idempotente: già collegato a un account → nessuna azione necessaria.
    if (referrer.user_id) {
      return json(req, { success: true, already_linked: true, user_id: referrer.user_id });
    }

    const email = normalizeEmail(String(referrer.email || ""));
    const name = String(referrer.name || "").trim();
    const partnerType = referrer.partner_type?.trim() || "partner";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(req, { error: "Referrer email is not valid" }, 400);
    }

    let userId: string | null = null;
    let invited = false;
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile?.id) {
      userId = existingProfile.id;
    } else {
      const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        data: {
          role: "referrer",
          full_name: name,
          partner_type: partnerType,
        },
        redirectTo: getReferralPortalUrl("/referral-login"),
      });

      if (inviteError || !inviteData.user?.id) {
        throw new Error(inviteError?.message || "Unable to invite referral partner");
      }

      userId = inviteData.user.id;
      invited = true;

      const [firstName, ...lastNameParts] = name.split(/\s+/);
      await admin
        .from("profiles")
        .upsert({
          id: userId,
          email,
          first_name: firstName || name,
          last_name: lastNameParts.join(" ") || null,
          company_id: null,
        }, { onConflict: "id" });
    }

    const { data: existingRole } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "referrer")
      .maybeSingle();

    if (!existingRole) {
      const { error: roleError } = await admin
        .from("user_roles")
        .insert({ user_id: userId, role: "referrer" });
      if (roleError) throw roleError;
    }

    const { error: updateError } = await admin
      .from("referrers")
      .update({ user_id: userId })
      .eq("id", referrer.id);
    if (updateError) throw updateError;

    const { data: referralLink } = await admin.rpc("ensure_referral_link", {
      p_referrer_id: referrer.id,
      p_base_url: getReferralPortalUrl("/referral-login"),
    });

    await admin.rpc("log_referral_event", {
      p_event_type: "register",
      p_referrer_id: referrer.id,
      p_referral_code: referrer.referral_code,
      p_user_id: userId,
      p_event_payload: {
        source: "superadmin_partner_relink",
        partner_type: partnerType,
        account_invited: invited,
      },
      p_ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip"),
      p_user_agent: req.headers.get("user-agent"),
    });

    await admin.from("admin_audit_log").insert({
      user_id: callerData.user.id,
      action: "referral_partner_relinked",
      target_type: "referrer",
      target_id: referrer.id,
      ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip"),
      details: {
        email,
        partner_type: partnerType,
        account_invited: invited,
        reused_existing_profile: !invited,
      },
    });

    return json(req, {
      success: true,
      user_id: userId,
      account_invited: invited,
      referral_link: referralLink ?? null,
    });
  } catch (error) {
    return json(req, { error: (error as Error).message || "Internal error" }, 500);
  }
});
