import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateSecurePassword } from "../_shared/securePassword.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { loadProviderSettings, sendViaProvider } from "../_shared/emailProvider.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";

type ValidRoleType = "company_admin" | "company_staff" | "salesperson" | "call_center" | "employee" | "subcontractor";

function resolveRoles(roleType: ValidRoleType): string[] {
  switch (roleType) {
    case "company_admin":
      return ["company_admin"];
    case "salesperson":
      return ["salesperson", "company_staff"];
    case "call_center":
      return ["call_center", "company_staff"];
    case "employee":
      return ["employee", "company_staff"];
    case "subcontractor":
      return ["subcontractor", "company_staff"];
    case "company_staff":
    default:
      return ["company_staff"];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !callerUser) {
      return errorResponse("Unauthorized", 401);
    }

    const callerId = callerUser.id;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);

    const callerRole = callerRoles?.find(
      (r) => r.role === "company_admin" || r.role === "super_admin"
    ) ?? null;

    if (!callerRole || (callerRole.role !== "company_admin" && callerRole.role !== "super_admin")) {
      return errorResponse("Only company admins can create staff users", 403);
    }

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", callerId)
      .single();

    const { first_name, last_name, email, company_id, role_type, password, phone } = await req.json();

    const targetCompanyId = callerRole.role === "super_admin" && company_id
      ? company_id
      : callerProfile?.company_id;

    if (!targetCompanyId) {
      return errorResponse("Company ID is required");
    }

    if (!first_name || !last_name || !email) {
      return errorResponse("Nome, cognome e email sono obbligatori");
    }

    // Validate and resolve roles
    const validRoleTypes: ValidRoleType[] = ["company_admin", "company_staff", "salesperson", "call_center", "employee", "subcontractor"];
    const effectiveRoleType: ValidRoleType = validRoleTypes.includes(role_type) ? role_type : "company_staff";
    const rolesToAssign = resolveRoles(effectiveRoleType);

    // Secure password generation (use provided password if valid, otherwise generate one)
    const temporaryPassword = (password && password.trim().length >= 8)
      ? password.trim()
      : generateSecurePassword(12);

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
    });

    if (createError) {
      if (createError.message?.toLowerCase().includes("already") || createError.message?.toLowerCase().includes("exists")) {
        return errorResponse("Un utente con questa email esiste già");
      }
      console.error("Error creating user:", createError);
      return errorResponse(createError.message || "Errore durante la creazione dell'utente", 500);
    }

    if (!newUser.user) {
      return errorResponse("Errore durante la creazione dell'utente", 500);
    }

    const userId = newUser.user.id;

    const cleanup = async () => {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
    };

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      first_name,
      last_name,
      email,
      company_id: targetCompanyId,
    });

    if (profileError) {
      console.error("Error creating profile:", profileError);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return errorResponse("Errore durante la creazione del profilo", 500);
    }

    const roleInserts = rolesToAssign.map((role) => ({ user_id: userId, role }));
    const { error: roleError } = await supabaseAdmin.from("user_roles").insert(roleInserts);

    if (roleError) {
      console.error("Error creating user roles:", roleError);
      await cleanup();
      return errorResponse("Errore durante l'assegnazione del ruolo", 500);
    }

    if (rolesToAssign.includes("company_staff")) {
      const { error: permError } = await supabaseAdmin.from("staff_permissions").insert({
        user_id: userId,
        company_id: targetCompanyId,
      });

      if (permError) {
        console.error("Error creating permissions:", permError);
        await cleanup();
        return errorResponse("Errore durante la creazione dei permessi", 500);
      }
    }

    if (effectiveRoleType === "salesperson") {
      const { error: spError } = await supabaseAdmin.from("salespeople").insert({
        company_id: targetCompanyId,
        first_name,
        last_name,
        email,
        user_id: userId,
        is_active: true,
      });

      if (spError) {
        console.error("Error creating salesperson record:", spError);
        await cleanup();
        return errorResponse("Errore durante la creazione del profilo venditore", 500);
      }
    }

    if (effectiveRoleType === "employee" && userId && targetCompanyId) {
      const { error: empError } = await supabaseAdmin.from("employees").insert({
        company_id: targetCompanyId,
        user_id: userId,
        first_name,
        last_name,
        email,
        phone: phone || null,
        role_type: "operaio",
        is_active: true,
      });

      if (empError) {
        console.error("Error creating employee record:", empError);
        await cleanup();
        return errorResponse("Errore durante la creazione del profilo dipendente", 500);
      }
    }

    if (effectiveRoleType === "subcontractor" && userId && targetCompanyId) {
      const { error: subError } = await supabaseAdmin.from("subappaltatori").insert({
        company_id: targetCompanyId,
        ragione_sociale: `${first_name} ${last_name}`,
        responsabile: `${first_name} ${last_name}`,
        user_id: userId,
        user_email: email,
      });

      if (subError) {
        console.error("Error creating subcontractor record:", subError);
        await cleanup();
        return errorResponse("Errore durante la creazione del profilo subappaltatore", 500);
      }
    }

    // Item 9: Send branded welcome email with credentials
    try {
      const branding = await getBrandingForCompany(supabaseAdmin, targetCompanyId);

      const platformName = branding.platformName;
      const logoUrl = branding.logoUrl;
      const primaryColor = branding.primaryColor;

      const loginUrl = `${branding.siteUrl}/login`;

      const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
<tr><td style="background:#0f172a;padding:24px 32px;text-align:center;">
  ${logoUrl ? `<img src="${logoUrl}" alt="${platformName}" style="height:40px;max-width:200px;object-fit:contain;" />` : `<span style="color:#ffffff;font-size:20px;font-weight:700;">${platformName}</span>`}
</td></tr>
<tr><td style="padding:32px;">
  <h2 style="color:#0f172a;font-size:22px;margin:0 0 16px;">Benvenuto in ${platformName}!</h2>
  <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
    Il tuo account è stato creato. Di seguito trovi le credenziali per accedere alla piattaforma.
  </p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:20px;margin-bottom:24px;">
    <tr><td style="padding:8px 0;">
      <span style="color:#64748b;font-size:13px;">Email</span><br>
      <strong style="color:#0f172a;font-size:15px;">${email}</strong>
    </td></tr>
    <tr><td style="padding:8px 0;border-top:1px solid #e2e8f0;">
      <span style="color:#64748b;font-size:13px;">Password temporanea</span><br>
      <strong style="color:#0f172a;font-size:15px;font-family:monospace;">${temporaryPassword}</strong>
    </td></tr>
  </table>
  <p style="color:#ef4444;font-size:13px;margin:0 0 24px;">⚠️ Ti verrà chiesto di cambiare la password al primo accesso.</p>
  <table width="100%"><tr><td style="text-align:center;">
    <a href="${loginUrl}" style="display:inline-block;background:${primaryColor};color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:15px;">
      Accedi alla piattaforma
    </a>
  </td></tr></table>
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #f1f5f9;text-align:center;">
  <p style="color:#94a3b8;font-size:12px;margin:0;">Questo è un messaggio automatico di ${platformName}.</p>
</td></tr>
</table></td></tr></table>
</body></html>`;

      const settings = await loadProviderSettings("transactional");
      if (settings.apiKey) {
        const from = settings.fromDefault || settings.fromEmail;
        await sendViaProvider(settings.provider, settings.apiKey, {
          from,
          to: [email],
          subject: `Benvenuto in ${platformName} — Le tue credenziali di accesso`,
          html: emailHtml,
        }, { domain: settings.domain || undefined });
      }
    } catch (emailErr) {
      // Email failure is non-blocking — user was already created successfully
      console.error("Failed to send welcome email:", emailErr);
    }

    return jsonResponse({
      success: true,
      user_id: userId,
      temporary_password: temporaryPassword,
      role: effectiveRoleType,
    });
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("Unexpected error:", error);
    return errorResponse("Errore interno del server", 500);
  }
});
