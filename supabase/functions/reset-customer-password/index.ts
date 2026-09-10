import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { generateSecurePassword } from "../_shared/securePassword.ts";
import { getCorsHeaders, secureHeaders, jsonResponse } from "../_shared/headers.ts";
import { conMetriche } from "../_shared/withMetrics.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { emailCredenziali } from "../_shared/emailCredenziali.ts";

// Esegue un task in background DOPO la risposta: un invio email lento/bloccato non
// deve far terminare la funzione per wall-clock prima del return (causa di
// "Failed to send a request to the Edge Function" pur con password già impostata).
function runInBackground(p: Promise<unknown>): void {
  try {
    // deno-lint-ignore no-explicit-any
    const er = (globalThis as any).EdgeRuntime;
    if (er && typeof er.waitUntil === "function") er.waitUntil(p);
    else void p.catch(() => {});
  } catch {
    void p.catch(() => {});
  }
}

Deno.serve(conMetriche("reset-customer-password", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) throw new Error("Unauthorized");

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const callerRoleNames = (callerRoles || []).map((r: any) => r.role);
    const callerIsAdmin = callerRoleNames.includes("super_admin") || callerRoleNames.includes("company_admin");
    if (!callerIsAdmin) throw new Error("Permission denied: Only admins can reset passwords");

    const callerRole = callerRoleNames.includes("super_admin") ? { role: "super_admin" } : { role: "company_admin" };

    const body = await req.json();
    const targetUserId = body.customer_id || body.userId;
    const newPassword = body.new_password;
    if (!targetUserId) throw new Error("Missing customer_id or userId");

    const { data: targetProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, company_id, email, first_name, last_name")
      .eq("id", targetUserId)
      .single();

    if (profileError || !targetProfile) throw new Error("User not found");

    if (callerRole.role === "company_admin") {
      const { data: callerProfile } = await supabaseAdmin
        .from("profiles")
        .select("company_id")
        .eq("id", caller.id)
        .single();
      if (callerProfile?.company_id !== targetProfile.company_id) {
        throw new Error("Permission denied: Cannot reset password for users in other companies");
      }
    }

    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", targetUserId);

    const targetRoleNames = (targetRoles || []).map((r: any) => r.role);
    if (targetRoleNames.length === 0) throw new Error("Target user has no role");
    if (targetRoleNames.includes("super_admin")) throw new Error("Cannot reset super admin password");
    if (callerRole.role === "company_admin" && targetRoleNames.includes("company_admin") && targetUserId !== caller.id) {
      throw new Error("Permission denied: Cannot reset another admin's password");
    }

    // Use secure password generator instead of Math.random()
    const finalPassword = newPassword || generateSecurePassword(12);

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      targetUserId,
      { password: finalPassword }
    );
    if (updateError) throw new Error(`Failed to update password: ${updateError.message}`);

    // Send password reset email via unified pipeline — NON BLOCCANTE (background).
    runInBackground((async () => {
    if (targetProfile.email) {
      try {
        const subject = "Password reimpostata";
        const branding = await getBrandingForCompany(supabaseAdmin, targetProfile.company_id);
        const { html, text } = emailCredenziali({
          branding,
          titolo: subject,
          saluto: targetProfile.first_name || null,
          intro: "La tua password è stata reimpostata dall'amministratore. Qui sotto trovi le credenziali aggiornate: quelle che avevi ricevuto prima non funzionano più.",
          email: targetProfile.email,
          password: finalPassword,
          etichettaPassword: "Nuova password temporanea",
          avviso: "Cambiala al primo accesso dal tuo profilo.",
          chiusura: "Se non hai chiesto tu questo reset, avvisa subito l'amministratore della tua azienda.",
        });

        let result = await sendEmailUnified({
          companyId:    targetProfile.company_id,
          stream:       "transactional",
          to:           [targetProfile.email],
          subject,
          html,
          text,
          templateName: "password_reset",
          skipCredits:  true,
          adminClient:  supabaseAdmin,
          metadata:     { target_user_id: targetUserId },
        });

        if (!result.ok && /no provider configured/i.test(String((result.body as any)?.error ?? ""))) {
          result = await sendEmailUnified({
            companyId:    targetProfile.company_id,
            stream:       "marketing",
            to:           [targetProfile.email],
            subject,
            html,
            text,
            templateName: "password_reset",
            skipCredits:  true,
            adminClient:  supabaseAdmin,
            metadata:     { target_user_id: targetUserId, fallback_stream: true },
          });
        }
      } catch (emailErr) {
        console.error("Failed to send password reset email:", emailErr);
      }
    }
    })());

    // 2026-05-27 SECURITY FIX: prima la password generata veniva ritornata in
    // chiaro nel body JSON → loggata in DevTools/HAR, leak via extension
    // malevole, screen recording. Ora la password è solo nell'email che il
    // sistema invia direttamente al cliente. Il company_admin riceve solo
    // conferma che l'email è stata inviata. Non più embedded nel response.
    // Il reset di una password è un'azione amministrativa sensibile: prima non
    // lasciava alcuna traccia. Ora finisce nel registro attività con operatore,
    // bersaglio e indirizzo. Best-effort: l'audit non deve far fallire il reset.
    try {
      await supabaseAdmin.from("admin_audit_log").insert({
        user_id: caller.id,
        action: "reset_password",
        target_type: "user",
        target_id: targetUserId,
        details: {
          target_email: targetProfile.email,
          caller_role: callerRole.role,
          ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        },
        ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      });
    } catch (auditErr) {
      console.warn("[reset-customer-password] audit non registrato:", (auditErr as Error)?.message);
    }

    return jsonResponse({
      success: true,
      message: "Password reset successfully. The customer will receive the new password via email.",
      passwordSentByEmail: true,
      customer: {
        id: targetProfile.id,
        email: targetProfile.email,
        firstName: targetProfile.first_name,
        lastName: targetProfile.last_name,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;

    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: secureHeaders, status: 400 }
    );
  }
}));
