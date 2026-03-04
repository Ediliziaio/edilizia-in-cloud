import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateTemporaryPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

type ValidRoleType = "company_admin" | "company_staff" | "salesperson" | "call_center";

function resolveRoles(roleType: ValidRoleType): string[] {
  switch (roleType) {
    case "company_admin":
      return ["company_admin"];
    case "salesperson":
      return ["salesperson", "company_staff"];
    case "call_center":
      return ["call_center", "company_staff"];
    case "company_staff":
    default:
      return ["company_staff"];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !callerUser) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
      return new Response(
        JSON.stringify({ error: "Only company admins can create staff users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", callerId)
      .single();

    const { first_name, last_name, email, company_id, role_type } = await req.json();

    const targetCompanyId = callerRole.role === "super_admin" && company_id
      ? company_id
      : callerProfile?.company_id;

    if (!targetCompanyId) {
      return new Response(
        JSON.stringify({ error: "Company ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!first_name || !last_name || !email) {
      return new Response(
        JSON.stringify({ error: "Nome, cognome e email sono obbligatori" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate and resolve roles
    const validRoleTypes: ValidRoleType[] = ["company_admin", "company_staff", "salesperson", "call_center"];
    const effectiveRoleType: ValidRoleType = validRoleTypes.includes(role_type) ? role_type : "company_staff";
    const rolesToAssign = resolveRoles(effectiveRoleType);

    const temporaryPassword = generateTemporaryPassword();

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
    });

    if (createError) {
      if (createError.message?.toLowerCase().includes("already") || createError.message?.toLowerCase().includes("exists")) {
        return new Response(
          JSON.stringify({ error: "Un utente con questa email esiste già" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("Error creating user:", createError);
      return new Response(
        JSON.stringify({ error: createError.message || "Errore durante la creazione dell'utente" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!newUser.user) {
      return new Response(
        JSON.stringify({ error: "Errore durante la creazione dell'utente" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = newUser.user.id;

    // Helper to clean up on failure
    const cleanup = async () => {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
    };

    // Create profile
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
      return new Response(
        JSON.stringify({ error: "Errore durante la creazione del profilo" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create all user roles
    const roleInserts = rolesToAssign.map((role) => ({ user_id: userId, role }));
    const { error: roleError } = await supabaseAdmin.from("user_roles").insert(roleInserts);

    if (roleError) {
      console.error("Error creating user roles:", roleError);
      await cleanup();
      return new Response(
        JSON.stringify({ error: "Errore durante l'assegnazione del ruolo" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create staff_permissions if user has company_staff role
    if (rolesToAssign.includes("company_staff")) {
      const { error: permError } = await supabaseAdmin.from("staff_permissions").insert({
        user_id: userId,
        company_id: targetCompanyId,
      });

      if (permError) {
        console.error("Error creating permissions:", permError);
        await cleanup();
        return new Response(
          JSON.stringify({ error: "Errore durante la creazione dei permessi" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Create salespeople record if salesperson
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
        // Non-fatal: permissions and roles are already set
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        temporary_password: temporaryPassword,
        role: effectiveRoleType,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Errore interno del server" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
