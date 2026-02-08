import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CreateEmployeeUserRequest {
  employee_id: string;
  email: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Non autorizzato");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !caller) {
      throw new Error("Non autorizzato");
    }

    // Check if caller is company_admin
    const { data: callerRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (!callerRole || !["company_admin", "super_admin"].includes(callerRole.role)) {
      throw new Error("Permessi insufficienti");
    }

    const { employee_id, email }: CreateEmployeeUserRequest = await req.json();

    if (!employee_id || !email) {
      throw new Error("ID dipendente ed email sono obbligatori");
    }

    // Get employee data
    const { data: employee, error: empError } = await supabaseAdmin
      .from("employees")
      .select("*, company:companies(name)")
      .eq("id", employee_id)
      .single();

    if (empError || !employee) {
      throw new Error("Dipendente non trovato");
    }

    // Check if employee already has a user
    if (employee.user_id) {
      throw new Error("Il dipendente ha già un account utente");
    }

    // Generate temporary password
    const tempPassword = crypto.randomUUID().substring(0, 12);

    // Create auth user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        first_name: employee.first_name,
        last_name: employee.last_name,
      },
    });

    if (createError || !newUser.user) {
      throw new Error(createError?.message || "Errore nella creazione utente");
    }

    // Create profile
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: newUser.user.id,
        email,
        first_name: employee.first_name,
        last_name: employee.last_name,
        company_id: employee.company_id,
        phone: employee.phone,
      });

    if (profileError) {
      // Rollback: delete auth user
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw new Error("Errore nella creazione profilo");
    }

    // Assign employee role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: newUser.user.id,
        role: "employee",
      });

    if (roleError) {
      // Rollback
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw new Error("Errore nell'assegnazione ruolo");
    }

    // Link employee to user
    const { error: linkError } = await supabaseAdmin
      .from("employees")
      .update({ user_id: newUser.user.id })
      .eq("id", employee_id);

    if (linkError) {
      // Rollback
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw new Error("Errore nel collegamento dipendente");
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUser.user.id,
        temp_password: tempPassword,
        message: `Account creato per ${employee.first_name} ${employee.last_name}`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Errore sconosciuto",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
