import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { token, password } = await req.json();
    if (!token) throw new Error("Token mancante");

    // 1. Validate invite token
    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from("admin_invites")
      .select("*")
      .eq("token", token)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (inviteErr || !invite) {
      return new Response(
        JSON.stringify({ error: "Invito non valido o scaduto" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // 2. Check if user already exists using getUserByEmail (efficient, no listUsers)
    let userId: string;
    let hadExistingAccount = false;

    const { data: existingUserData } = await supabaseAdmin.auth.admin.getUserByEmail(invite.email);

    if (existingUserData?.user) {
      // User already exists — just assign the role
      userId = existingUserData.user.id;
      hadExistingAccount = true;
    } else {
      // Create new user
      if (!password || password.length < 8) {
        return new Response(
          JSON.stringify({ error: "Password obbligatoria (minimo 8 caratteri)" }),
          { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      const { data: newUser, error: signUpErr } = await supabaseAdmin.auth.admin.createUser({
        email: invite.email,
        password,
        email_confirm: true,
      });
      if (signUpErr || !newUser?.user) throw new Error(signUpErr?.message ?? "Errore creazione utente");
      userId = newUser.user.id;

      // Create profile with email so the admin shows correctly in the list
      await supabaseAdmin.from("profiles").upsert({
        id: userId,
        email: invite.email,
        first_name: "",
        last_name: "",
      }, { onConflict: "id" });
    }

    // 3. Assign super_admin role (upsert to avoid duplicates)
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "super_admin" }, { onConflict: "user_id,role" });

    // 4. Copy permissions from invite
    const perms = invite.permissions && typeof invite.permissions === "object" ? invite.permissions : {};
    await supabaseAdmin
      .from("super_admin_permissions")
      .upsert({
        user_id: userId,
        can_manage_companies: perms.can_manage_companies ?? false,
        can_manage_plans: perms.can_manage_plans ?? false,
        can_manage_tickets: perms.can_manage_tickets ?? false,
        can_manage_referrals: perms.can_manage_referrals ?? false,
        can_manage_admins: perms.can_manage_admins ?? false,
        can_view_platform_stats: perms.can_view_platform_stats ?? true,
        can_manage_marketing: perms.can_manage_marketing ?? false,
      }, { onConflict: "user_id" });

    // 5. Mark invite as accepted
    await supabaseAdmin
      .from("admin_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    // 6. Audit log
    await supabaseAdmin.from("admin_audit_log").insert({
      user_id: userId,
      action: "accept_admin_invite",
      target_type: "admin_invite",
      target_id: invite.id,
      details: { email: invite.email, had_existing_account: hadExistingAccount },
    });

    return new Response(
      JSON.stringify({ ok: true, had_existing_account: hadExistingAccount }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
