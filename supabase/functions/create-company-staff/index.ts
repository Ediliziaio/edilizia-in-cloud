import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateSecurePassword } from "../_shared/securePassword.ts";
import { corsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

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

    const { first_name, last_name, email, company_id, role_type } = await req.json();

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
    const validRoleTypes: ValidRoleType[] = ["company_admin", "company_staff", "salesperson", "call_center"];
    const effectiveRoleType: ValidRoleType = validRoleTypes.includes(role_type) ? role_type : "company_staff";
    const rolesToAssign = resolveRoles(effectiveRoleType);

    // Secure password generation
    const temporaryPassword = generateSecurePassword(12);

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
      }
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
