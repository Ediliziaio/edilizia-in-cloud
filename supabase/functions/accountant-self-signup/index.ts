// Accountant self-signup endpoint (public, no auth required).
//
// Permette ai commercialisti / studi contabili di registrarsi
// direttamente dal portale commercialista senza essere invitati
// da un super admin.
//
// Flow:
//   1. Rate limit check (max 3 signup/IP/24h)
//   2. Email validation + duplicate check su firms
//   3. Crea auth user (email confirm required)
//   4. Crea profile + accountant_firm + firm_member (role=owner)
//   5. Assegna ruolo 'accountant' in user_roles
//   6. Audit log + ritorna success
//
// SECURITY:
//   - Password min 8 chars
//   - Email valid format + unique
//   - Rate limit per IP (3 tentativi/giorno)
//   - Tutti i tentativi loggati

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

type SignupBody = {
  // Dati personali
  name: string;
  email: string;
  password: string;
  phone?: string | null;
  // Dati studio
  firm_name: string;
  firm_vat_number?: string | null;
  firm_fiscal_code?: string | null;
  firm_email?: string | null;
  accepted_terms?: boolean;
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

function getClientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function getAccountantPortalUrl(path: string) {
  const baseUrl =
    Deno.env.get("PUBLIC_ACCOUNTANT_URL") ||
    Deno.env.get("ACCOUNTANT_APP_URL") ||
    "https://commercialista.ediliziaincloud.com";
  const url = new URL(baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`);
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString();
}

// Validazione P.IVA italiana (11 cifre con check digit Luhn-like)
function isValidItalianVat(vat: string): boolean {
  if (!/^\d{11}$/.test(vat)) return false;
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    let digit = parseInt(vat[i], 10);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
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

  async function logAttempt(email: string | null, success: boolean, reason?: string) {
    try {
      await admin.rpc("log_accountant_signup_attempt", {
        p_ip_address: clientIp,
        p_email: email,
        p_user_agent: userAgent,
        p_success: success,
        p_error_reason: reason || null,
      });
    } catch {
      // Non-blocking
    }
  }

  try {
    // 1. Rate limit check
    const { data: canProceed, error: rateLimitError } = await admin.rpc(
      "check_accountant_signup_rate_limit",
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
    const firmName = String(body.firm_name || "").trim();
    const firmVatNumber = body.firm_vat_number?.trim() || null;
    const firmFiscalCode = body.firm_fiscal_code?.trim() || null;
    const firmEmail = body.firm_email?.trim().toLowerCase() || email;
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
    if (firmName.length < 2) {
      await logAttempt(email, false, "invalid_firm_name");
      return json(req, { error: "Nome studio richiesto (minimo 2 caratteri)" }, 400);
    }
    if (firmVatNumber && !isValidItalianVat(firmVatNumber)) {
      await logAttempt(email, false, "invalid_vat_number");
      return json(req, { error: "Partita IVA non valida" }, 400);
    }
    if (firmFiscalCode && !/^[A-Z0-9]{11,16}$/i.test(firmFiscalCode)) {
      await logAttempt(email, false, "invalid_fiscal_code");
      return json(req, { error: "Codice fiscale non valido" }, 400);
    }
    if (!acceptedTerms) {
      await logAttempt(email, false, "terms_not_accepted");
      return json(req, { error: "Devi accettare i termini per registrarti" }, 400);
    }
    if (phone && !/^[+\d\s\-().]{6,32}$/.test(phone)) {
      await logAttempt(email, false, "invalid_phone");
      return json(req, { error: "Numero di telefono non valido" }, 400);
    }

    // 4. Duplicate check: stesso VAT già registrato?
    if (firmVatNumber) {
      const { data: existingFirm } = await admin
        .from("accountant_firms")
        .select("id")
        .eq("vat_number", firmVatNumber)
        .maybeSingle();
      if (existingFirm) {
        await logAttempt(email, false, "firm_vat_already_exists");
        return json(
          req,
          { error: "Uno studio con questa P.IVA esiste già. Contatta il titolare per essere invitato." },
          409,
        );
      }
    }

    // 5. Crea auth user
    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false, // L'utente deve confermare via email
      user_metadata: {
        role: "accountant",
        full_name: name,
        firm_name: firmName,
        signup_source: "accountant_portal_self_signup",
      },
    });

    if (createUserError || !createdUser.user?.id) {
      const reason = createUserError?.message || "create_user_failed";
      await logAttempt(email, false, reason);
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

    // 7. Crea accountant_firm
    const { data: firm, error: firmError } = await admin
      .from("accountant_firms")
      .insert({
        name: firmName,
        vat_number: firmVatNumber,
        fiscal_code: firmFiscalCode,
        email: firmEmail,
        phone,
        owner_user_id: userId,
        status: "active", // Auto-approve
        contract_status: "pending", // Contratto da firmare in seguito
        dpa_status: "pending",
      })
      .select("*")
      .single();

    if (firmError || !firm) {
      // Cleanup: rollback dell'auth user
      await admin.auth.admin.deleteUser(userId);
      await logAttempt(email, false, firmError?.message || "firm_create_failed");
      return json(req, { error: "Errore creazione studio. Riprova." }, 500);
    }

    // 8. Aggiungi user come owner dello studio
    const { error: memberError } = await admin
      .from("accountant_firm_members")
      .insert({
        firm_id: firm.id,
        user_id: userId,
        role: "owner",
        status: "active",
        accepted_at: new Date().toISOString(),
      });

    if (memberError) {
      // Cleanup
      await admin.from("accountant_firms").delete().eq("id", firm.id);
      await admin.auth.admin.deleteUser(userId);
      await logAttempt(email, false, memberError.message);
      return json(req, { error: "Errore registrazione owner. Riprova." }, 500);
    }

    // 9. Assegna ruolo 'accountant'
    await admin
      .from("user_roles")
      .insert({ user_id: userId, role: "accountant" });

    // 10. Audit log (best effort)
    try {
      await admin.from("accountant_audit_log").insert({
        firm_id: firm.id,
        actor_user_id: userId,
        action: "firm.self_signup",
        entity_type: "accountant_firm",
        entity_id: firm.id,
      });
    } catch {
      // Non-blocking
    }

    // 11. Log success
    await logAttempt(email, true);

    return json(req, {
      success: true,
      message:
        "Registrazione completata! Controlla la tua email per confermare l'account, poi accedi al portale commercialista.",
      requires_email_confirmation: true,
      portal_url: getAccountantPortalUrl("/commercialista-login"),
      firm: {
        id: firm.id,
        name: firm.name,
        vat_number: firm.vat_number,
        status: firm.status,
        contract_status: firm.contract_status,
      },
    });
  } catch (error) {
    const msg = (error as Error).message || "internal_error";
    await logAttempt(null, false, msg);
    return json(req, { error: "Errore interno. Riprova tra qualche minuto." }, 500);
  }
});
