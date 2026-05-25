import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

type Body = {
  name: string;
  email: string;
  phone?: string | null;
  partner_type?: string | null;
  commission_type: "percentage" | "fixed";
  commission_value: number;
  payout_method?: string | null;
  notes?: string | null;
  is_active?: boolean;
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
      return json(req, { error: "Forbidden: only super admins can create referral partners" }, 403);
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return json(req, { error: "Invalid JSON body" }, 400);
    }
    const name = String(body.name || "").trim();
    const email = normalizeEmail(String(body.email || ""));
    const phone = body.phone?.trim() || null;
    const commissionType = body.commission_type;
    const commissionValue = Number(body.commission_value);
    const partnerType = body.partner_type?.trim() || "partner";
    const payoutMethod = body.payout_method?.trim() || "bank_transfer";
    const notes = body.notes?.trim() || null;
    const isActive = body.is_active !== false;

    if (name.length < 2) return json(req, { error: "Name is required" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(req, { error: "Valid email is required" }, 400);
    if (!["percentage", "fixed"].includes(commissionType)) return json(req, { error: "Invalid commission type" }, 400);
    if (!Number.isFinite(commissionValue) || commissionValue < 0) return json(req, { error: "Invalid commission value" }, 400);
    if (commissionType === "percentage" && commissionValue > 100) {
      return json(req, { error: "Percentage commission cannot exceed 100%" }, 400);
    }

    const { data: duplicateReferrer } = await admin
      .from("referrers")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (duplicateReferrer) return json(req, { error: "A referral partner with this email already exists" }, 409);

    let userId: string | null = null;
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

    const { data: referralCode, error: codeError } = await admin.rpc("generate_referral_code_secure");
    if (codeError || !referralCode) throw new Error(codeError?.message || "Unable to generate referral code");

    const { data: referrer, error: insertError } = await admin
      .from("referrers")
      .insert({
        name,
        email,
        phone,
        referral_code: referralCode,
        commission_type: commissionType,
        commission_value: commissionValue,
        partner_type: partnerType,
        payout_method: payoutMethod,
        is_active: isActive,
        notes,
        user_id: userId,
        created_by: callerData.user.id,
        has_accepted_terms: false,
      })
      .select("*")
      .single();

    if (insertError) throw insertError;

    const { data: referralLink, error: linkError } = await admin.rpc("ensure_referral_link", {
      p_referrer_id: referrer.id,
      p_base_url: getReferralPortalUrl("/referral-login"),
    });
    if (linkError) throw linkError;

    await admin.rpc("log_referral_event", {
      p_event_type: "register",
      p_referrer_id: referrer.id,
      p_referral_code: referralCode,
      p_user_id: userId,
      p_event_payload: {
        source: "superadmin_partner_creation",
        partner_type: partnerType,
        account_generated: true,
      },
      p_ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip"),
      p_user_agent: req.headers.get("user-agent"),
    });

    await admin.from("admin_audit_log").insert({
      user_id: callerData.user.id,
      action: "referral_partner_created",
      target_type: "referrer",
      target_id: referrer.id,
      ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip"),
      details: {
        email,
        partner_type: partnerType,
        commission_type: commissionType,
        commission_value: commissionValue,
        referral_code: referralCode,
      },
    });

    return json(req, {
      success: true,
      referrer: { ...referrer, referral_link: referralLink },
      account_generated: true,
    });
  } catch (error) {
    return json(req, { error: (error as Error).message || "Internal error" }, 500);
  }
});
