import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";

import { getCorsHeaders } from "../_shared/headers.ts";

interface CreateSalespersonUserRequest {
  salesperson_id: string;
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

    const { data: callerRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (!callerRole || !["company_admin", "super_admin"].includes(callerRole.role)) {
      throw new Error("Permessi insufficienti");
    }

    const { salesperson_id, email, password, phone, permissions }: CreateSalespersonUserRequest = await req.json();

    if (!salesperson_id || !email) {
      throw new Error("ID venditore ed email sono obbligatori");
    }

    const { data: salesperson, error: spError } = await supabaseAdmin
      .from("salespeople")
      .select("*, company:companies(name)")
      .eq("id", salesperson_id)
      .single();

    if (spError || !salesperson) throw new Error("Venditore non trovato");
    if (salesperson.user_id) throw new Error("Il venditore ha già un account utente");

    // ── Utente già esistente? (multi-azienda) ──────────────────────────────
    // La stessa persona può essere admin/staff in un'azienda e venditore in
    // un'altra. Supabase Auth NON permette due utenti con la stessa email:
    // creare un doppione fallirebbe con 400 ("already registered"). Se esiste
    // già un profilo con questa email, COLLEGHIAMO l'utente esistente a questa
    // azienda come venditore (ruoli additivi + permessi + accesso multi-azienda)
    // invece di crearne uno nuovo. Il suo account/azienda primaria resta intatto.
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    const isExistingUser = !!existingProfile?.id;
    let userId: string;
    let finalPassword = "";
    let isManualPassword = false;

    if (isExistingUser) {
      userId = existingProfile!.id as string;
    } else {
      finalPassword = password && password.trim().length > 0
        ? password.trim()
        : crypto.randomUUID().substring(0, 12);
      isManualPassword = !!(password && password.trim().length > 0);

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: finalPassword,
        email_confirm: true,
        user_metadata: { first_name: salesperson.first_name, last_name: salesperson.last_name },
      });
      if (createError || !newUser.user) {
        throw new Error(createError?.message || "Errore nella creazione utente");
      }
      userId = newUser.user.id;

      const { error: profileError } = await supabaseAdmin.from("profiles").insert({
        id: userId,
        email,
        first_name: salesperson.first_name,
        last_name: salesperson.last_name,
        company_id: salesperson.company_id,
        phone: phone || salesperson.phone,
      });
      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw new Error("Errore nella creazione profilo");
      }
    }

    // Rollback solo se abbiamo appena CREATO l'utente: non cancellare mai un
    // utente preesistente (distruggerebbe il suo accesso all'altra azienda).
    const rollback = async () => { if (!isExistingUser) await supabaseAdmin.auth.admin.deleteUser(userId); };

    // Ruoli staff (globali, UNIQUE user_id+role): additivi e idempotenti. Se
    // l'utente è già admin altrove NON viene declassato (l'effective role prende
    // il più alto; il ruolo per-azienda vive in multi_company_access).
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        [{ user_id: userId, role: "salesperson" }, { user_id: userId, role: "company_staff" }],
        { onConflict: "user_id,role", ignoreDuplicates: true },
      );
    if (roleError) { await rollback(); throw new Error("Errore nell'assegnazione ruoli"); }

    const permissionsRecord: Record<string, any> = {
      user_id: userId,
      company_id: salesperson.company_id,
      can_view_dashboard: false, can_view_orders: false, can_edit_orders: false,
      can_view_warehouse: false, can_edit_warehouse: false, can_view_calendar: false,
      can_view_customers: false, can_edit_customers: false, can_view_employees: false,
      can_view_tickets: false, can_edit_tickets: false, can_view_forecast: false,
      can_view_settings: false, can_view_marketing: false, can_edit_marketing: false,
      only_assigned: false,
    };
    if (permissions) {
      for (const [key, value] of Object.entries(permissions)) {
        if (key in permissionsRecord) permissionsRecord[key] = value;
      }
    }
    // upsert su (user_id, company_id): idempotente se la persona viene ri-aggiunta.
    const { error: permError } = await supabaseAdmin
      .from("staff_permissions")
      .upsert(permissionsRecord, { onConflict: "user_id,company_id" });
    if (permError) { await rollback(); throw new Error("Errore nella creazione permessi"); }

    // Accesso multi-azienda: fa comparire questa azienda nel company switcher
    // con ruolo venditore. Indispensabile quando l'azienda NON è quella primaria
    // del profilo (caso utente esistente). Idempotente.
    const { error: mcaError } = await supabaseAdmin
      .from("multi_company_access")
      .upsert(
        { user_id: userId, company_id: salesperson.company_id, access_role: "salesperson", granted_by: caller.id },
        { onConflict: "user_id,company_id", ignoreDuplicates: true },
      );
    if (mcaError) { await rollback(); throw new Error("Errore nell'accesso multi-azienda"); }

    const { error: linkError } = await supabaseAdmin
      .from("salespeople")
      .update({ user_id: userId })
      .eq("id", salesperson_id);
    if (linkError) { await rollback(); throw new Error("Errore nel collegamento venditore"); }

    // Email: se abbiamo CREATO l'utente → credenziali; se abbiamo COLLEGATO un
    // utente esistente → nessuna credenziale nuova (usa quelle che ha già),
    // solo una notifica che ora accede anche a questa azienda.
    try {
      const companyName = (salesperson as any).company?.name || "la piattaforma";
      const html = isExistingUser
        ? `<html><body>
            <p>Ciao ${salesperson.first_name},</p>
            <p>Il tuo account è stato abilitato ad accedere anche a <strong>${companyName}</strong> come venditore.</p>
            <p>Accedi con le <strong>credenziali che usi già</strong> (${email}) e seleziona l'azienda dal menu in alto.</p>
          </body></html>`
        : `<html><body>
            <p>Ciao ${salesperson.first_name},</p>
            <p>È stato creato un account per te su <strong>${companyName}</strong>.</p>
            <p>Ecco le tue credenziali di accesso:</p>
            <ul>
              <li><strong>Email:</strong> ${email}</li>
              ${isManualPassword ? "" : `<li><strong>Password temporanea:</strong> ${finalPassword}</li>`}
            </ul>
            ${isManualPassword ? "<p>La password è stata impostata dall'amministratore.</p>" : "<p>Ti consigliamo di cambiare la password al primo accesso.</p>"}
          </body></html>`;
      await sendEmailUnified({
        companyId:    salesperson.company_id,
        stream:       "transactional",
        to:           [email],
        subject:      isExistingUser ? `Nuovo accesso: ${companyName}` : `Il tuo account su ${companyName}`,
        html,
        templateName: "salesperson_invite",
        skipCredits:  true,
        adminClient:  supabaseAdmin,
        metadata:     { salesperson_id, user_id: userId },
      });
    } catch (emailErr) {
      console.error("Failed to send welcome email:", emailErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        linked_existing: isExistingUser,
        temp_password: isExistingUser || isManualPassword ? null : finalPassword,
        is_manual_password: isManualPassword,
        message: isExistingUser
          ? `${salesperson.first_name} ${salesperson.last_name} ora accede anche a questa azienda (account esistente collegato)`
          : `Account creato per ${salesperson.first_name} ${salesperson.last_name}`,
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
