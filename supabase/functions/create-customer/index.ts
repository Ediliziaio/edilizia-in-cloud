import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { generateSecurePassword } from "../_shared/securePassword.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Regex per telefono italiano + internazionale: cifre, spazi, +, - e parentesi.
// Min 6 cifre effettive (rimuovendo separatori), max 20 caratteri totali.
const PHONE_ALLOWED_CHARS = /^[0-9+\-\s()\.]+$/;

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
      first_name,
      last_name,
      email,
      phone,
      address,
      company_id,
      fiscal_code,
      site_address,
      notes,
      create_portal_account,       // boolean opt-in, client può forzare OFF
      send_welcome_email,           // boolean, default: true se portal abilitato
    } = body as Record<string, unknown>;

    // --- Input Validation ---
    if (!first_name || !last_name || !email || !company_id) {
      return errorResponse("Missing required fields");
    }

    const trimmedFirstName = String(first_name).trim().slice(0, 100);
    const trimmedLastName = String(last_name).trim().slice(0, 100);
    const trimmedEmail = String(email).trim().toLowerCase().slice(0, 255);

    if (!trimmedFirstName || !trimmedLastName) {
      return errorResponse("Nome e cognome non possono essere vuoti");
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return errorResponse("Indirizzo email non valido");
    }

    // Validazione phone (non obbligatorio, ma se presente deve essere formalmente valido)
    let trimmedPhone: string | null = null;
    if (phone !== null && phone !== undefined && String(phone).trim() !== "") {
      const rawPhone = String(phone).trim().slice(0, 30);
      if (!PHONE_ALLOWED_CHARS.test(rawPhone)) {
        return errorResponse("Il numero di telefono contiene caratteri non validi");
      }
      const digits = rawPhone.replace(/\D/g, "");
      if (digits.length < 6 || digits.length > 15) {
        return errorResponse("Il numero di telefono deve contenere tra 6 e 15 cifre");
      }
      trimmedPhone = rawPhone;
    }

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
      user_metadata: { first_name: trimmedFirstName, last_name: trimmedLastName },
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
      first_name: trimmedFirstName,
      last_name: trimmedLastName,
      email: trimmedEmail,
      phone: trimmedPhone,
      address: (address as string)?.trim() || null,
      company_id: company_id as string,
      fiscal_code: (fiscal_code as string)?.trim() || null,
      site_address: (site_address as string)?.trim() || null,
      notes: (notes as string)?.trim() || null,
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
              <p>Ciao ${trimmedFirstName},</p>
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
        first_name: trimmedFirstName,
        last_name: trimmedLastName,
        email: trimmedEmail,
        phone: trimmedPhone,
        address: (address as string)?.trim() || null,
        portal_disabled: !shouldCreatePortal,
      },
      // Password restituita solo se l'account portale è attivo e richiesto.
      // Per account "solo anagrafica" non esponiamo mai la password random.
      password: shouldCreatePortal ? password : null,
      portal_account_created: shouldCreatePortal,
      welcome_email_sent: shouldSendWelcomeEmail,
    });
  } catch (error) {
    // requireAuth/requireRole throw Response objects
    if (error instanceof Response) return error;

    console.error("Unexpected error:", error);
    return errorResponse("Internal server error", 500);
  }
});
