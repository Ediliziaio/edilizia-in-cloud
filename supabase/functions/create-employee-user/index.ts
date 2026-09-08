import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";

import { getCorsHeaders } from "../_shared/headers.ts";
import { buildStaffPermissionsRecord } from "../_shared/staffPermissionsDefaults.ts";
import { aziendaAccessibile } from "../_shared/auth.ts";
import { messaggioErroreAuth } from "../_shared/authErrorMessage.ts";

interface CreateEmployeeUserRequest {
  employee_id: string;
  email: string;
  password?: string;
  phone?: string;
  permissions?: Record<string, boolean>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Non autorizzato");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) throw new Error("Non autorizzato");

    // Tutti i ruoli del chiamante (.single() andava in errore per chi ne ha
    // più d'uno) + azienda primaria, per l'isolamento multi-tenant sotto.
    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    const callerRoleSet = new Set((callerRoles ?? []).map((r) => r.role));
    const isSuperAdmin = callerRoleSet.has("super_admin");
    if (!isSuperAdmin && !callerRoleSet.has("company_admin")) {
      throw new Error("Permessi insufficienti");
    }

    const { employee_id, email, password, phone, permissions }: CreateEmployeeUserRequest = await req.json();

    if (!employee_id || !email) {
      throw new Error("ID dipendente ed email sono obbligatori");
    }

    const { data: employee, error: empError } = await supabaseAdmin
      .from("employees")
      .select("*, company:companies(name)")
      .eq("id", employee_id)
      .single();

    if (empError || !employee) throw new Error("Dipendente non trovato");
    if (employee.user_id) throw new Error("Il dipendente ha già un account utente");

    // ISOLAMENTO MULTI-TENANT: un company_admin può creare l'accesso dipendente
    // SOLO per un'azienda a cui ha accesso (prima bastava un employee_id altrui).
    // Il confronto era con l'azienda scritta nel profilo: chi era entrato in una
    // seconda azienda dal selettore si vedeva rifiutare la creazione, pur
    // essendone amministratore a tutti gli effetti.
    if (!isSuperAdmin && !(await aziendaAccessibile(supabaseAdmin, caller.id, employee.company_id))) {
      throw new Error("Permessi insufficienti");
    }

    const finalPassword = password && password.trim().length > 0
      ? password.trim()
      : crypto.randomUUID().substring(0, 12);
    const isManualPassword = !!(password && password.trim().length > 0);

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: true,
      user_metadata: { first_name: employee.first_name, last_name: employee.last_name },
    });

    if (createError || !newUser.user) {
      throw new Error(messaggioErroreAuth(createError, "Errore nella creazione utente"));
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: newUser.user.id,
      email,
      first_name: employee.first_name,
      last_name: employee.last_name,
      company_id: employee.company_id,
      phone: phone || employee.phone,
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw new Error("Errore nella creazione profilo");
    }

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUser.user.id, role: "employee" });
    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw new Error("Errore nell'assegnazione ruolo");
    }

    const { error: staffRoleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUser.user.id, role: "company_staff" });
    if (staffRoleError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw new Error("Errore nell'assegnazione ruolo staff");
    }

    // Record COMPLETO (tutte le colonne-permesso): l'insert non dipende più dal
    // follow-up update del client per il granulare (giornale lavori, formazione, ecc.).
    const permissionsRecord = buildStaffPermissionsRecord(newUser.user.id, employee.company_id, permissions);

    const { error: permError } = await supabaseAdmin.from("staff_permissions").insert(permissionsRecord);
    if (permError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw new Error("Errore nella creazione permessi");
    }

    const { error: linkError } = await supabaseAdmin
      .from("employees")
      .update({ user_id: newUser.user.id })
      .eq("id", employee_id);

    if (linkError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw new Error("Errore nel collegamento dipendente");
    }

    // Send welcome email via unified pipeline
    try {
      const companyName = (employee as any).company?.name || "la piattaforma";
      await sendEmailUnified({
        companyId:    employee.company_id,
        stream:       "transactional",
        to:           [email],
        subject:      `Il tuo account su ${companyName}`,
        html: `<html><body>
            <p>Ciao ${employee.first_name},</p>
            <p>È stato creato un account per te su <strong>${companyName}</strong>.</p>
            <p>Ecco le tue credenziali di accesso:</p>
            <ul>
              <li><strong>Email:</strong> ${email}</li>
              ${isManualPassword ? "" : `<li><strong>Password temporanea:</strong> ${finalPassword}</li>`}
            </ul>
            ${isManualPassword ? "<p>La password è stata impostata dall'amministratore.</p>" : "<p>Ti consigliamo di cambiare la password al primo accesso.</p>"}
          </body></html>`,
        templateName: "employee_invite",
        skipCredits:  true,
        adminClient:  supabaseAdmin,
        metadata:     { employee_id, user_id: newUser.user.id },
      });
    } catch (emailErr) {
      console.error("Failed to send welcome email:", emailErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUser.user.id,
        temp_password: isManualPassword ? null : finalPassword,
        is_manual_password: isManualPassword,
        message: `Account creato per ${employee.first_name} ${employee.last_name}`,
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Errore sconosciuto",
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 400 }
    );
  }
});
