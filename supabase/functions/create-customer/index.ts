import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { generateSecurePassword } from "../_shared/securePassword.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { sanitizeCustomerInput } from "../_shared/customerDataSanitizer.ts";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    // --- Authentication & Authorization ---
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const callerRole = await requireRole(supabaseAdmin, userId, ["super_admin", "company_admin"], corsH);

    const body = await req.json();
    const {
      company_id,
      create_portal_account,       // boolean opt-in, client può forzare OFF
      send_welcome_email,           // boolean, default: true se portal abilitato
      is_business,                  // boolean
      business_name,
      customer_type,                // 'privato' | 'appaltatore' (modulo Appaltatori)
      city,
      postal_code,
      province,
      country,
      site_city,
      site_postal_code,
      site_province,
    } = body as Record<string, unknown>;

    if (!company_id) {
      return errorResponse("Missing company_id");
    }

    const cleanTxt = (v: unknown, max: number) => {
      if (v === null || v === undefined) return null;
      const s = String(v).replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
      return s || null;
    };

    const isBusiness = Boolean(is_business);
    const businessName = cleanTxt(business_name, 200);
    if (isBusiness && !businessName) {
      return errorResponse("La ragione sociale è obbligatoria per i clienti Azienda");
    }

    // Modulo Appaltatori: il client può specificare customer_type='appaltatore'.
    // L'attivazione UI è gated dal feature flag, ma il server è permissivo
    // (whitelist su valori validi) per evitare rotture in caso di feature flag
    // disabilitato post-creazione. Default 'privato' per retrocompatibilità.
    const rawCustomerType =
      typeof customer_type === "string" ? customer_type.trim().toLowerCase() : null;
    const customerType: "privato" | "appaltatore" =
      rawCustomerType === "appaltatore" ? "appaltatore" : "privato";
    if (customerType === "appaltatore" && !isBusiness) {
      return errorResponse(
        "Un cliente di tipo Appaltatore deve essere un'Azienda (ragione sociale + P.IVA).",
      );
    }

    // --- Sanitizzazione + auto-correzione input ---
    // Il sanitizer corregge i casi più comuni di import errato:
    //  - numero di telefono finito in first_name / last_name
    //  - CF/P.IVA finito in first_name / last_name
    //  - split automatico "NOME COGNOME" quando uno dei due è vuoto
    //  - rimozione caratteri invisibili
    // I fix applicati vengono loggati e ritornati al client (trasparenza).
    const sanitized = sanitizeCustomerInput(body as Record<string, unknown>);

    const trimmedFirstName = sanitized.first_name;
    const trimmedLastName = sanitized.last_name;
    const trimmedEmail = (sanitized.email || "").slice(0, 255);
    const trimmedPhone = sanitized.phone;

    // Validation (post-sanitize)
    if (!trimmedEmail) {
      return errorResponse("Email è obbligatoria");
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return errorResponse("Indirizzo email non valido");
    }
    // Dopo il sanitize, se mancano ancora sia nome che cognome E non è
    // un'azienda → rifiutiamo: nessuna identità ricostruibile.
    if (!isBusiness && !trimmedFirstName && !trimmedLastName) {
      return errorResponse(
        "Nome o cognome sono obbligatori per i clienti persona. Se il documento non contiene un'identità chiara, correggi manualmente prima di importare."
      );
    }
    // Per clienti Azienda: first/last opzionali (referente). Per clienti
    // persona: forziamo placeholder "—" se uno dei due è vuoto.
    const safeFirstName = trimmedFirstName || (isBusiness ? "" : "—");
    const safeLastName = trimmedLastName || (isBusiness ? (businessName ?? "—") : "—");

    // --- Company Scope Check + lettura setting portal ---
    const { data: companyRow } = await supabaseAdmin
      .from("companies")
      .select("id, name, customer_portal_enabled")
      .eq("id", company_id)
      .maybeSingle();

    if (!companyRow) {
      return errorResponse("Azienda non trovata", 404);
    }

    if (callerRole === "company_admin") {
      const { data: callerProfile } = await supabaseAdmin
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .single();

      if (callerProfile?.company_id !== company_id) {
        return errorResponse("Non autorizzato a creare utenti per questa azienda", 403);
      }
    }

    // Determina se creare il portal account:
    // - Se la company ha customer_portal_enabled = false → forza OFF (server-side guard).
    // - Altrimenti rispetta la scelta del client (default true per retro-compat).
    const companyPortalEnabled = companyRow.customer_portal_enabled !== false;
    const clientWantsPortal = create_portal_account !== false; // default true
    const shouldCreatePortal = companyPortalEnabled && clientWantsPortal;
    const shouldSendWelcomeEmail = shouldCreatePortal && send_welcome_email !== false;

    // --- Password generation ---
    // Anche quando il portale è disabilitato creiamo un account auth shadow
    // (profiles.id ha FK a auth.users). La password è random non recuperabile
    // e l'account sarà immediatamente bloccato.
    const password = generateSecurePassword(shouldCreatePortal ? 12 : 32);

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: trimmedEmail,
      password,
      email_confirm: true,
      user_metadata: { first_name: safeFirstName, last_name: safeLastName },
    });

    if (authError) {
      const isEmailExists = authError.message?.includes("already been registered") ||
                            (authError as { code?: string }).code === "email_exists";
      const errorMessage = isEmailExists
        ? "Esiste già un utente con questo indirizzo email. Usa un'email diversa."
        : authError.message;
      return errorResponse(errorMessage);
    }

    const newUserId = authUser.user.id;

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: newUserId,
      first_name: safeFirstName,
      last_name: safeLastName,
      email: trimmedEmail,
      phone: trimmedPhone,
      address: sanitized.address,
      company_id: company_id as string,
      fiscal_code: sanitized.fiscal_code,
      site_address: sanitized.site_address,
      notes: sanitized.notes,
      // Nuovi campi: business + address strutturato
      is_business: isBusiness,
      business_name: businessName,
      customer_type: customerType,
      city: cleanTxt(city, 100),
      postal_code: cleanTxt(postal_code, 10),
      province: cleanTxt(province, 10)?.toUpperCase() ?? null,
      country: cleanTxt(country, 2)?.toUpperCase() ?? "IT",
      site_city: cleanTxt(site_city, 100),
      site_postal_code: cleanTxt(site_postal_code, 10),
      site_province: cleanTxt(site_province, 10)?.toUpperCase() ?? null,
      // Flag anagrafica-only: cliente creato senza accesso al portale
      portal_disabled: !shouldCreatePortal,
      // Se portal disabilitato, blocchiamo subito l'account auth per chiarezza
      is_blocked: !shouldCreatePortal,
    } as never);

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return errorResponse(`Creazione profilo fallita: ${profileError.message}`, 500);
    }

    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: newUserId,
      role: "customer",
    });

    if (roleError) {
      await supabaseAdmin.from("profiles").delete().eq("id", newUserId);
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return errorResponse("Failed to assign role", 500);
    }

    // Send welcome email via unified pipeline — solo se portale attivo e non esplicitamente disabilitato
    if (shouldSendWelcomeEmail) {
      try {
        await sendEmailUnified({
          companyId:    company_id as string,
          stream:       "transactional",
          to:           [trimmedEmail],
          subject:      `Benvenuto su ${companyRow.name || "la piattaforma"}`,
          html: `<html><body>
              <p>Ciao ${isBusiness ? businessName : safeFirstName},</p>
              <p>Il tuo account è stato creato su <strong>${companyRow.name || "la piattaforma"}</strong>.</p>
              <p>Ecco le tue credenziali di accesso:</p>
              <ul>
                <li><strong>Email:</strong> ${trimmedEmail}</li>
                <li><strong>Password:</strong> ${password}</li>
              </ul>
              <p>Ti consigliamo di cambiare la password al primo accesso.</p>
            </body></html>`,
          templateName: "customer_welcome",
          skipCredits:  false,
          adminClient:  supabaseAdmin,
          metadata:     { customer_id: newUserId },
        });
      } catch (emailErr) {
        console.error("Failed to send welcome email:", emailErr);
      }
    }

    return jsonResponse({
      success: true,
      customer: {
        id: newUserId,
        first_name: safeFirstName,
        last_name: safeLastName,
        email: trimmedEmail,
        phone: trimmedPhone,
        address: sanitized.address,
        portal_disabled: !shouldCreatePortal,
      },
      // Password restituita solo se l'account portale è attivo e richiesto.
      // Per account "solo anagrafica" non esponiamo mai la password random.
      password: shouldCreatePortal ? password : null,
      portal_account_created: shouldCreatePortal,
      welcome_email_sent: shouldSendWelcomeEmail,
      // Lista dei fix auto-applicati (trasparenza per debugging + UI)
      fixes_applied: sanitized.fixes_applied,
    });
  } catch (error) {
    // requireAuth/requireRole throw Response objects
    if (error instanceof Response) return error;

    console.error("Unexpected error:", error);
    return errorResponse("Internal server error", 500);
  }
});
