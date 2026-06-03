import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { renderEmailTemplate } from "../_shared/renderTemplate.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get caller
    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Verify caller is super_admin with can_manage_admins
    const { data: callerRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!callerRole) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { data: perm } = await supabaseAdmin
      .from("super_admin_permissions")
      .select("can_manage_admins")
      .eq("user_id", user.id)
      .maybeSingle();
    // If no permissions record, bootstrap admin has full access
    if (perm && !perm.can_manage_admins) {
      return new Response(JSON.stringify({ error: "Non hai il permesso di gestire gli admin" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { email, permissions } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "Email obbligatoria" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Check if invite already exists
    const { data: existing } = await supabaseAdmin
      .from("admin_invites")
      .select("id")
      .eq("email", email)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "Un invito per questa email è già attivo" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Create invite record
    const token = crypto.randomUUID();
    const { error: insertError } = await supabaseAdmin
      .from("admin_invites")
      .insert({
        email,
        token,
        invited_by: user.id,
        permissions: permissions || {},
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      });
    if (insertError) throw insertError;

    // Build invite URL
    const siteUrl = await getPlatformSetting("site_url", "SITE_URL") || Deno.env.get("SITE_URL") || "";
    const inviteUrl = `${siteUrl}/admin/accept-invite?token=${token}`;

    // Log audit
    await supabaseAdmin.from("admin_audit_log").insert({
      user_id: user.id,
      action: "invite_admin",
      target_type: "admin_invite",
      target_id: null,
      details: { email, invite_url: inviteUrl },
    });

    // Invia l'email d'invito (best-effort: un errore di invio NON annulla l'invito).
    // Bug-fix: prima l'email non partiva, veniva salvato solo il token + l'URL.
    let emailSent = false;
    try {
      const recipientName = String(email).split("@")[0] || "";
      const inviterName =
        (user.user_metadata?.full_name as string | undefined) ||
        user.email ||
        "EdiliziaInCloud";
      const rendered = await renderEmailTemplate({
        templateName: "user_invited",
        companyId: null,
        adminClient: supabaseAdmin,
        props: {
          recipientName,
          invitedByName: inviterName,
          roleLabel: "Amministratore",
          inviteUrl,
          ttlHours: 168,
        },
      });
      await sendEmailUnified({
        companyId: null,
        stream: "transactional",
        to: [email],
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        templateName: "user_invited",
        skipCredits: true,
        adminClient: supabaseAdmin,
      });
      emailSent = true;
    } catch (emailErr) {
      console.error("[invite-admin] invio email invito fallito:", emailErr);
    }

    return new Response(
      JSON.stringify({ ok: true, inviteUrl, emailSent }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
