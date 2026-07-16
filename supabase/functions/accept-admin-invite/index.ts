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
      // SECURITY FIX: se esiste già un account con questa email, non possiamo
      // accettare l'invito solo con il token — chiunque abbia intercettato il
      // link dell'invito avrebbe potuto elevare i privilegi dell'account
      // esistente senza dimostrare di essere il proprietario. Richiediamo che
      // il chiamante sia autenticato con quell'account.
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({
            error: "Esiste già un account con questa email. Accedi prima, poi accetta l'invito.",
            requires_login: true,
          }),
          { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const anonClient = createClient(supabaseUrl, anonKey);
      const { data: { user: callerUser } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
      if (!callerUser || callerUser.id !== existingUserData.user.id) {
        return new Response(
          JSON.stringify({ error: "Non autorizzato: devi essere loggato con l'account destinatario dell'invito." }),
          { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      // User already exists AND auth verified — assign the role
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

    // 5. Mark invite as accepted — con guard atomico su accepted_at IS NULL
    // per evitare che due richieste concorrenti con lo stesso token riescano
    // entrambe (doppio audit log, doppia assegnazione ruolo già idempotente
    // via upsert ma l'audit no).
    const { data: acceptedRows, error: acceptErr } = await supabaseAdmin
      .from("admin_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id)
      .is("accepted_at", null)
      .select("id");
    if (acceptErr || !acceptedRows || acceptedRows.length === 0) {
      return new Response(
        JSON.stringify({ error: "Invito già accettato." }),
        { status: 409, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // 6. Audit log
    await supabaseAdmin.from("admin_audit_log").insert({
      user_id: userId,
      action: "accept_admin_invite",
      target_type: "admin_invite",
      target_id: invite.id,
      details: { email: invite.email, had_existing_account: hadExistingAccount },
    });

    // 7. Notifica a chi ha invitato: "X è entrato" (best-effort, dedup su invito)
    try {
      if (invite.invited_by) {
        const { data: inviterProfile } = await supabaseAdmin
          .from("profiles")
          .select("id, first_name")
          .eq("id", invite.invited_by)
          .maybeSingle();
        const { data: inviterAuth } = await supabaseAdmin.auth.admin.getUserById(invite.invited_by);
        const inviterEmail = inviterAuth?.user?.email;
        if (inviterEmail) {
          const { sendSystemEmail } = await import("../_shared/systemEmail.ts");
          await sendSystemEmail(supabaseAdmin, {
            templateName: "invite_accepted_admin",
            companyId: null,
            to: inviterEmail,
            userId: invite.invited_by,
            dedupeKey: `invacc:${invite.id}`,
            props: {
              userFirstName: inviterProfile?.first_name || inviterEmail.split("@")[0],
              userFullName: invite.email,
              userRoleLabel: "Amministratore piattaforma",
              ctaUrl: "https://app.ediliziaincloud.com/admin",
            },
          });
        }
      }
    } catch (mailErr) {
      console.warn("[accept-admin-invite] email invite_accepted_admin fallita:", (mailErr as Error)?.message);
    }

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
