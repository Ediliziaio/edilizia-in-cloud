import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { generateSecurePassword } from "../_shared/securePassword.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

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

    const { first_name, last_name, email, phone, address, company_id, fiscal_code, site_address, notes } = await req.json();

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

    // --- Company Scope Check ---
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

    // --- Secure Password Generation ---
    const password = generateSecurePassword(12);

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: trimmedEmail,
      password,
      email_confirm: true,
      user_metadata: { first_name: trimmedFirstName, last_name: trimmedLastName },
    });

    if (authError) {
      const isEmailExists = authError.message?.includes("already been registered") ||
                            (authError as any).code === "email_exists";
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
      phone: phone || null,
      address: address || null,
      company_id,
      fiscal_code: fiscal_code || null,
      site_address: site_address || null,
      notes: notes || null,
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return errorResponse("Failed to create profile", 500);
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

    // Send welcome email via unified pipeline
    try {
      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("name")
        .eq("id", company_id)
        .single();

      await sendEmailUnified({
        companyId:    company_id,
        stream:       "transactional",
        to:           [trimmedEmail],
        subject:      `Benvenuto su ${company?.name || "la piattaforma"}`,
        html: `<html><body>
            <p>Ciao ${trimmedFirstName},</p>
            <p>Il tuo account è stato creato su <strong>${company?.name || "la piattaforma"}</strong>.</p>
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

    return jsonResponse({
      success: true,
      customer: { id: newUserId, first_name: trimmedFirstName, last_name: trimmedLastName, email: trimmedEmail, phone, address },
      password,
    });
  } catch (error) {
    // requireAuth/requireRole throw Response objects
    if (error instanceof Response) return error;

    console.error("Unexpected error:", error);
    return errorResponse("Internal server error", 500);
  }
});
