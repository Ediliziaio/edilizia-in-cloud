import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is authenticated
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { userId, reassignToUserId } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: "userId richiesto" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is admin of the same company
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("company_id")
      .eq("id", caller.id)
      .single();

    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    // Verify caller has admin role
    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const isSuperAdmin = callerRoles?.some(r => r.role === "super_admin");
    const isCompanyAdmin = callerRoles?.some(r => r.role === "company_admin");

    if (!isSuperAdmin && !isCompanyAdmin) {
      return new Response(JSON.stringify({ error: "Solo gli amministratori possono eliminare utenti" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Super admin can delete any user; company admin must be in the same company
    if (!isSuperAdmin) {
      if (!callerProfile || !targetProfile || callerProfile.company_id !== targetProfile.company_id) {
        return new Response(JSON.stringify({ error: "Non autorizzato: azienda diversa" }), {
          status: 403,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }

    // Prevent self-deletion
    if (userId === caller.id) {
      return new Response(JSON.stringify({ error: "Non puoi eliminare te stesso" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // --- Reassign or unlink related records in salespeople, employees, subappaltatori ---
    const affected = { salespeople: 0, employees: 0, subappaltatori: 0 };

    if (reassignToUserId) {
      // SECURITY FIX: valida che il destinatario del reassign sia nella stessa
      // azienda del target. Senza questo check, un admin poteva riassegnare
      // record (es. salespeople, employees) a un utente di un'altra company,
      // bypassando l'isolamento dei dati tenant.
      if (reassignToUserId === userId) {
        return new Response(JSON.stringify({ error: "Il destinatario non può essere lo stesso utente" }), {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const { data: reassignProfile } = await adminClient
        .from("profiles")
        .select("company_id")
        .eq("id", reassignToUserId)
        .single();
      if (!reassignProfile || reassignProfile.company_id !== targetProfile?.company_id) {
        return new Response(JSON.stringify({ error: "Il destinatario del reassign deve appartenere alla stessa azienda" }), {
          status: 403,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      // Reassign records to the new user
      const { data: spData, error: spError } = await adminClient
        .from("salespeople")
        .update({ user_id: reassignToUserId })
        .eq("user_id", userId)
        .select("id");
      if (spError) console.error("Error reassigning salespeople:", spError);
      affected.salespeople = spData?.length ?? 0;

      const { data: empData, error: empError } = await adminClient
        .from("employees")
        .update({ user_id: reassignToUserId })
        .eq("user_id", userId)
        .select("id");
      if (empError) console.error("Error reassigning employees:", empError);
      affected.employees = empData?.length ?? 0;

      const { data: subData, error: subError } = await adminClient
        .from("subappaltatori")
        .update({ user_id: reassignToUserId })
        .eq("user_id", userId)
        .select("id");
      if (subError) console.error("Error reassigning subappaltatori:", subError);
      affected.subappaltatori = subData?.length ?? 0;
    } else {
      // Unlink records (set user_id to null)
      const { data: spData, error: spError } = await adminClient
        .from("salespeople")
        .update({ user_id: null })
        .eq("user_id", userId)
        .select("id");
      if (spError) console.error("Error unlinking salespeople:", spError);
      affected.salespeople = spData?.length ?? 0;

      const { data: empData, error: empError } = await adminClient
        .from("employees")
        .update({ user_id: null })
        .eq("user_id", userId)
        .select("id");
      if (empError) console.error("Error unlinking employees:", empError);
      affected.employees = empData?.length ?? 0;

      const { data: subData, error: subError } = await adminClient
        .from("subappaltatori")
        .update({ user_id: null })
        .eq("user_id", userId)
        .select("id");
      if (subError) console.error("Error unlinking subappaltatori:", subError);
      affected.subappaltatori = subData?.length ?? 0;
    }

    // --- Clean up auxiliary tables ---
    const { error: sessionsError } = await adminClient
      .from("user_sessions")
      .delete()
      .eq("user_id", userId);
    if (sessionsError) console.error("Error deleting user_sessions:", sessionsError);

    const { error: teamError } = await adminClient
      .from("team_members")
      .delete()
      .eq("user_id", userId);
    if (teamError) console.error("Error deleting team_members:", teamError);

    const { error: auditError } = await adminClient
      .from("user_audit_log")
      .delete()
      .eq("target_user_id", userId);
    if (auditError) console.error("Error deleting user_audit_log:", auditError);

    // --- Delete in order: staff_permissions, user_roles, profiles, then auth user ---
    const targetCompanyId = targetProfile?.company_id;
    const { error: permDeleteError } = await adminClient
      .from("staff_permissions")
      .delete()
      .eq("user_id", userId)
      .eq("company_id", targetCompanyId ?? "");
    if (permDeleteError) {
      console.error("Error deleting staff_permissions:", permDeleteError);
    }

    const { error: rolesDeleteError } = await adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", userId);
    if (rolesDeleteError) {
      console.error("Error deleting user_roles:", rolesDeleteError);
    }

    const { error: profileDeleteError } = await adminClient
      .from("profiles")
      .delete()
      .eq("id", userId)
      .eq("company_id", targetCompanyId ?? "");
    if (profileDeleteError) {
      console.error("Error deleting profile:", profileDeleteError);
      return new Response(JSON.stringify({ error: "Errore eliminazione profilo: " + profileDeleteError.message }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      console.error("Error deleting auth user:", deleteAuthError);
      return new Response(JSON.stringify({ error: "Errore eliminazione account: " + deleteAuthError.message }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, affected }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("delete-company-user error:", error);
    return new Response(JSON.stringify({ error: error.message || "Errore interno" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
