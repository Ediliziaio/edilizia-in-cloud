// Referral self-signup endpoint (public, no auth required).
//
// Permette ai partner di registrarsi direttamente dal portale referral
// senza essere invitati da un super admin.
//
// Flow:
//   1. Rate limit check (max 3 signup/IP/24h)
//   2. Email validation + duplicate check
//   3. Crea auth user (email confirm required)
//   4. Crea profile + role "referrer" + referrer record (auto-approve)
//   5. Genera referral_code + tracking link
//   6. Audit log + ritorna success
//
// SECURITY:
//   - Solo password con lunghezza minima 8 chars
//   - Email deve essere valid format + unique
//   - Rate limit per IP (3 tentativi/giorno)
//   - Tutti i tentativi loggati per audit

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

type SignupBody = {
  name: string;
  email: string;
  password: string;
  phone?: string | null;
  partner_type?: string | null;
  accepted_terms?: boolean;
};

const ALLOWED_PARTNER_TYPES = new Set([
  "partner",
  "agency",
  "freelancer",
  "consultant",
  "influencer",
  "company",
]);

function json(req: Request, payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getClientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
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

  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }

  const clientIp = getClientIp(req);
  const userAgent = req.headers.get("user-agent") || "unknown";

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Helper per log attempt (success/fail)
  async function logAttempt(email: string | null, success: boolean, reason?: string) {
    try {
      await admin.rpc("log_referral_signup_attempt", {
        p_ip_address: clientIp,
        p_email: email,
        p_user_agent: userAgent,
        p_success: success,
        p_error_reason: reason || null,
      });
    } catch {
      // Non-blocking: il log fallisce ma non interrompe il flusso
    }
  }

  try {
    // 1. Rate limit check
    const { data: canProceed, error: rateLimitError } = await admin.rpc(
      "check_referral_signup_rate_limit",
      { p_ip_address: clientIp, p_max_attempts: 3, p_window_minutes: 1440 },
    );
    if (rateLimitError) {
      await logAttempt(null, false, "rate_limit_check_failed");
      return json(req, { error: "Service temporarily unavailable" }, 503);
    }
    if (!canProceed) {
      await logAttempt(null, false, "rate_limit_exceeded");
      return json(
        req,
        {
          error: "Troppi tentativi di registrazione da questo IP. Riprova tra qualche ora.",
        },
        429,
      );
    }

    // 2. Parse body
    let body: SignupBody;
    try {
      body = (await req.json()) as SignupBody;
    } catch {
      await logAttempt(null, false, "invalid_json");
      return json(req, { error: "Invalid JSON body" }, 400);
    }

    const name = String(body.name || "").trim();
    const email = normalizeEmail(String(body.email || ""));
    const password = String(body.password || "");
    const phone = body.phone?.trim() || null;
    const partnerType = (body.partner_type?.trim() || "partner").toLowerCase();
    const acceptedTerms = Boolean(body.accepted_terms);

    // 3. Validation
    if (name.length < 2) {
      await logAttempt(email, false, "invalid_name");
      return json(req, { error: "Nome richiesto (minimo 2 caratteri)" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await logAttempt(email, false, "invalid_email");
      return json(req, { error: "Email non valida" }, 400);
    }
    if (password.length < 8) {
      await logAttempt(email, false, "weak_password");
      return json(req, { error: "Password troppo corta (minimo 8 caratteri)" }, 400);
    }
    if (!ALLOWED_PARTNER_TYPES.has(partnerType)) {
      await logAttempt(email, false, "invalid_partner_type");
      return json(req, { error: "Tipo partner non valido" }, 400);
    }
    if (!acceptedTerms) {
      await logAttempt(email, false, "terms_not_accepted");
      return json(req, { error: "Devi accettare i termini per registrarti" }, 400);
    }
    if (phone && !/^[+\d\s\-().]{6,32}$/.test(phone)) {
      await logAttempt(email, false, "invalid_phone");
      return json(req, { error: "Numero di telefono non valido" }, 400);
    }

    // 4. Duplicate check su referrers
    const { data: existingReferrer } = await admin
      .from("referrers")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existingReferrer) {
      await logAttempt(email, false, "referrer_already_exists");
      return json(
        req,
        { error: "Un partner referral con questa email esiste già. Prova ad accedere." },
        409,
      );
    }

    // 5. Crea auth user
    // Usiamo admin.createUser invece di auth.signUp per avere controllo completo
    // sui metadati e poter forzare email_confirm: false (l'utente deve confermare).
    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false, // L'utente deve confermare via email
      user_metadata: {
        role: "referrer",
        full_name: name,
        partner_type: partnerType,
        signup_source: "referral_portal_self_signup",
      },
    });

    if (createUserError || !createdUser.user?.id) {
      const reason = createUserError?.message || "create_user_failed";
      await logAttempt(email, false, reason);
      // Gestiamo il caso "user already exists" con un messaggio chiaro
      const friendlyMessage = /already (registered|exists)/i.test(reason)
        ? "Un account con questa email esiste già. Prova ad accedere o recupera la password."
        : "Impossibile creare l'account. Riprova tra qualche minuto.";
      return json(req, { error: friendlyMessage }, 409);
    }

    const userId = createdUser.user.id;

    // 6. Crea profile
    const [firstName, ...lastNameParts] = name.split(/\s+/);
    await admin.from("profiles").upsert(
      {
        id: userId,
        email,
        first_name: firstName || name,
        last_name: lastNameParts.join(" ") || null,
        company_id: null,
      },
      { onConflict: "id" },
    );

    // 7. Assegna ruolo referrer
    await admin
      .from("user_roles")
      .insert({ user_id: userId, role: "referrer" });

    // 8. Genera referral_code univoco
    const { data: referralCode, error: codeError } = await admin.rpc(
      "generate_referral_code_secure",
    );
    if (codeError || !referralCode) {
      // Cleanup: se fallisce il referral code, cancelliamo l'auth user
      await admin.auth.admin.deleteUser(userId);
      await logAttempt(email, false, "referral_code_generation_failed");
      return json(req, { error: "Errore generazione codice referral. Riprova." }, 500);
    }

    // 9. Crea record referrer (auto-approved con is_active = true)
    const { data: referrer, error: referrerError } = await admin
      .from("referrers")
      .insert({
        name,
        email,
        phone,
        referral_code: referralCode,
        commission_type: "percentage",
        commission_value: 10, // Legacy: il motore paga in base al tier, non a questo campo
        partner_type: partnerType,
        payout_method: "bank_transfer",
        is_active: true, // Auto-approve
        notes: `Self-signup da IP ${clientIp} il ${new Date().toISOString()}`,
        user_id: userId,
        created_by: null, // null perché self-signup
        // false: il contratto va firmato nel portale (PartnerOnboardingModal).
        // Con true il modal non compariva mai e il flag risultava "accettato"
        // senza alcuna firma registrata — il payout restava comunque bloccato
        // dal gate compliance, ma senza percorso guidato per sbloccarlo.
        has_accepted_terms: false,
      })
      .select("*")
      .single();

    if (referrerError) {
      // Cleanup parziale
      await admin.auth.admin.deleteUser(userId);
      await logAttempt(email, false, referrerError.message);
      return json(req, { error: "Errore creazione partner. Riprova." }, 500);
    }

    // 10. Genera tracking link
    const { data: referralLink } = await admin.rpc("ensure_referral_link", {
      p_referrer_id: referrer.id,
      p_base_url: getReferralPortalUrl("/referral-login"),
    });

    // 11. Log evento registrazione
    await admin.rpc("log_referral_event", {
      p_event_type: "register",
      p_referrer_id: referrer.id,
      p_referral_code: referralCode,
      p_user_id: userId,
      p_event_payload: {
        source: "self_signup",
        partner_type: partnerType,
        account_generated: true,
        ip_address: clientIp,
      },
      p_ip_address: clientIp,
      p_user_agent: userAgent,
    });

    // 12. Log success
    await logAttempt(email, true);

    return json(req, {
      success: true,
      message:
        "Registrazione completata! Controlla la tua email per confermare l'account, poi accedi al portale.",
      requires_email_confirmation: true,
      referrer: {
        id: referrer.id,
        name: referrer.name,
        email: referrer.email,
        referral_code: referralCode,
        referral_link: referralLink,
      },
    });
  } catch (error) {
    const msg = (error as Error).message || "internal_error";
    await logAttempt(null, false, msg);
    return json(req, { error: "Errore interno. Riprova tra qualche minuto." }, 500);
  }
});
